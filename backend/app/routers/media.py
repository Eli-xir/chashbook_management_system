"""Upload staging, ownership, and authorized retrieval.

Owner decision: no schema additions, so draft ownership lives in a process-local
map (JSON-persisted). Rows in Images/Voice_notes are created at upload time so
transactions can reference them; drafts not attached within a cleanup window are
swept on backend startup. Deleting a transaction never deletes files here —
attachment rows are shared metadata and remain referenced-safe.
"""

import json
import os
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse

from .. import idgen, storage
from ..db import pool
from ..deps import ROLE_ADMIN, admin_user, any_user, check_csrf, current_user, error

router = APIRouter(prefix="/media", tags=["media"])

_STATE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".media_state.json")
DRAFT_TTL_SECONDS = 24 * 60 * 60

_media: dict[str, dict[int, dict]] = {"images": {}, "voice_notes": {}}
_loaded = False


def _load() -> None:
    global _loaded
    if _loaded:
        return
    if os.path.exists(_STATE_FILE):
        try:
            with open(_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for kind in ("images", "voice_notes"):
                _media[kind].update({int(k): v for k, v in data.get(kind, {}).items()})
        except (json.JSONDecodeError, OSError, ValueError):
            pass
    _loaded = True


def _persist() -> None:
    with open(_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(_media, f)


def mark_attached(kind: str, media_id: int) -> None:
    _load()
    entry = _media.get(kind, {}).get(media_id)
    if entry is not None and entry["status"] == "draft":
        entry["status"] = "attached"
        _persist()


def is_owned_by(kind: str, media_id: int, user_id) -> bool:
    """True only when the media is a draft uploaded by this user."""
    _load()
    entry = _media.get(kind, {}).get(media_id)
    return entry is not None and entry["owner"] == str(user_id)


async def sweep_orphaned_drafts() -> int:
    """Startup cleanup for abandoned drafts: rows + files older than the TTL."""
    _load()
    now = time.time()
    removed = 0
    for kind, table, col in (("images", "Images", "image_id"), ("voice_notes", "Voice_notes", "voice_id")):
        for mid, entry in list(_media[kind].items()):
            if entry["status"] == "draft" and now - entry["uploaded_at"] > DRAFT_TTL_SECONDS:
                storage.delete_stored(entry["object_name"])
                await pool().execute(f"DELETE FROM {table} WHERE {col} = $1", mid)
                del _media[kind][mid]
                removed += 1
    if removed:
        _persist()
    return removed


async def _save_media_row(upload: UploadFile, kind: str, user: dict) -> dict:
    meta = await storage.save_upload(upload, kind)
    table, col = ("Images", "image_id") if kind == "image" else ("Voice_notes", "voice_id")
    media_id = await idgen.next_id("images" if kind == "image" else "voice_notes")
    await pool().execute(
        f"INSERT INTO {table} ({col}, { 'image_url' if kind == 'image' else 'voice_url'}) VALUES ($1, $2)",
        media_id, meta["object_name"])
    _load()
    _media["images" if kind == "image" else "voice_notes"][media_id] = {
        "owner": str(user["user_id"]),
        "status": "draft",
        "object_name": meta["object_name"],
        "uploaded_at": time.time(),
    }
    _persist()
    return {"image_id" if kind == "image" else "voice_id": media_id}


@router.post("/images")
async def upload_image(request: Request, file: UploadFile = File(...),
                       user: dict = Depends(any_user)):
    await check_csrf(request)
    return await _save_media_row(file, "image", user)


@router.post("/voice")
async def upload_voice(request: Request, file: UploadFile = File(...),
                       user: dict = Depends(any_user)):
    await check_csrf(request)
    return await _save_media_row(file, "voice", user)


@router.delete("/images/{image_id}")
async def delete_draft_image(image_id: int, request: Request, user: dict = Depends(any_user)):
    await check_csrf(request)
    await _delete_draft("images", "Images", "image_id", image_id, user)
    return {"ok": True}


@router.delete("/voice/{voice_id}")
async def delete_draft_voice(voice_id: int, request: Request, user: dict = Depends(any_user)):
    await check_csrf(request)
    await _delete_draft("voice_notes", "Voice_notes", "voice_id", voice_id, user)
    return {"ok": True}


async def _delete_draft(kind: str, table: str, col: str, media_id: int, user: dict) -> None:
    _load()
    entry = _media[kind].get(media_id)
    if entry is None or entry["status"] != "draft":
        raise error(404, "Draft not found")
    if entry["owner"] != str(user["user_id"]) and user["user_role_name"] != ROLE_ADMIN:
        raise error(403, "Not your draft")
    storage.delete_stored(entry["object_name"])
    await pool().execute(f"DELETE FROM {table} WHERE {col} = $1", media_id)
    del _media[kind][media_id]
    _persist()


async def _authorised_for_file(user: dict, kind: str, media_id: int) -> dict:
    """Owner sees their drafts; admins see everything; attached media is admin-only
    (regular users keep no historical transaction access after submission)."""
    _load()
    entry = _media[kind].get(media_id)
    if user["user_role_name"] == ROLE_ADMIN:
        if entry is None:
            # Attached before this process started; verify the row exists.
            table, col = ("Images", "image_id") if kind == "images" else ("Voice_notes", "voice_id")
            row = await pool().fetchrow(f"SELECT 1 FROM {table} WHERE {col} = $1", media_id)
            if row is None:
                raise error(404, "File not found")
            return {"status": "attached", "object_name": None}
        return entry
    if entry is None or entry["owner"] != str(user["user_id"]) or entry["status"] != "draft":
        raise error(403, "Not available")
    return entry


@router.get("/images/{image_id}/file")
async def get_image_file(image_id: int, user: dict = Depends(any_user)):
    entry = await _authorised_for_file(user, "images", image_id)
    if entry.get("object_name") is None:
        row = await pool().fetchrow("SELECT image_url FROM Images WHERE image_id = $1", image_id)
        if row is None:
            raise error(404, "File not found")
        entry = {"object_name": row["image_url"]}
    path = storage.open_stored(entry["object_name"])
    return FileResponse(path)


@router.get("/voice/{voice_id}/file")
async def get_voice_file(voice_id: int, user: dict = Depends(any_user)):
    entry = await _authorised_for_file(user, "voice_notes", voice_id)
    if entry.get("object_name") is None:
        row = await pool().fetchrow("SELECT voice_url FROM Voice_notes WHERE voice_id = $1", voice_id)
        if row is None:
            raise error(404, "File not found")
        entry = {"object_name": row["voice_url"]}
    path = storage.open_stored(entry["object_name"])
    return FileResponse(path)
