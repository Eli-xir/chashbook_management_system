"""Settings: admin account and payment-medium management.

Transaction types and roles are fixed system values and are not editable here.
Referenced lookup rows are never hard-deleted.
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional

from .. import idgen, security
from ..db import pool
from ..deps import admin_user, check_csrf, current_user, error

router = APIRouter(prefix="/settings", tags=["settings"])


class MediumCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=48)


class MediumUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=48)


@router.get("/payment-mediums")
async def list_mediums(admin: dict = Depends(admin_user)):
    rows = await pool().fetch(
        """
        SELECT m.payment_medium_id, m.payment_medium_name,
               (SELECT COUNT(*) FROM Transaction_versions v WHERE v.payment_medium_id = m.payment_medium_id) AS reference_count
        FROM Payment_mediums m ORDER BY m.payment_medium_id
        """
    )
    return [dict(r) for r in rows]


@router.post("/payment-mediums")
async def create_medium(body: MediumCreateBody, request: Request, admin: dict = Depends(admin_user)):
    await check_csrf(request)
    async with pool().acquire() as conn:
        existing = await conn.fetchval(
            "SELECT 1 FROM Payment_mediums WHERE payment_medium_name = $1", body.name)
        if existing:
            raise error(409, "A payment medium with this name already exists")
        medium_id = await idgen.next_id("payment_mediums")
        await conn.execute(
            "INSERT INTO Payment_mediums (payment_medium_id, payment_medium_name) VALUES ($1, $2)",
            medium_id, body.name)
    return {"payment_medium_id": medium_id}


@router.patch("/payment-mediums/{medium_id}")
async def rename_medium(medium_id: int, body: MediumUpdateBody, request: Request,
                        admin: dict = Depends(admin_user)):
    await check_csrf(request)
    row = await pool().fetchrow(
        "SELECT payment_medium_id FROM Payment_mediums WHERE payment_medium_id = $1", medium_id)
    if row is None:
        raise error(404, "Payment medium not found")
    clash = await pool().fetchval(
        "SELECT 1 FROM Payment_mediums WHERE payment_medium_name = $1 AND payment_medium_id <> $2",
        body.name, medium_id)
    if clash:
        raise error(409, "A payment medium with this name already exists")
    await pool().execute(
        "UPDATE Payment_mediums SET payment_medium_name = $2 WHERE payment_medium_id = $1",
        medium_id, body.name)
    return {"ok": True}


@router.delete("/payment-mediums/{medium_id}")
async def delete_medium(medium_id: int, request: Request, admin: dict = Depends(admin_user)):
    """Hard delete only when unreferenced; referenced mediums are never removed."""
    await check_csrf(request)
    referenced = await pool().fetchval(
        "SELECT 1 FROM Transaction_versions WHERE payment_medium_id = $1", medium_id)
    if referenced:
        raise error(409, "This payment medium is used by existing transactions and cannot be deleted")
    row = await pool().execute("DELETE FROM Payment_mediums WHERE payment_medium_id = $1", medium_id)
    if row == "DELETE 0":
        raise error(404, "Payment medium not found")
    return {"ok": True}


@router.get("/roles")
async def list_roles(admin: dict = Depends(admin_user)):
    rows = await pool().fetch("SELECT * FROM User_roles ORDER BY user_role_id")
    return [dict(r) for r in rows]


@router.get("/types")
async def list_types(admin: dict = Depends(admin_user)):
    rows = await pool().fetch("SELECT * FROM Transaction_types ORDER BY transaction_type_id")
    return [dict(r) for r in rows]


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return {"user_id": str(user["user_id"]), "username": user["user_name"], "role": user["user_role_name"]}
