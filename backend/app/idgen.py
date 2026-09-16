"""In-process ID allocation.

The schema has no sequences by owner decision. Counters are initialised from
MAX(id) once at startup and advance under a per-table asyncio lock, which is
safe for a single backend process. If rows are inserted outside this app,
restart the backend to re-sync.
"""

import asyncio

from . import db

# table -> (id column, sql table name)
_TABLES = {
    "images": ("image_id", "Images"),
    "voice_notes": ("voice_id", "Voice_notes"),
    "transactions": ("transaction_id", "Transactions"),
    "transaction_versions": ("version_id", "Transaction_versions"),
    "contacts": ("contact_id", "Contacts"),
    "heads": ("head_id", "Heads"),
    "payment_mediums": ("payment_medium_id", "Payment_mediums"),
}

_counters: dict[str, int] = {}
_locks: dict[str, asyncio.Lock] = {}
_synced = False


def _lock_for(table: str) -> asyncio.Lock:
    if table not in _locks:
        _locks[table] = asyncio.Lock()
    return _locks[table]


async def sync() -> None:
    global _synced
    if _synced:
        return
    async with db.acquire() as conn:
        for key, (column, table) in _TABLES.items():
            row = await conn.fetchrow(f"SELECT COALESCE(MAX({column}), 0) AS m FROM {table}")
            _counters[key] = row["m"]
    _synced = True


def reset() -> None:
    """Test helper: force re-sync on next allocation."""
    global _synced
    _synced = False
    _counters.clear()


async def next_id(table: str) -> int:
    await sync()
    async with _lock_for(table):
        _counters[table] = _counters.get(table, 0) + 1
        return _counters[table]


async def next_ids(table: str, count: int) -> list[int]:
    await sync()
    async with _lock_for(table):
        start = _counters.get(table, 0) + 1
        _counters[table] = start + count - 1
        return list(range(start, start + count))
