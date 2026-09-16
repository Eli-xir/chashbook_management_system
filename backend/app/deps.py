import uuid

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from . import security
from .config import settings

ROLE_ADMIN = "admin"
ROLE_DEBIT = "debit_user"
ROLE_CREDIT = "credit_user"

TYPE_CREDIT = "credit"
TYPE_DEBIT = "debit"
TYPE_PAYABLE_CREDIT = "payable_credit"
TYPE_PAYABLE_DEBIT = "payable_debit"


def _read_session(request: Request) -> uuid.UUID | None:
    raw = request.cookies.get(security.SESSION_COOKIE)
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


async def current_user(request: Request) -> dict:
    user = await security.get_session_user(_read_session(request))
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


async def admin_user(user: dict = Depends(current_user)) -> dict:
    if user["user_role_name"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def regular_user(user: dict = Depends(current_user)) -> dict:
    if user["user_role_name"] not in (ROLE_DEBIT, ROLE_CREDIT):
        raise HTTPException(status_code=403, detail="Regular user access required")
    return user


def any_user(user: dict = Depends(current_user)) -> dict:
    return user


async def check_csrf(request: Request) -> None:
    """Double-submit CSRF check for cookie-authenticated mutations."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    cookie = request.cookies.get(security.CSRF_COOKIE)
    header = request.headers.get("x-csrf-token")
    if not cookie or not header or cookie != header:
        raise HTTPException(status_code=403, detail="CSRF check failed")


def set_auth_cookies(response: Response, session_id: uuid.UUID, csrf_token: str) -> None:
    secure = settings.env != "local"
    samesite = settings.cookie_samesite if settings.cookie_samesite in ("lax", "none", "strict") else "lax"
    response.set_cookie(
        security.SESSION_COOKIE, str(session_id),
        httponly=True, samesite=samesite, secure=secure,
        max_age=settings.session_ttl_minutes * 60, path="/",
    )
    response.set_cookie(
        security.CSRF_COOKIE, csrf_token,
        httponly=False, samesite=samesite, secure=secure,
        max_age=settings.session_ttl_minutes * 60, path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(security.SESSION_COOKIE, path="/")
    response.delete_cookie(security.CSRF_COOKIE, path="/")


def error(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def json_error(status: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail})
