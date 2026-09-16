"""Create only lookups and the first admin in a fresh, initialized database."""
import asyncio
import getpass

from . import db, security
from .seed import ROLES, TYPES, MEDIUMS


async def main():
    username = input('First admin username: ').strip()
    password = getpass.getpass('Password (at least 12 characters): ')
    confirm = getpass.getpass('Confirm password: ')
    if not username or len(username) > 48 or password != confirm or len(password) < 12:
        raise SystemExit('Invalid username, short password, or passwords do not match.')
    password_hash = security.hash_password(password)
    await db.init_pool()
    try:
        async with db.transaction() as conn:
            await conn.execute('LOCK TABLE Users IN EXCLUSIVE MODE')
            if await conn.fetchval('SELECT EXISTS(SELECT 1 FROM Users)'):
                raise SystemExit('Refusing: database already has users.')
            for table, columns, rows in [
                ('User_roles', 'user_role_id, user_role_name', ROLES),
                ('Transaction_types', 'transaction_type_id, transaction_type_name', TYPES),
                ('Payment_mediums', 'payment_medium_id, payment_medium_name', MEDIUMS),
            ]:
                await conn.executemany(f'INSERT INTO {table} ({columns}) VALUES ($1, $2)', rows)
            await conn.execute('INSERT INTO Users (user_name, password_hash, user_role_id) VALUES ($1, $2, 1)',
                               username, password_hash)
        print('First admin created. No demo users or transactions were added.')
    finally:
        await db.close_pool()


if __name__ == '__main__':
    asyncio.run(main())
