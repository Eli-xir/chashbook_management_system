"""Reset the local dev database to a freshly-seeded state. Dev convenience only.

Drops all rows in dependency order, then reseeds lookups + demo accounts.
Never run against production. Usage: python -m app.reset_dev
"""

import asyncio
import os
import sys

from . import db
from .config import settings


TABLES = [
    "Transaction_versions", "Transactions", "Sessions", "User_head_permissions",
    "Contacts", "Images", "Voice_notes", "Heads", "Users", "Payment_mediums",
    "Transaction_types", "User_roles",
]


async def reset_database() -> None:
    async with db.acquire() as conn:
        for t in TABLES:
            await conn.execute(f"TRUNCATE TABLE {t} CASCADE")


async def main() -> None:
    if settings.env != "local":
        print("Refusing: reset_dev only runs in local environment.")
        return
    await db.init_pool()
    await reset_database()
    print("Truncated all tables.")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
