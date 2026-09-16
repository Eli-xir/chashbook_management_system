from contextlib import asynccontextmanager
import asyncpg

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, idgen
from .config import settings
from .production import protect
from .routers import auth, heads, media, settings as settings_router, transactions, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    writer_lock = None
    try:
        if settings.env != "local":
            writer_lock = await asyncpg.connect(settings.db_dsn)
            if not await writer_lock.fetchval("SELECT pg_try_advisory_lock(7310203)"):
                raise RuntimeError("Another production backend is running; only one writer is supported")
        await db.init_pool()
        await idgen.sync()
        removed = await media.sweep_orphaned_drafts()
        if removed:
            print(f"[startup] swept {removed} abandoned draft upload(s)", flush=True)
        yield
    finally:
        await db.close_pool()
        if writer_lock is not None:
            await writer_lock.close()


app = FastAPI(title="Cashbook", version="1.0.0", lifespan=lifespan)
app.middleware("http")(protect)

if settings.env == "local":
    # Local CORS: exact origins from config, credentials enabled for cookies. No wildcard.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
else:
    # Non-local configuration must set CASHBOOK_CORS_ORIGINS explicitly; refuse to start wide open.
    if not settings.cors_origin_list:
        raise RuntimeError("CASHBOOK_CORS_ORIGINS must be configured outside local environment")

app.include_router(auth.router)
app.include_router(heads.router)
app.include_router(users.router)
app.include_router(transactions.router)
app.include_router(media.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/ready")
async def ready():
    await db.pool().fetchval("SELECT 1")
    return {"ok": True}
