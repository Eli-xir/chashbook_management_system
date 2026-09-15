import os
import pathlib
import sys
import tempfile
import uuid
import asyncpg

import httpx
import pytest

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Test environment: disposable database, local mode, mock SMS.
os.environ["CASHBOOK_ENV"] = "local"
TEST_DB = "cashbook_review_" + uuid.uuid4().hex
ADMIN_DSN = os.environ.get("CASHBOOK_TEST_ADMIN_DSN", "postgresql://postgres:cashbook_local@localhost:5433/postgres")
os.environ["CASHBOOK_DB_DSN"] = ADMIN_DSN.rsplit("/", 1)[0] + "/" + TEST_DB
TEST_STATE = tempfile.TemporaryDirectory(prefix="cashbook-tests-")
os.environ["CASHBOOK_SMS_PROVIDER"] = "mock"
os.environ["CASHBOOK_UPLOAD_DIR"] = str(pathlib.Path(TEST_STATE.name) / "uploads")

from app import db, idgen  # noqa: E402
from app.main import app  # noqa: E402
from app.reset_dev import reset_database  # noqa: E402
from app.seed import seed_database  # noqa: E402

BASE = "http://testserver"


@pytest.fixture(scope="session", autouse=True)
async def _setup_database():
    from app import otp
    from app.routers import media, transactions
    state = pathlib.Path(TEST_STATE.name)
    otp._STATE_FILE = str(state / 'otp.json')
    otp._DIGEST_KEY_FILE = str(state / 'otp.key')
    media._STATE_FILE = str(state / 'media.json')
    transactions._STATE_FILE = str(state / 'idempotency.json')
    admin = await asyncpg.connect(ADMIN_DSN)
    await admin.execute(f'CREATE DATABASE "{TEST_DB}"')
    try:
        await db.init_pool()
        schema = (BACKEND_DIR.parent / 'database' / 'db_init.sql').read_text(encoding='utf-8-sig')
        async with db.acquire() as conn:
            await conn.execute(schema)
        await seed_database("testadmin", "testdebit", "testcredit")
        idgen.reset()
        await idgen.sync()
        yield
    finally:
        await db.close_pool()
        await admin.execute(f'DROP DATABASE "{TEST_DB}" WITH (FORCE)')
        await admin.close()
        TEST_STATE.cleanup()



def make_client() -> httpx.AsyncClient:
    """Async ASGI client with the CSRF cookie mirrored into a header on mutations."""
    transport = httpx.ASGITransport(app=app)
    c = httpx.AsyncClient(base_url=BASE, transport=transport)

    def with_csrf(kw: dict) -> dict:
        headers = kw.pop("headers", {})
        csrf = c.cookies.get("cashbook_csrf")
        if csrf:
            headers["X-CSRF-Token"] = csrf
        kw["headers"] = headers
        return kw

    orig_post, orig_patch, orig_delete, orig_request = c.post, c.patch, c.delete, c.request

    def post(url, **kw):
        return orig_post(url, **with_csrf(kw))

    def patch(url, **kw):
        return orig_patch(url, **with_csrf(kw))

    def delete(url, **kw):
        return orig_delete(url, **with_csrf(kw))

    def request(method, url, **kw):
        if method.upper() in ("POST", "PATCH", "PUT", "DELETE"):
            return orig_request(method, url, **with_csrf(kw))
        return orig_request(method, url, **kw)

    c.post = post  # type: ignore
    c.patch = patch  # type: ignore
    c.delete = delete  # type: ignore
    c.request = request  # type: ignore
    return c


@pytest.fixture()
def client_factory():
    return make_client
