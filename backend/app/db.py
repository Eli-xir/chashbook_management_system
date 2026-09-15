import asyncpg
from contextlib import asynccontextmanager

from .config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.db_dsn, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    assert _pool is not None, "database pool not initialised"
    return _pool


@asynccontextmanager
async def acquire():
    async with pool().acquire() as conn:
        yield conn


@asynccontextmanager
async def transaction():
    """Connection with an explicit SQL transaction."""
    async with pool().acquire() as conn:
        async with conn.transaction():
            yield conn
