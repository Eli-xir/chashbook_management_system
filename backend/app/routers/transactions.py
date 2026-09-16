from ..config import settings
from ..state import state_path, write_json
import asyncio
import json
import hashlib
import os
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import heads_service, idgen
from ..db import pool
from ..deps import (
    TYPE_CREDIT, TYPE_DEBIT, TYPE_PAYABLE_CREDIT, TYPE_PAYABLE_DEBIT,
    ROLE_ADMIN, ROLE_DEBIT, admin_user, any_user, check_csrf, current_user, error,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])

# Owner decision: no schema additions, so idempotency keys live in this process
# (persisted to a local JSON file). Single backend instance makes this sound;
# if rows are inserted outside this app, restart to re-sync state.
_STATE_FILE = state_path(".idempotency_state.json")
_keys: dict[str, dict | int] = {}
_loaded = False


def _load() -> None:
    global _loaded
    if _loaded:
        return
    if os.path.exists(_STATE_FILE):
        try:
            with open(_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _keys.update(data)
        except (json.JSONDecodeError, OSError, ValueError):
            if settings.env != "local":
                raise RuntimeError("Cannot read persistent state; restore a valid state file")
    _loaded = True


def _persist() -> None:
    with open(_STATE_FILE + '.tmp', "w", encoding="utf-8") as f:
        json.dump(_keys, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(_STATE_FILE + '.tmp', _STATE_FILE)


def _claim_key(user_id: str, key: str, transaction_id: int | None) -> int | None:
    """Atomically claim or read. Returns existing transaction_id on duplicate."""
    _load()
    full_key = f"{user_id}:{key}"
    if full_key in _keys:
        return _keys[full_key]
    if transaction_id is not None:
        _keys[full_key] = transaction_id
        _persist()
    return None


_key_locks: dict[str, asyncio.Lock] = {}


async def _key_lock(user_id: str, key: str) -> asyncio.Lock:
    """Per-key lock so concurrent same-key requests serialise: the first commits
    and claims, the others then see the claim and return the original."""
    full_key = f"{user_id}:{key}"
    if full_key not in _key_locks:
        _key_locks[full_key] = asyncio.Lock()
    return _key_locks[full_key]


VALID_TYPE_NAMES = {TYPE_CREDIT, TYPE_DEBIT, TYPE_PAYABLE_CREDIT, TYPE_PAYABLE_DEBIT}


def direction_type(role: str, payable: bool) -> str:
    """Backend derives the type from the caller's role and the payable flag."""
    if role == ROLE_DEBIT:
        return TYPE_PAYABLE_DEBIT if payable else TYPE_DEBIT
    return TYPE_PAYABLE_CREDIT if payable else TYPE_CREDIT


class CreateBody(BaseModel):
    head_id: int
    amount: int = Field(ge=0, le=2147483647, strict=True)
    payment_medium_id: int
    payable: bool = False
    idempotency_key: str = Field(min_length=16, max_length=64)
    transaction_type_name: Optional[str] = None  # admins only; ignored for regular users
    image_id: Optional[int] = None
    voice_id: Optional[int] = None


class CorrectBody(BaseModel):
    base_version_id: int  # stale-edit guard: must equal the current version
    amount: int = Field(ge=0, le=2147483647, strict=True)
    payment_medium_id: int
    transaction_type_name: str  # correction may choose any of the four types
    image_id: Optional[int] = None
    voice_id: Optional[int] = None
    clear_image: bool = False
    clear_voice: bool = False


class ReportFilters(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    head_id: Optional[int] = None
    include_descendants: bool = True
    user_id: Optional[uuid.UUID] = None
    direction: Optional[str] = None  # credit | debit
    include_inactive: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


async def _reserve_media(conn, user, image_id: int | None, voice_id: int | None,
                         existing_image_id: int | None = None,
                         existing_voice_id: int | None = None) -> tuple[int | None, int | None]:
    """Uploads must belong to the submitting user (staged via /media endpoints).
    Media already on the current version passes unchanged; ownership comes from
    the media router's process-local map (no owner column in the schema)."""
    from . import media as media_router
    checks = (
        ("image", image_id, existing_image_id, "images"),
        ("voice", voice_id, existing_voice_id, "voice_notes"),
    )
    for kind, mid, existing, map_kind in checks:
        if mid is None or mid == existing:
            continue
        if not media_router.is_owned_by(map_kind, mid, user["user_id"]):
            raise error(403, f"Attached {kind} does not belong to you")
    return image_id, voice_id


@router.post("/create")
async def create_transaction(body: CreateBody, request: Request, user: dict = Depends(any_user)):
    await check_csrf(request)
    _load()
    async with await _key_lock(str(user["user_id"]), body.idempotency_key):
        duplicate = _claim_key(str(user["user_id"]), body.idempotency_key, None)
        fingerprint = hashlib.sha256(body.model_dump_json(exclude={'idempotency_key'}).encode()).hexdigest()
        if duplicate is not None:
            if isinstance(duplicate, dict):
                if duplicate['fingerprint'] != fingerprint:
                    raise error(409, "This submission key was already used for different details")
                previous_id = duplicate['transaction_id']
            else:
                previous_id = duplicate
            exists = await pool().fetchval("SELECT 1 FROM Transactions WHERE transaction_id = $1 AND user_id = $2", previous_id, user['user_id'])
            if exists:
                return {"transaction_id": previous_id, "duplicate": True}
            if not isinstance(duplicate, dict) or duplicate.get('committed'):
                raise error(409, "This entry has since been deleted. Start a new entry.")

        is_admin = user["user_role_name"] == ROLE_ADMIN
        async with pool().acquire() as conn:
            async with conn.transaction():
                # Server-side checks are repeated at submission; permissions may change mid-form.
                head = await heads_service.get_head(conn, body.head_id)
                if head is None:
                    raise error(404, "Head not found")
                ok, reason = await heads_service.user_can_submit_to(conn, user["user_id"], body.head_id) \
                    if not is_admin else (True, "")
                if not ok:
                    raise error(403, reason)
                if is_admin and not await heads_service.effective_active(conn, body.head_id):
                    raise error(403, "This head is not active")
                if is_admin and not head["is_transactionable"]:
                    raise error(403, "This head does not accept transactions")

                if is_admin:
                    if body.transaction_type_name not in VALID_TYPE_NAMES:
                        raise error(400, "Choose a valid transaction type")
                    ttype = body.transaction_type_name
                else:
                    ttype = direction_type(user["user_role_name"], body.payable)

                medium = await conn.fetchrow(
                    "SELECT payment_medium_id FROM Payment_mediums WHERE payment_medium_id = $1",
                    body.payment_medium_id)
                if medium is None:
                    raise error(400, "Unknown payment medium")

                image_id, voice_id = await _reserve_media(conn, user, body.image_id, body.voice_id)

                transaction_id = await idgen.next_id("transactions")
                # Never reuse an ID reserved by the durable submission journal.
                reserved = max((v['transaction_id'] if isinstance(v, dict) else v for v in _keys.values()), default=0)
                while transaction_id <= reserved:
                    transaction_id = await idgen.next_id("transactions")
                version_id = await idgen.next_id("transaction_versions")
                type_id = await conn.fetchval(
                    "SELECT transaction_type_id FROM Transaction_types WHERE transaction_type_name = $1", ttype)
                if type_id is None:
                    raise error(500, "Transaction type missing; run the seed")

                _keys[f"{user['user_id']}:{body.idempotency_key}"] = {
                    'transaction_id': transaction_id, 'fingerprint': fingerprint, 'committed': False,
                }
                _persist()  # write-ahead: retries can reconcile a lost HTTP response

                # Transaction first, initial version second; the deferred FK resolves at commit.
                await conn.execute(
                    "INSERT INTO Transactions (transaction_id, head_id, user_id, current_version_id) "
                    "VALUES ($1, $2, $3, $4)",
                    transaction_id, body.head_id, user["user_id"], version_id)
                await conn.execute(
                    """
                    INSERT INTO Transaction_versions
                        (version_id, transaction_id, transaction_amount, payment_medium_id,
                         image_id, voice_id, transaction_type_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    version_id, transaction_id, body.amount, body.payment_medium_id,
                    image_id, voice_id, type_id)

        _keys[f"{user['user_id']}:{body.idempotency_key}"]['committed'] = True
        _persist()
    from . import media as media_router
    if image_id is not None:
        media_router.mark_attached("images", image_id)
    if voice_id is not None:
        media_router.mark_attached("voice_notes", voice_id)
    return {"transaction_id": transaction_id, "duplicate": False}


@router.get("/types")
async def list_types(user: dict = Depends(any_user)):
    rows = await pool().fetch("SELECT * FROM Transaction_types ORDER BY transaction_type_id")
    return [dict(r) for r in rows]


@router.get("/mediums")
async def list_mediums(user: dict = Depends(any_user)):
    rows = await pool().fetch(
        "SELECT payment_medium_id, payment_medium_name FROM Payment_mediums ORDER BY payment_medium_id")
    return [dict(r) for r in rows]


@router.get("/detail/{transaction_id}")
async def transaction_detail(transaction_id: int, user: dict = Depends(any_user)):
    if user["user_role_name"] != ROLE_ADMIN:
        # Regular users have no read access to any transaction, including their own.
        raise error(403, "Regular users cannot view transactions")
    async with pool().acquire() as conn:
        txn = await conn.fetchrow(
            """
            SELECT t.transaction_id, t.head_id, t.user_id, t.is_active, t.current_version_id,
                   u.user_name, h.head_name
            FROM Transactions t
            JOIN Users u ON u.user_id = t.user_id
            JOIN Heads h ON h.head_id = t.head_id
            WHERE t.transaction_id = $1
            """, transaction_id)
        if txn is None:
            raise error(404, "Transaction not found")
        versions = await conn.fetch(
            """
            SELECT v.version_id, v.transaction_amount, v.payment_medium_id, m.payment_medium_name,
                   v.image_id, v.voice_id, v.transaction_type_id, tt.transaction_type_name, v.created_at
            FROM Transaction_versions v
            JOIN Payment_mediums m ON m.payment_medium_id = v.payment_medium_id
            JOIN Transaction_types tt ON tt.transaction_type_id = v.transaction_type_id
            WHERE v.transaction_id = $1
            ORDER BY v.version_id
            """, transaction_id)
        path = await heads_service.ancestor_ids(conn, txn["head_id"])
        names = await conn.fetch("SELECT head_id, head_name FROM Heads WHERE head_id = ANY($1)", path or [0])
        name_map = {r["head_id"]: r["head_name"] for r in names}
    return {
        **dict(txn) | {"user_id": str(txn["user_id"])},
        "head_path": [{"head_id": hid, "head_name": name_map[hid]} for hid in path],
        "versions": [dict(v) for v in versions],
    }


@router.post("/{transaction_id}/correct")
async def correct_transaction(transaction_id: int, body: CorrectBody, request: Request,
                              admin: dict = Depends(admin_user)):
    await check_csrf(request)
    type_id = await pool().fetchval(
        "SELECT transaction_type_id FROM Transaction_types WHERE transaction_type_name = $1",
        body.transaction_type_name)
    if type_id is None:
        raise error(400, "Choose a valid transaction type")

    async with pool().acquire() as conn:
        async with conn.transaction():
            # Row lock serialises competing corrections; base_version_id rejects stale edits.
            txn = await conn.fetchrow(
                "SELECT transaction_id, current_version_id, user_id, head_id FROM Transactions "
                "WHERE transaction_id = $1 FOR UPDATE", transaction_id)
            if txn is None:
                raise error(404, "Transaction not found")
            if txn["current_version_id"] != body.base_version_id:
                raise error(409, "This transaction was changed by someone else. Refresh and try again.")

            current = await conn.fetchrow(
                "SELECT image_id, voice_id FROM Transaction_versions WHERE version_id = $1",
                body.base_version_id)
            image_id = None if body.clear_image else (body.image_id if body.image_id is not None else current["image_id"])
            voice_id = None if body.clear_voice else (body.voice_id if body.voice_id is not None else current["voice_id"])
            if image_id is not None or voice_id is not None:
                # New attachments must be owned by the correcting admin; kept ones pass.
                await _reserve_media(conn, admin, image_id, voice_id,
                                     existing_image_id=current["image_id"],
                                     existing_voice_id=current["voice_id"])

            medium = await conn.fetchrow(
                "SELECT payment_medium_id FROM Payment_mediums WHERE payment_medium_id = $1",
                body.payment_medium_id)
            if medium is None:
                raise error(400, "Unknown payment medium")

            version_id = await idgen.next_id("transaction_versions")
            await conn.execute(
                """
                INSERT INTO Transaction_versions
                    (version_id, transaction_id, transaction_amount, payment_medium_id,
                     image_id, voice_id, transaction_type_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                version_id, transaction_id, body.amount, body.payment_medium_id,
                image_id, voice_id, type_id)
            await conn.execute(
                "UPDATE Transactions SET current_version_id = $2 WHERE transaction_id = $1",
                transaction_id, version_id)
    from . import media as media_router
    if image_id is not None and image_id != current["image_id"]:
        media_router.mark_attached("images", image_id)
    if voice_id is not None and voice_id != current["voice_id"]:
        media_router.mark_attached("voice_notes", voice_id)
    return {"version_id": version_id}


@router.post("/{transaction_id}/deactivate")
@router.post("/{transaction_id}/reactivate")
async def set_active(transaction_id: int, request: Request, admin: dict = Depends(admin_user)):
    await check_csrf(request)
    activate = request.url.path.endswith("/reactivate")
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT is_active FROM Transactions WHERE transaction_id = $1 FOR UPDATE", transaction_id)
            if row is None:
                raise error(404, "Transaction not found")
            if row["is_active"] != activate:
                await conn.execute(
                    "UPDATE Transactions SET is_active = $2 WHERE transaction_id = $1",
                    transaction_id, activate)
    return {"ok": True, "is_active": activate}


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: int, request: Request, admin: dict = Depends(admin_user)):
    await check_csrf(request)
    async with pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT transaction_id FROM Transactions WHERE transaction_id = $1 FOR UPDATE", transaction_id)
            if row is None:
                raise error(404, "Transaction not found")
            # Cascades to all versions; shared images/voices and their metadata are untouched.
            await conn.execute("DELETE FROM Transactions WHERE transaction_id = $1", transaction_id)
    return {"ok": True}


_CREDIT_TYPES = (TYPE_CREDIT, TYPE_PAYABLE_CREDIT)
_DEBIT_TYPES = (TYPE_DEBIT, TYPE_PAYABLE_DEBIT)


async def _report_base(conn, f: ReportFilters, admin: dict) -> tuple[str, list, str]:
    """Shared CTE + WHERE for page and totals. Dates are Karachi-local; the reported
    date is the FIRST version's created_at. Stable tiebreaker: transaction_id."""
    clauses = []
    params: list = []

    def add(clause: str, *values) -> str:
        params.extend(values)
        return clause.replace("?", f"${len(params)}")

    if not f.include_inactive:
        clauses.append("is_active")
    if f.direction == "credit":
        clauses.append(add("transaction_type_name = ANY(?)", list(_CREDIT_TYPES)))
    elif f.direction == "debit":
        clauses.append(add("transaction_type_name = ANY(?)", list(_DEBIT_TYPES)))
    if f.user_id is not None:
        clauses.append(add("user_id = ?", f.user_id))
    if f.head_id is not None:
        if f.include_descendants:
            ids = await heads_service.subtree_ids(conn, f.head_id)
        else:
            ids = {f.head_id}
        clauses.append(add("head_id = ANY(?)", sorted(ids)))
    if f.date_from is not None:
        clauses.append(add("reported_at >= (?::date AT TIME ZONE 'Asia/Karachi')", f.date_from))
    if f.date_to is not None:
        clauses.append(add("reported_at < ((?::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Karachi')", f.date_to))

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    cte = """
        WITH base AS (
            SELECT t.transaction_id, t.head_id, t.user_id, t.is_active, t.current_version_id,
                   fv.created_at AS reported_at,
                   cv.transaction_amount, cv.payment_medium_id, cv.image_id, cv.voice_id,
                   cv.transaction_type_id, tt.transaction_type_name,
                   u.user_name, h.head_name, m.payment_medium_name
            FROM Transactions t
            JOIN LATERAL (
                SELECT created_at FROM Transaction_versions v
                WHERE v.transaction_id = t.transaction_id
                ORDER BY v.version_id LIMIT 1
            ) fv ON true
            JOIN Transaction_versions cv ON cv.version_id = t.current_version_id
            JOIN Transaction_types tt ON tt.transaction_type_id = cv.transaction_type_id
            JOIN Users u ON u.user_id = t.user_id
            JOIN Heads h ON h.head_id = t.head_id
            JOIN Payment_mediums m ON m.payment_medium_id = cv.payment_medium_id
        )
    """
    return cte, params, where


@router.post("/report")
async def report(body: ReportFilters, user: dict = Depends(any_user)):
    if body.date_from and body.date_to and body.date_from > body.date_to:
        raise error(400, "From date must be on or before the to date")
    if body.direction not in (None, "credit", "debit"):
        raise error(400, "Unknown direction")
    if user["user_role_name"] != ROLE_ADMIN:
        raise error(403, "Regular users cannot view transactions")
    async with pool().acquire() as conn:
        cte, params, where = await _report_base(conn, body, user)

        # Totals always cover the full filtered result, never just the visible page.
        # Active totals exclude inactive rows even when they are displayed.
        totals_sql = f"""
            {cte}
            SELECT
                COALESCE(SUM(CASE WHEN is_active AND transaction_type_name = ANY($CREDIT$) THEN transaction_amount END), 0) AS credit_total,
                COALESCE(SUM(CASE WHEN is_active AND transaction_type_name = ANY($DEBIT$) THEN transaction_amount END), 0) AS debit_total,
                COALESCE(SUM(CASE WHEN NOT is_active AND transaction_type_name = ANY($CREDIT$) THEN transaction_amount END), 0) AS inactive_credit_total,
                COALESCE(SUM(CASE WHEN NOT is_active AND transaction_type_name = ANY($DEBIT$) THEN transaction_amount END), 0) AS inactive_debit_total,
                COUNT(*) FILTER (WHERE is_active) AS active_count,
                COUNT(*) FILTER (WHERE NOT is_active) AS inactive_count
            FROM base {where};
        """
        totals_sql = (totals_sql
                      .replace("$CREDIT$", f"ARRAY[{', '.join(repr(t) for t in _CREDIT_TYPES)}]")
                      .replace("$DEBIT$", f"ARRAY[{', '.join(repr(t) for t in _DEBIT_TYPES)}]"))
        totals = await conn.fetchrow(f"{totals_sql};", *params)

        offset = (body.page - 1) * body.page_size
        page_sql = f"""
            {cte}
            SELECT transaction_id, head_id, head_name, user_name, user_id, is_active,
                   reported_at, transaction_amount, transaction_type_name, payment_medium_name,
                   image_id, voice_id, current_version_id
            FROM base {where}
            ORDER BY reported_at DESC, transaction_id DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2};
        """
        rows = await conn.fetch(page_sql, *params, body.page_size, offset)

    credit_total = totals["credit_total"]
    debit_total = totals["debit_total"]
    return {
        "rows": [dict(r) | {"user_id": str(r["user_id"])} for r in rows],
        "totals": {
            "credit_total": credit_total,
            "debit_total": debit_total,
            "balance": credit_total - debit_total,
            "inactive_credit_total": totals["inactive_credit_total"],
            "inactive_debit_total": totals["inactive_debit_total"],
            "inactive_balance": totals["inactive_credit_total"] - totals["inactive_debit_total"],
            "active_count": totals["active_count"],
            "inactive_count": totals["inactive_count"],
            "includes_inactive": body.include_inactive,
        },
        "page": body.page,
        "page_size": body.page_size,
    }

