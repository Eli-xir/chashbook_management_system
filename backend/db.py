"""One synchronous connection/transaction per request; no ORM or background jobs."""
import hashlib
import hmac
import os
import secrets
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
UPLOADS = ROOT / 'uploads'


def connect():
    return psycopg.connect(os.getenv('DATABASE_URL', 'postgresql://cashbook:cashbook_local@127.0.0.1:5433/cashbook'), row_factory=dict_row, connect_timeout=5)


def password_hash(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f'{salt}:{digest}'


def password_matches(password, stored):
    salt, expected = stored.split(':')
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)


def initialize():
    UPLOADS.mkdir(exist_ok=True)
    with connect() as db:
        db.execute('SELECT pg_advisory_xact_lock(724001)')
        if db.execute("SELECT to_regclass('public.schema_version') AS name").fetchone()['name'] is None:
            if db.execute("SELECT to_regclass('public.users') AS name").fetchone()['name'] is not None:
                raise RuntimeError('Older schema found. Use the fresh database/compose.yaml volume; existing data was not changed.')
            db.execute((ROOT.parent / 'database' / 'db_init.sql').read_text(encoding='utf-8'))
        if db.execute('SELECT max(version) AS version FROM schema_version').fetchone()['version'] < 2:
            db.execute('ALTER TABLE category_groups ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true')
            db.execute('ALTER TABLE heads ALTER COLUMN head_name TYPE varchar(160)')
            db.execute('INSERT INTO schema_version VALUES (2)')
        if db.execute('SELECT max(version) AS version FROM schema_version').fetchone()['version'] < 3:
            db.execute((ROOT.parent / 'database/migrations/003_descriptions_permissions.sql').read_text(encoding='utf-8'))
        if not db.execute('SELECT 1 FROM users WHERE user_role_id = 1').fetchone():
            password = os.getenv('ADMIN_PASSWORD', '')
            if not password or password == 'replace-with-your-password':
                raise RuntimeError('Set ADMIN_PASSWORD in backend/.env before first startup.')
            db.execute('INSERT INTO users(user_name,password_hash,user_role_id) VALUES (%s,%s,1)', ('Sohail Malik', password_hash(password)))
