import uuid
import re

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional

from .. import heads_service, otp, security
from ..db import pool
from ..deps import admin_user, check_csrf, error

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(check_csrf)])

VALID_ROLES = {"admin", "debit_user", "credit_user"}


def normalize_phone(number: str) -> str:
    digits = re.sub(r"[\s()+-]", "", number)
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = "92" + digits[1:]
    if not digits.isdigit() or not 7 <= len(digits) <= 15:
        raise error(400, "Enter a valid phone number, for example +92 370 9676552")
    return "+" + digits


class PermissionBody(BaseModel):
    head_id: int
    granted: bool


class UserCreateBody(BaseModel):
    username: str = Field(min_length=3, max_length=48, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=128)
    role: str
    recovery_number: Optional[str] = Field(default=None, max_length=24)


class UserUpdateBody(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    recovery_number: Optional[str] = Field(default=None, max_length=24)
    remove_recovery_number: bool = False


class ContactBody(BaseModel):
    contact_no: str = Field(min_length=4, max_length=24)


async def _ensure_role(conn, role: str) -> int:
    if role not in VALID_ROLES:
        raise error(400, "Unknown role")
    return await conn.fetchval("SELECT user_role_id FROM User_roles WHERE user_role_name = $1", role)


async def _set_recovery_number(conn, user_id, number: str) -> None:
    """First contact is the designated recovery number; unique across accounts."""
    await conn.execute("SELECT pg_advisory_xact_lock(7310202)")
    number = normalize_phone(number)
    clash = await conn.fetchrow(
        """
        SELECT c.contact_id FROM Contacts c
        WHERE regexp_replace(regexp_replace(c.contact_no, '[^0-9]', '', 'g'), '^0', '92') = $1 AND c.user_id <> $2
        """,
        number.lstrip('+'), user_id,
    )
    if clash:
        raise error(409, "This recovery number is already used by another account")
    existing = await conn.fetchval(
        "SELECT contact_id FROM Contacts WHERE user_id = $1 ORDER BY contact_id LIMIT 1", user_id)
    if existing:
        await conn.execute("UPDATE Contacts SET contact_no = $2 WHERE contact_id = $1", existing, number)
    else:
        from .. import idgen
        contact_id = await idgen.next_id("contacts")
        await conn.execute(
            "INSERT INTO Contacts (contact_id, contact_no, user_id) VALUES ($1, $2, $3)",
            contact_id, number, user_id)


@router.get("")
async def list_users(admin: dict = Depends(admin_user)):
    rows = await pool().fetch(
        """
        SELECT u.user_id, u.user_name, u.user_role_id, u.is_active, r.user_role_name,
               c.contact_no AS recovery_number,
               (SELECT COUNT(*) FROM Sessions s WHERE s.user_id = u.user_id) AS active_sessions
        FROM Users u
        JOIN User_roles r ON r.user_role_id = u.user_role_id
        LEFT JOIN LATERAL (
            SELECT contact_no FROM Contacts WHERE user_id = u.user_id ORDER BY contact_id LIMIT 1
        ) c ON true
        ORDER BY u.user_name
        """
    )
    return [dict(r) | {"user_id": str(r["user_id"])} for r in rows]


@router.post("")
async def create_user(body: UserCreateBody, admin: dict = Depends(admin_user)):
    async with pool().acquire() as conn:
        async with conn.transaction():
            role_id = await _ensure_role(conn, body.role)
            existing = await conn.fetchval("SELECT 1 FROM Users WHERE user_name = $1", body.username)
            if existing:
                raise error(409, "Username already taken")
            user_id = await conn.fetchval(
                "INSERT INTO Users (user_name, password_hash, user_role_id) VALUES ($1, $2, $3) RETURNING user_id",
                body.username, security.hash_password(body.password), role_id)
            if body.recovery_number:
                await _set_recovery_number(conn, user_id, body.recovery_number)
    return {"user_id": str(user_id)}


@router.get("/{user_id}")
async def get_user(user_id: uuid.UUID, admin: dict = Depends(admin_user)):
    row = await pool().fetchrow(
        """
        SELECT u.user_id, u.user_name, u.is_active, r.user_role_name,
               c.contact_no AS recovery_number,
               (SELECT contact_id FROM Contacts WHERE user_id = u.user_id ORDER BY contact_id LIMIT 1) AS recovery_contact_id
        FROM Users u
        JOIN User_roles r ON r.user_role_id = u.user_role_id
        LEFT JOIN LATERAL (
            SELECT contact_no FROM Contacts WHERE user_id = u.user_id ORDER BY contact_id LIMIT 1
        ) c ON true
        WHERE u.user_id = $1
        """,
        user_id)
    if row is None:
        raise error(404, "User not found")
    contacts = await pool().fetch(
        "SELECT contact_id, contact_no FROM Contacts WHERE user_id = $1 ORDER BY contact_id", user_id)
    return dict(row) | {
        "user_id": str(row["user_id"]),
        "contacts": [dict(c) for c in contacts],
    }


@router.patch("/{user_id}")
async def update_user(user_id: uuid.UUID, body: UserUpdateBody, admin: dict = Depends(admin_user),
                      request: Request = None):
    await check_csrf(request)
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(7310202)")
            target = await conn.fetchrow(
                """
                SELECT u.user_id, u.user_name, u.is_active, r.user_role_name
                FROM Users u JOIN User_roles r ON r.user_role_id = u.user_role_id
                WHERE u.user_id = $1
                """,
                user_id)
            if target is None:
                raise error(404, "User not found")

            new_role = body.role
            becoming_inactive = body.is_active is False
            losing_admin = target["user_role_name"] == "admin" and (
                becoming_inactive
                or (new_role is not None and new_role != "admin")
            )
            if losing_admin:
                others = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM Users u JOIN User_roles r ON r.user_role_id = u.user_role_id
                    WHERE r.user_role_name = 'admin' AND u.is_active AND u.user_id <> $1
                    """,
                    user_id)
                if others == 0:
                    raise error(400, "Cannot remove the last active admin")

            if body.new_password:
                await conn.execute("UPDATE Users SET password_hash = $1 WHERE user_id = $2",
                                   security.hash_password(body.new_password), user_id)
                await conn.execute("DELETE FROM Sessions WHERE user_id = $1", user_id)
                otp.invalidate_user(str(user_id))
            if new_role is not None and new_role != target["user_role_name"]:
                role_id = await _ensure_role(conn, new_role)
                await conn.execute("UPDATE Users SET user_role_id = $1 WHERE user_id = $2",
                                   role_id, user_id)
                # Role affects future submissions: existing sessions must re-validate.
                await conn.execute("DELETE FROM Sessions WHERE user_id = $1", user_id)
                otp.invalidate_user(str(user_id))
            if body.is_active is not None and body.is_active != target["is_active"]:
                now_active = body.is_active
                if not now_active:
                    await conn.execute("DELETE FROM Sessions WHERE user_id = $1", user_id)
                    otp.invalidate_user(str(user_id))
                await conn.execute(
                    "UPDATE Users SET is_active = $2, last_activated_at = CASE WHEN $2 THEN now() ELSE last_activated_at END, "
                    "last_deactivated_at = CASE WHEN $2 THEN last_deactivated_at ELSE now() END WHERE user_id = $1",
                    user_id, now_active)
            if body.remove_recovery_number:
                await conn.execute("DELETE FROM Contacts WHERE user_id = $1", user_id)
                otp.invalidate_user(str(user_id))
            elif body.recovery_number:
                await _set_recovery_number(conn, user_id, body.recovery_number)
                otp.invalidate_user(str(user_id))
    return {"ok": True}


@router.post("/{user_id}/permissions")
async def set_permission(user_id: uuid.UUID, body: PermissionBody, admin: dict = Depends(admin_user)):
    async with pool().acquire() as conn:
        async with conn.transaction():
            user = await conn.fetchrow("SELECT user_id FROM Users WHERE user_id = $1", user_id)
            if user is None:
                raise error(404, "User not found")
            await heads_service.validate_heads_exist(conn, [body.head_id])
            if body.granted:
                await conn.execute(
                    "INSERT INTO User_head_permissions (head_id, user_id) VALUES ($1, $2) "
                    "ON CONFLICT DO NOTHING", body.head_id, user_id)
            else:
                await conn.execute(
                    "DELETE FROM User_head_permissions WHERE head_id = $1 AND user_id = $2",
                    body.head_id, user_id)
    return {"ok": True}


@router.get("/{user_id}/permissions")
async def get_permissions(user_id: uuid.UUID, admin: dict = Depends(admin_user)):
    target = await pool().fetchrow("SELECT user_id FROM Users WHERE user_id = $1", user_id)
    if target is None:
        raise error(404, "User not found")
    async with pool().acquire() as conn:
        direct = await conn.fetch(
            "SELECT head_id FROM User_head_permissions WHERE user_id = $1", user_id)
        effective = await heads_service.effective_head_ids(conn, user_id)
    return {"direct": [r["head_id"] for r in direct], "effective": sorted(effective)}


@router.post("/{user_id}/contacts")
async def add_contact(user_id: uuid.UUID, body: ContactBody, admin: dict = Depends(admin_user)):
    from .. import idgen
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(7310202)")
            body.contact_no = normalize_phone(body.contact_no)
            clash = await conn.fetchval("SELECT 1 FROM Contacts WHERE regexp_replace(regexp_replace(contact_no, '[^0-9]', '', 'g'), '^0', '92') = $1 AND user_id <> $2", body.contact_no.lstrip('+'), user_id)
            if clash:
                raise error(409, "This number is already used by another account")
            exists = await conn.fetchval("SELECT 1 FROM Users WHERE user_id = $1", user_id)
            if not exists:
                raise error(404, "User not found")
            has_recovery = await conn.fetchval(
                "SELECT 1 FROM Contacts WHERE user_id = $1", user_id)
            if not has_recovery:
                # The first contact added becomes the designated recovery number.
                await _set_recovery_number(conn, user_id, body.contact_no)
            else:
                contact_id = await idgen.next_id("contacts")
                await conn.execute(
                    "INSERT INTO Contacts (contact_id, contact_no, user_id) VALUES ($1, $2, $3)",
                    contact_id, body.contact_no, user_id)
    return {"ok": True}
