"""OTP recovery: in-memory challenges and single-use reset grants.

Owner decision: no schema additions, so challenges live in this process
(persisted to a local JSON file so a restart doesn't strand a recovery).
Codes are stored as a keyed digest, never plaintext. The mock SMS provider
prints to the local console and is only selectable in local configuration.
"""

import hashlib
import hmac
import json
import os
import secrets
import time

from .config import settings
from .deps import error

OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
MAX_CHALLENGES_PER_USER = 3
MAX_CHALLENGES_PER_IP = 10
GRANT_TTL_SECONDS = 10 * 60

_STATE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".otp_state.json")
_DIGEST_KEY_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".otp_secret")

_challenges: dict[str, dict] = {}  # challenge_id -> state
_grants: dict[str, dict] = {}      # grant_id -> state
_digest_key: bytes = b""
_loaded = False


def _load() -> None:
    global _loaded, _digest_key
    if _loaded:
        return
    if os.path.exists(_DIGEST_KEY_FILE):
        with open(_DIGEST_KEY_FILE, "rb") as f:
            _digest_key = f.read()
    else:
        _digest_key = secrets.token_bytes(32)
        with open(_DIGEST_KEY_FILE, "wb") as f:
            f.write(_digest_key)
    if os.path.exists(_STATE_FILE):
        try:
            with open(_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _challenges = data.get("challenges", {})
            _grants = data.get("grants", {})
        except (json.JSONDecodeError, OSError):
            _challenges, _grants = {}, {}
    _loaded = True


def _persist() -> None:
    with open(_STATE_FILE, "w", encoding="utf-8") as f:
        json.dump({"challenges": _challenges, "grants": _grants}, f)


def _digest(code: str, user_id: str) -> str:
    return hmac.new(_digest_key, f"{user_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def _cleanup(now: float) -> None:
    _challenges = globals()["_challenges"]
    for cid in [c for c, s in _challenges.items() if s["expires_at"] <= now]:
        del _challenges[cid]
    for gid in [g for g, s in globals()["_grants"].items() if s["expires_at"] <= now]:
        del globals()["_grants"][gid]


def send_otp(user_id: str, recovery_number: str, ip: str) -> None:
    """Creates a challenge bound to user + number + purpose and 'sends' the code."""
    _load()
    now = time.time()
    _cleanup(now)

    user_challenges = [c for c in _challenges.values() if c["user_id"] == user_id]
    ip_challenges = [c for c in _challenges.values() if c["ip"] == ip]
    if len(user_challenges) >= MAX_CHALLENGES_PER_USER or len(ip_challenges) >= MAX_CHALLENGES_PER_IP:
        raise error(429, "Too many recovery attempts. Try again later.")
    for c in user_challenges:
        if now - c["last_sent_at"] < RESEND_COOLDOWN_SECONDS:
            raise error(429, "Please wait before requesting another code.")

    code = _generate_code()
    challenge_id = secrets.token_urlsafe(24)
    _challenges[challenge_id] = {
        "challenge_id": challenge_id,
        "user_id": user_id,
        "recovery_number": recovery_number,
        "code_digest": _digest(code, user_id),
        "attempts": 0,
        "created_at": now,
        "last_sent_at": now,
        "expires_at": now + OTP_TTL_SECONDS,
        "ip": ip,
    }
    _persist()

    if settings.sms_provider == "mock" and settings.sms_mock_allowed:
        print(f"[MOCK SMS] Recovery code for {recovery_number}: {code}", flush=True)
    else:
        # Real providers integrate behind this call. Nothing is configured for local use.
        raise error(500, "No SMS provider configured")


def verify_otp(user_id: str, challenge_id: str, code: str) -> str:
    """Verifies the code and returns a single-use reset grant ID."""
    _load()
    now = time.time()
    _cleanup(now)
    challenge = _challenges.get(challenge_id)
    # Generic responses avoid revealing whether the challenge exists.
    if challenge is None or challenge["user_id"] != user_id:
        raise error(400, "Invalid or expired code")
    if challenge["expires_at"] <= now:
        del _challenges[challenge_id]
        _persist()
        raise error(400, "Invalid or expired code")
    if challenge["attempts"] >= OTP_MAX_ATTEMPTS:
        del _challenges[challenge_id]
        _persist()
        raise error(400, "Invalid or expired code")
    challenge["attempts"] += 1
    if not hmac.compare_digest(challenge["code_digest"], _digest(code, user_id)):
        _persist()
        raise error(400, "Invalid or expired code")
    del _challenges[challenge_id]

    grant_id = secrets.token_urlsafe(32)
    _grants[grant_id] = {
        "grant_id": grant_id,
        "user_id": user_id,
        "expires_at": now + GRANT_TTL_SECONDS,
    }
    _persist()
    return grant_id


def consume_grant(grant_id: str, user_id: str) -> None:
    """Single-use, expiring reset grant consumed atomically with the password change."""
    _load()
    now = time.time()
    _cleanup(now)
    grant = _grants.get(grant_id)
    if grant is None or grant["user_id"] != user_id or grant["expires_at"] <= now:
        raise error(400, "Reset session expired. Start again.")
    del _grants[grant_id]
    _persist()


def invalidate_user(user_id: str) -> None:
    """Called on password or recovery-number change."""
    _load()
    for cid in [c for c, s in _challenges.items() if s["user_id"] == user_id]:
        del _challenges[cid]
    for gid in [g for g, s in _grants.items() if s["user_id"] == user_id]:
        del _grants[gid]
    _persist()
