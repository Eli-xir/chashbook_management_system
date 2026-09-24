"""Run locally: uvicorn main:app --reload"""
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import Depends, FastAPI, File, Form, Request, Response, UploadFile
from fastapi.responses import JSONResponse

from db import UPLOADS, connect, initialize, password_hash, password_matches
from models import Change, Login
from service import apply_change, attachment, overview, require, state
import storage

COOKIE = 'cashbook_session'
DUMMY_HASH = password_hash('no-account')


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(title='Cashbook', lifespan=lifespan)


@app.middleware('http')
async def same_origin_mutations(request: Request, call_next):
    # Cross-origin forms cannot set this header, and the API does not enable CORS.
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('x-cashbook') != '1':
        return JSONResponse({'detail': 'Use the Cashbook application to make changes.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.exception_handler(psycopg.IntegrityError)
async def constraint_error(request, error):
    messages = {'unique_active_username': 'An active user already has that name.',
                'unique_live_head_name': 'A head with that name already exists.',
                'category_groups_category_group_name_key': 'That category already exists.'}
    return JSONResponse({'detail': messages.get(error.diag.constraint_name, 'This change conflicts with existing records. Refresh and try again.')}, status_code=409)


@app.exception_handler(psycopg.OperationalError)
async def database_error(request, error):
    return JSONResponse({'detail': 'Database unavailable. Make sure the PostgreSQL container is running.'}, status_code=503)


def database():
    with connect() as db:
        yield db


DB = Annotated[psycopg.Connection, Depends(database)]


def session_id(request):
    try:
        return UUID(request.cookies.get(COOKIE, ''))
    except ValueError:
        return None


def session_user(db, request):
    return db.execute('''SELECT u.* FROM sessions s JOIN users u USING(user_id)
        WHERE s.session_id=%s AND s.expiry_date>now() AND u.is_active''', (session_id(request),)).fetchone()


def authenticated(request: Request, db: DB):
    actor = session_user(db, request)
    require(actor, 'Your session expired. Please log in again.', 401)
    return actor


Actor = Annotated[dict, Depends(authenticated)]


def session_view(actor):
    return {'userId': str(actor['user_id']), 'role': 'admin' if actor['user_role_id'] == 1 else 'user'} if actor else None


@app.get('/api/session')
def current_session(request: Request, db: DB):
    return session_view(session_user(db, request))


@app.post('/api/session')
def sign_in(value: Login, request: Request, response: Response, db: DB):
    user = db.execute('SELECT * FROM users WHERE is_active AND user_name=%s', (value.username,)).fetchone()
    if not user and value.username.lower() == 'admin':
        user = db.execute('SELECT * FROM users WHERE is_active AND user_role_id=1 ORDER BY user_id LIMIT 1').fetchone()
    valid = password_matches(value.password, user['password_hash'] if user else DUMMY_HASH)
    require(user and valid, 'Incorrect username or password.', 401)
    db.execute('DELETE FROM sessions WHERE session_id=%s OR expiry_date<=now()', (session_id(request),))
    sid = db.execute('INSERT INTO sessions(user_id) VALUES (%s) RETURNING session_id', (user['user_id'],)).fetchone()['session_id']
    response.set_cookie(COOKIE, str(sid), max_age=7*24*60*60, httponly=True, samesite='strict',
                        secure=os.getenv('COOKIE_SECURE', 'false').lower() == 'true', path='/')
    return session_view(user)


@app.delete('/api/session')
def sign_out(request: Request, response: Response, db: DB):
    db.execute('DELETE FROM sessions WHERE session_id=%s', (session_id(request),))
    response.delete_cookie(COOKIE, path='/')
    return {'applied': True}


@app.get('/api/state')
def read_state(request: Request, db: DB, userId: UUID | None = None):
    # Keep the small multi-query response consistent with concurrent edits/deletes.
    db.execute('SELECT pg_advisory_xact_lock_shared(724002)')
    actor = authenticated(request, db)
    if userId is not None:
        require(actor['user_role_id'] == 1 or actor['user_id'] == userId, 'You can only view your own ledger.', 403)
        return overview(db, userId)
    return state(db, actor)


@app.post('/api/changes')
def changes(value: Change, request: Request, db: DB):
    # Serialize tiny local writes so a merge, permission change, or deletion cannot
    # race a submission. No worker/queue infrastructure is needed.
    db.execute('SELECT pg_advisory_xact_lock(724002)')
    actor = authenticated(request, db)
    result = apply_change(db, actor, value, session_id(request))
    db.commit()  # Surface deferred constraints before returning a success response.
    return result


MEDIA_TYPES = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
    'webp': 'image/webp', 'bmp': 'image/bmp', 'heic': 'image/heic', 'heif': 'image/heif', 'avif': 'image/avif',
    'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'mp4': 'audio/mp4', 'aac': 'audio/aac',
    'wav': 'audio/wav', 'ogg': 'audio/ogg', 'webm': 'audio/webm', 'flac': 'audio/flac',
}


def matches_file(data, ext):
    if ext in ('jpg', 'jpeg'): return data.startswith(b'\xff\xd8\xff')
    if ext == 'png': return data.startswith(b'\x89PNG\r\n\x1a\n')
    if ext == 'gif': return data.startswith((b'GIF87a', b'GIF89a'))
    if ext in ('webp', 'wav'): return data[:4] == b'RIFF' and data[8:12] == (b'WEBP' if ext == 'webp' else b'WAVE')
    if ext == 'bmp': return data.startswith(b'BM')
    if ext in ('heic', 'heif', 'avif', 'm4a', 'mp4'): return data[4:8] == b'ftyp'
    if ext == 'ogg': return data.startswith(b'OggS')
    if ext == 'webm': return data.startswith(b'\x1aE\xdf\xa3')
    if ext == 'flac': return data.startswith(b'fLaC')
    if ext in ('mp3', 'aac'): return data.startswith(b'ID3') or (len(data) > 1 and data[0] == 255 and data[1] & 224 == 224)
    return False


@app.post('/api/attachments')
def upload(db: DB, actor: Actor, file: Annotated[UploadFile, File()], kind: Annotated[Literal['image', 'voice'], Form()]):
    name = (file.filename or 'attachment').replace('\\', '/').split('/')[-1][:255]
    ext = Path(name).suffix.lower().lstrip('.')
    type_id = 1 if kind == 'image' else 2
    extension = db.execute('SELECT extension_id FROM allowed_extensions WHERE attachment_type_id=%s AND extension_name=%s', (type_id, ext)).fetchone()
    require(extension, 'Unsupported file type. Choose an image or audio file.')
    content = file.file.read(5 * 1024 * 1024 + 1)
    require(0 < len(content) <= 5 * 1024 * 1024, 'Each attachment must be between 1 byte and 5 MB.')
    require(matches_file(content, ext), 'The file contents do not match its image/audio extension.')
    row = db.execute('''INSERT INTO attachments(attachment_type_id,extension_id,attachment_url,original_name,content_type,uploaded_by)
        VALUES (%s,%s,'',%s,%s,%s) RETURNING *''', (type_id, extension['extension_id'], name, MEDIA_TYPES[ext], actor['user_id'])).fetchone()
    filename = f"{row['attachment_id']}.{ext}"
    key = None
    try:
        key = storage.save(content, filename, kind, MEDIA_TYPES[ext])
        db.execute('UPDATE attachments SET attachment_url=%s WHERE attachment_id=%s', (key, row['attachment_id']))
        db.commit()
    except Exception:
        if key:
            storage.remove(key)
        raise
    return attachment(row)


@app.get('/api/attachments/{attachment_id}')
def download_attachment(attachment_id: int, db: DB, actor: Actor):
    row = db.execute('SELECT * FROM attachments WHERE attachment_id=%s', (attachment_id,)).fetchone()
    require(row, 'Attachment not found.', 404)
    if actor['user_role_id'] != 1:
        allowed = db.execute('''SELECT 1 FROM heads h JOIN user_head_permissions p USING(head_id)
            WHERE h.attachment_id=%s AND h.is_active AND NOT h.is_deleted AND p.user_id=%s
            UNION ALL SELECT 1 FROM transactions t JOIN transaction_version_attachments va ON va.version_id=t.current_version_id
            WHERE va.attachment_id=%s AND t.user_id=%s AND t.created_by_user_id<>t.user_id AND t.is_active
            UNION ALL SELECT 1 FROM attachments a WHERE a.attachment_id=%s AND a.uploaded_by=%s AND NOT a.is_submitted
            AND NOT EXISTS(SELECT 1 FROM transaction_version_attachments va WHERE va.attachment_id=a.attachment_id)
            AND NOT EXISTS(SELECT 1 FROM heads h WHERE h.attachment_id=a.attachment_id) LIMIT 1''',
            (attachment_id, actor['user_id'])*3).fetchone()
        require(allowed, 'Attachment not found.', 404)
    if not storage.BUCKET:
        require((UPLOADS / row['attachment_url']).is_file(), 'Attachment file is missing.', 404)
    return storage.response(row)
