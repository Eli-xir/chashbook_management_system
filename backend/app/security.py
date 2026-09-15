import uuid
from datetime import datetime, timedelta, timezone

import bcrypt

from . import db
from .config import settings

SESSION_COOKIE = "cashbook_session"
CSRF_COOKIE = "cashbook_csrf"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


async def create_session(conn, user_id: uuid.UUID) -> tuple[uuid.UUID, str]:
    """Creates a session row and returns (session_id, csrf_token)."""
    session_id = uuid.uuid4()
    csrf_token = uuid.uuid4().hex + uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(minutes=settings.session_ttl_minutes)
    await conn.execute(
        "INSERT INTO Sessions (session_id, user_id, expiry_date, created_at) VALUES ($1, $2, $3, $4)",
        session_id, user_id, expiry, now,
    )
    return session_id, csrf_token


async def revoke_session(session_id: uuid.UUID) -> None:
    await db.pool().execute("DELETE FROM Sessions WHERE session_id = $1", session_id)


async def revoke_user_sessions(user_id: uuid.UUID) -> None:
    await db.pool().execute("DELETE FROM Sessions WHERE user_id = $1", user_id)


async def get_session_user(session_id: uuid.UUID | None):
    """Returns dict with user + session data, or None. Expired sessions are removed."""
    if session_id is None:
        return None
    row = await db.pool().fetchrow(
        """
        SELECT u.user_id, u.user_name, u.user_role_id, u.is_active, u.password_hash,
               r.user_role_name, s.session_id, s.expiry_date
        FROM Sessions s
        JOIN Users u ON u.user_id = s.user_id
        JOIN User_roles r ON r.user_role_id = u.user_role_id
        WHERE s.session_id = $1
        """,
        session_id,
    )
    if row is None:
        return None
    if row["expiry_date"] <= datetime.now(timezone.utc):
        await revoke_session(session_id)
        return None
    if not row["is_active"]:
        await revoke_session(session_id)
        return None
    return dict(row)
