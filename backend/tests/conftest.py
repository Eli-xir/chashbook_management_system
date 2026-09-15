import os
import pathlib
import sys

import httpx
import pytest

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Test environment: disposable database, local mode, mock SMS.
os.environ["CASHBOOK_ENV"] = "local"
os.environ["CASHBOOK_DB_DSN"] = "postgresql://postgres:cashbook_local@localhost:5433/cashbook_test"
os.environ["CASHBOOK_SMS_PROVIDER"] = "mock"
os.environ["CASHBOOK_UPLOAD_DIR"] = str(BACKEND_DIR / "test_uploads")

from app import db, idgen  # noqa: E402
from app.main import app  # noqa: E402
from app.reset_dev import reset_database  # noqa: E402
from app.seed import seed_database  # noqa: E402

BASE = "http://testserver"


@pytest.fixture(scope="session", autouse=True)
async def _setup_database():
    await db.init_pool()
    # Reset BEFORE syncing counters so seeding starts from empty-table MAX(id).
    await reset_database()
    await idgen.sync()
    await seed_database("testadmin", "testdebit", "testcredit")
    yield
    await db.close_pool()


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
