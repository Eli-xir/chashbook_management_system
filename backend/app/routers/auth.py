import secrets
import uuid

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from .. import otp, security
from ..deps import (
    ROLE_ADMIN, any_user, check_csrf, clear_auth_cookies, current_user,
    error, set_auth_cookies,
)
from ..db import pool

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=48)
    password: str = Field(min_length=1, max_length=128)


class ForgotBody(BaseModel):
    username: str = Field(min_length=1, max_length=48)


class VerifyBody(BaseModel):
    username: str = Field(min_length=1, max_length=48)
    challenge_id: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=4, max_length=8)


class ResetBody(BaseModel):
    username: str = Field(min_length=1, max_length=48)
    grant_id: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=6, max_length=128)


class PasswordChangeBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    row = await pool().fetchrow(
        """
        SELECT u.user_id, u.password_hash, u.is_active, r.user_role_name
        FROM Users u JOIN User_roles r ON r.user_role_id = u.user_role_id
        WHERE u.user_name = $1
        """,
        body.username,
    )
    # Generic failure avoids username enumeration.
    if row is None or not security.verify_password(body.password, row["password_hash"]):
        raise error(401, "Wrong username or password")
    if not row["is_active"]:
        raise error(403, "This account is inactive. Contact your admin.")

    async with pool().acquire() as conn:
        session_id, csrf_token = await security.create_session(conn, row["user_id"])
    set_auth_cookies(response, session_id, csrf_token)
    return {"user_id": str(row["user_id"]), "username": body.username, "role": row["user_role_name"]}


@router.post("/logout")
async def logout(request: Request, response: Response):
    raw = request.cookies.get(security.SESSION_COOKIE)
    if raw:
        try:
            await security.revoke_session(uuid.UUID(raw))
        except ValueError:
            pass
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return {
        "user_id": str(user["user_id"]),
        "username": user["user_name"],
        "role": user["user_role_name"],
    }


@router.post("/change-password")
async def change_password(body: PasswordChangeBody, request: Request, response: Response,
                          user: dict = Depends(any_user)):
    await check_csrf(request)
    if not security.verify_password(body.current_password, user["password_hash"]):
        raise error(401, "Current password is wrong")
    new_hash = security.hash_password(body.new_password)
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("UPDATE Users SET password_hash = $1 WHERE user_id = $2",
                               new_hash, user["user_id"])
            # Invalidate all other sessions, keep the current one alive.
            await conn.execute("DELETE FROM Sessions WHERE user_id = $1 AND session_id <> $2",
                               user["user_id"], uuid.UUID(request.cookies[security.SESSION_COOKIE]))
    otp.invalidate_user(str(user["user_id"]))
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody, request: Request):
    """Always returns the same shape; sends OTP only if the account is active
    with a recovery number. The challenge_id is not secret; the code is."""
    challenge_id = secrets.token_urlsafe(24)  # dummy, unused when no challenge exists
    row = await pool().fetchrow(
        """
        SELECT u.user_id, u.is_active, c.contact_no
        FROM Users u
        LEFT JOIN Contacts c ON c.user_id = u.user_id
        WHERE u.user_name = $1
        ORDER BY c.contact_id
        """,
        body.username,
    )
    if row is not None and row["is_active"] and row["contact_no"]:
        try:
            challenge_id = otp.send_otp(str(row["user_id"]), row["contact_no"], _client_ip(request))
        except Exception:
            pass  # uniform response; local console shows the actual error
    return {"ok": True, "challenge_id": challenge_id}


@router.post("/verify-otp")
async def verify_otp(body: VerifyBody):
    row = await pool().fetchrow(
        "SELECT user_id, is_active FROM Users WHERE user_name = $1", body.username
    )
    if row is None or not row["is_active"]:
        raise error(400, "Invalid or expired code")
    grant_id = otp.verify_otp(str(row["user_id"]), body.challenge_id, body.code)
    return {"grant_id": grant_id}


@router.post("/reset-password")
async def reset_password(body: ResetBody, response: Response):
    row = await pool().fetchrow(
        """
        SELECT u.user_id, u.is_active, r.user_role_name
        FROM Users u JOIN User_roles r ON r.user_role_id = u.user_role_id
        WHERE u.user_name = $1
        """,
        body.username,
    )
    if row is None or not row["is_active"]:
        # Inactive users cannot recover into an active session.
        raise error(400, "Reset session expired. Start again.")
    otp.consume_grant(body.grant_id, str(row["user_id"]))

    new_hash = security.hash_password(body.new_password)
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("UPDATE Users SET password_hash = $1 WHERE user_id = $2",
                               new_hash, row["user_id"])
            # Atomic with the change: kill old sessions/challenges, create the new session.
            await conn.execute("DELETE FROM Sessions WHERE user_id = $1", row["user_id"])
            session_id, csrf_token = await security.create_session(conn, row["user_id"])
    otp.invalidate_user(str(row["user_id"]))
    set_auth_cookies(response, session_id, csrf_token)
    return {"user_id": str(row["user_id"]), "username": body.username, "role": row["user_role_name"]}
