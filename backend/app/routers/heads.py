import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional

from .. import heads_service, idgen
from ..db import pool
from ..deps import ROLE_ADMIN, ROLE_DEBIT, ROLE_CREDIT, admin_user, any_user, check_csrf, current_user, error

router = APIRouter(prefix="/heads", tags=["heads"], dependencies=[Depends(check_csrf)])


class HeadCreateBody(BaseModel):
    head_name: str = Field(min_length=1, max_length=48)
    parent_head_id: Optional[int] = None
    head_description: Optional[str] = Field(default=None, max_length=2000)
    is_transactionable: bool = False
    image_id: Optional[int] = None


class HeadUpdateBody(BaseModel):
    head_name: Optional[str] = Field(default=None, min_length=1, max_length=48)
    head_description: Optional[str] = Field(default=None, max_length=2000)
    is_transactionable: Optional[bool] = None
    is_active: Optional[bool] = None
    image_id: Optional[int] = None


class HeadMoveBody(BaseModel):
    new_parent_head_id: Optional[int] = None


class PermissionBody(BaseModel):
    head_id: int
    granted: bool


@router.get("/tree")
async def my_tree(user: dict = Depends(current_user)):
    """Tree for the current user: regular users get permitted branches; admins get everything."""
    async with pool().acquire() as conn:
        if user["user_role_name"] == ROLE_ADMIN:
            heads = await heads_service.all_heads(conn)
            children: dict[int | None, list[int]] = {}
            by_id = {h["head_id"]: h for h in heads}
            for h in heads:
                children.setdefault(h["parent_head_id"], []).append(h["head_id"])

            def build(head_id: int) -> dict:
                h = dict(by_id[head_id])
                h["granted"] = True
                h["children"] = [build(c) for c in sorted(
                    children.get(head_id, []), key=lambda cid: by_id[cid]["head_name"])]
                return h

            roots = sorted(children.get(None, []), key=lambda cid: by_id[cid]["head_name"])
            return [build(r) for r in roots]
        return await heads_service.visible_tree_for_user(conn, user["user_id"])


@router.get("/permissions/{user_id}")
async def user_permissions(user_id: uuid.UUID, admin: dict = Depends(admin_user)):
    """Kept for API compatibility; prefer /users/{user_id}/permissions."""
    return await _permissions_payload(user_id)


class PermissionBody(BaseModel):
    head_id: int
    granted: bool


async def _permissions_payload(user_id: uuid.UUID) -> dict:
    async with pool().acquire() as conn:
        direct = await conn.fetch(
            "SELECT head_id FROM User_head_permissions WHERE user_id = $1", user_id)
        direct_ids = [r["head_id"] for r in direct]
        effective = await heads_service.effective_head_ids(conn, user_id)
        return {"direct": direct_ids, "effective": sorted(effective)}


@router.post("")
async def create_head(body: HeadCreateBody, admin: dict = Depends(admin_user)):
    async with pool().acquire() as conn:
        async with conn.transaction():
            if body.parent_head_id is not None:
                parent = await heads_service.get_head(conn, body.parent_head_id)
                if parent is None:
                    raise error(404, "Parent head not found")
            existing = await conn.fetchval("SELECT 1 FROM Heads WHERE head_name = $1", body.head_name)
            if existing:
                raise error(409, "A head with this name already exists")
            from . import media
            if body.image_id is not None and not media.is_owned_by('images', body.image_id, admin['user_id']):
                raise error(403, 'Upload a head photo from your own account')
            head_id = await idgen.next_id("heads")
            await conn.execute(
                "INSERT INTO Heads (head_id, parent_head_id, head_name, head_description, is_transactionable, image_id) "
                "VALUES ($1, $2, $3, $4, $5, $6)",
                head_id, body.parent_head_id, body.head_name, body.head_description, body.is_transactionable, body.image_id,
            )
    if body.image_id is not None:
        media.mark_attached('images', body.image_id)
    return {"head_id": head_id}


@router.patch("/{head_id}")
async def update_head(head_id: int, body: HeadUpdateBody, admin: dict = Depends(admin_user)):
    async with pool().acquire() as conn:
        async with conn.transaction():
            head = await heads_service.get_head(conn, head_id)
            if head is None:
                raise error(404, "Head not found")
            if body.head_name is not None and body.head_name != head["head_name"]:
                existing = await conn.fetchval(
                    "SELECT 1 FROM Heads WHERE head_name = $1 AND head_id <> $2", body.head_name, head_id)
                if existing:
                    raise error(409, "A head with this name already exists")
            from . import media
            if body.image_id is not None and body.image_id != head['image_id'] and not media.is_owned_by('images', body.image_id, admin['user_id']):
                raise error(403, 'Upload a head photo from your own account')
            await conn.execute(
                """
                UPDATE Heads SET
                    head_name = COALESCE($2, head_name),
                    head_description = CASE WHEN $6 THEN $3 ELSE head_description END,
                    is_transactionable = COALESCE($4, is_transactionable),
                    is_active = COALESCE($5, is_active),
                    image_id = CASE WHEN $7 THEN $8 ELSE image_id END
                WHERE head_id = $1
                """,
                head_id, body.head_name, body.head_description, body.is_transactionable, body.is_active,
                "head_description" in body.model_fields_set, "image_id" in body.model_fields_set, body.image_id,
            )
    return {"ok": True}


@router.get('/{head_id}/image')
async def head_image(head_id: int, user: dict = Depends(current_user)):
    from fastapi.responses import FileResponse
    from .. import storage
    async with pool().acquire() as conn:
        head = await heads_service.get_head(conn, head_id)
        if head is None or head['image_id'] is None:
            raise error(404, 'No head photo')
        if user['user_role_name'] != ROLE_ADMIN:
            tree = await heads_service.visible_tree_for_user(conn, user['user_id'])
            stack = list(tree)
            visible = set()
            while stack:
                node = stack.pop(); visible.add(node['head_id']); stack.extend(node['children'])
            if head_id not in visible:
                raise error(403, 'Not available')
        name = await conn.fetchval('SELECT image_url FROM Images WHERE image_id = $1', head['image_id'])
    return storage.stored_response(name)


@router.post("/{head_id}/move")
async def move_head(head_id: int, body: HeadMoveBody, admin: dict = Depends(admin_user)):
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(7310201)")
            head = await heads_service.get_head(conn, head_id)
            if head is None:
                raise error(404, "Head not found")
            if body.new_parent_head_id is not None:
                parent = await heads_service.get_head(conn, body.new_parent_head_id)
                if parent is None:
                    raise error(404, "Destination head not found")
            # Cycle check against live rows inside the transaction.
            await heads_service.ensure_no_cycle(conn, head_id, body.new_parent_head_id)
            await conn.execute("UPDATE Heads SET parent_head_id = $2 WHERE head_id = $1",
                               head_id, body.new_parent_head_id)
    return {"ok": True}
