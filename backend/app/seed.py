"""Seed deterministic lookup values and local demo accounts.

Safe to run against a fresh database only. Lookup IDs are deterministic:
roles 1-3, types 1-4, mediums 1-2. Demo account credentials are printed to
the console and are NOT production secrets.

Usage: python -m app.seed
"""

import asyncio
import getpass
import sys

from . import db, idgen, security
from .config import settings

ROLES = [(1, "admin"), (2, "debit_user"), (3, "credit_user")]
TYPES = [(1, "credit"), (2, "debit"), (3, "payable_credit"), (4, "payable_debit")]
MEDIUMS = [(1, "Cash"), (2, "Bank")]


async def seed_database(admin_password: str, debit_password: str, credit_password: str) -> None:
    """Seeds lookups + demo accounts. Callers must ensure the database is empty."""
    async with db.transaction() as conn:
        await conn.executemany(
            "INSERT INTO User_roles (user_role_id, user_role_name) VALUES ($1, $2)", ROLES
        )
        await conn.executemany(
            "INSERT INTO Transaction_types (transaction_type_id, transaction_type_name) VALUES ($1, $2)", TYPES
        )
        await conn.executemany(
            "INSERT INTO Payment_mediums (payment_medium_id, payment_medium_name) VALUES ($1, $2)", MEDIUMS
        )

        for username, role_id, password, recovery in [
            ("admin", 1, admin_password, "0300-0000001"),
            ("debit1", 2, debit_password, "0300-0000002"),
            ("credit1", 3, credit_password, "0300-0000003"),
        ]:
            user_id = await conn.fetchval(
                "INSERT INTO Users (user_name, password_hash, user_role_id) VALUES ($1, $2, $3) RETURNING user_id",
                username, security.hash_password(password), role_id,
            )
            contact_id = await idgen.next_id("contacts")
            await conn.execute(
                "INSERT INTO Contacts (contact_id, contact_no, user_id) VALUES ($1, $2, $3)",
                contact_id, recovery, user_id,
            )

        head_ids = {}
        for name, parent, transactionable in [
            ("Office", None, False),
            ("Petty Cash", "Office", True),
            ("Bank Deposits", "Office", True),
            ("Utilities", "Petty Cash", True),
        ]:
            head_id = await idgen.next_id("heads")
            head_ids[name] = head_id
            parent_id = head_ids.get(parent)
            await conn.execute(
                "INSERT INTO Heads (head_id, parent_head_id, head_name, head_description, is_transactionable) "
                "VALUES ($1, $2, $3, $4, $5)",
                head_id, parent_id, name, f"Demo head: {name}", transactionable,
            )

        # Permissions: debit1 gets Office (inherits all), credit1 gets Petty Cash only.
        await conn.execute(
            "INSERT INTO User_head_permissions (head_id, user_id) "
            "SELECT $1, user_id FROM Users WHERE user_name = $2",
            head_ids["Office"], "debit1",
        )
        await conn.execute(
            "INSERT INTO User_head_permissions (head_id, user_id) "
            "SELECT $1, user_id FROM Users WHERE user_name = $2",
            head_ids["Petty Cash"], "credit1",
        )

    await idgen.sync()
    print("Seeded.")
    print("Demo accounts:")
    print("  admin   / (your admin password)  role: admin")
    print(f"  debit1  / {debit_password}  role: debit_user")
    print(f"  credit1 / {credit_password}  role: credit_user")
    print("Recovery numbers are 0300-0000001/2/3 (one per account, used by mock SMS).")


async def main() -> None:
    # Non-interactive: python -m app.seed [admin_pw debit_pw credit_pw]
    args = sys.argv[1:]
    if len(args) == 3:
        admin_password, debit_password, credit_password = args
    else:
        print("Seeding lookup values and demo accounts.")
        admin_password = getpass.getpass("Admin password (default admin123): ") or "admin123"
        debit_password = getpass.getpass("Debit user password (default debit123): ") or "debit123"
        credit_password = getpass.getpass("Credit user password (default credit123): ") or "credit123"

    await db.init_pool()
    async with db.acquire() as conn:
        existing = await conn.fetchval("SELECT COUNT(*) FROM Users")
        if existing:
            print("Refusing to seed: Users table is not empty. Seed targets a fresh database only.")
            return
    await seed_database(admin_password, debit_password, credit_password)
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
