"""Focused integration tests against the disposable test database.

Covers the handoff acceptance checks that are backend-testable:
auth/session enforcement, role-direction enforcement, permission inheritance,
inactive ancestors, transactionable flag, cycles, idempotency, corrections
under concurrency, deactivation/delete semantics, OTP recovery lifecycle,
and attachment ownership.
"""

import uuid

import httpx
import pytest

from tests.conftest import make_client


async def login(client: httpx.AsyncClient, username: str, password: str) -> httpx.Response:
    return await client.post("/auth/login", json={"username": username, "password": password})


async def test_all_roles_sign_in(client_factory):
    c = make_client()
    assert (await login(c, "admin", "testadmin")).status_code == 200
    assert (await login(c, "debit1", "testdebit")).status_code == 200
    assert (await login(c, "credit1", "testcredit")).status_code == 200
    assert (await login(c, "admin", "wrong")).status_code == 401
    r = await login(c, "nonexistent", "x")
    assert r.status_code == 401 and r.json()["detail"] == "Wrong username or password"
    await c.aclose()


async def test_session_enforced_without_cookie(client_factory):
    c = make_client()
    assert (await c.get("/heads/tree")).status_code == 401
    assert (await c.get("/users")).status_code == 401
    await c.aclose()


async def test_regular_roles_derive_correct_type_and_direction(client_factory):
    d = make_client()
    await login(d, "debit1", "testdebit")
    a = make_client()
    await login(a, "admin", "testadmin")

    r = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 100, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-dir-{uuid.uuid4().hex}"})
    assert r.status_code == 200
    tid = r.json()["transaction_id"]
    detail = (await a.get(f"/transactions/detail/{tid}")).json()
    assert detail["versions"][-1]["transaction_type_name"] == "debit"
    assert detail["user_name"] == "debit1"

    r = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 50, "payment_medium_id": 1,
        "payable": True, "idempotency_key": f"t-dir-{uuid.uuid4().hex}"})
    detail = (await a.get(f"/transactions/detail/{r.json()['transaction_id']}")).json()
    assert detail["versions"][-1]["transaction_type_name"] == "payable_debit"

    cr = make_client()
    await login(cr, "credit1", "testcredit")
    r = await cr.post("/transactions/create", json={
        "head_id": 2, "amount": 70, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-dir-{uuid.uuid4().hex}"})
    assert r.status_code == 200
    detail = (await a.get(f"/transactions/detail/{r.json()['transaction_id']}")).json()
    assert detail["versions"][-1]["transaction_type_name"] == "credit"

    # credit1 was granted only Petty Cash (head 2); head 3 must be rejected
    r = await cr.post("/transactions/create", json={
        "head_id": 3, "amount": 70, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-dir-{uuid.uuid4().hex}"})
    assert r.status_code == 403
    await d.aclose(); await cr.aclose(); await a.aclose()


async def test_regular_users_cannot_call_admin_or_read_endpoints(client_factory):
    d = make_client()
    await login(d, "debit1", "testdebit")
    r = await d.post("/transactions/report", json={"page": 1})
    assert r.status_code == 403
    r = await d.get("/transactions/detail/1")
    assert r.status_code == 403
    r = await d.get("/users")
    assert r.status_code == 403
    r = await d.get("/settings/roles")
    assert r.status_code == 403
    await d.aclose()


async def test_permission_inheritance_and_inactive_ancestors(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    name = uuid.uuid4().hex[:6]
    root = (await a.post("/heads", json={"head_name": f"Root-{name}"})).json()["head_id"]
    leaf = (await a.post("/heads", json={
        "head_name": f"Leaf-{name}", "parent_head_id": root, "is_transactionable": True})).json()["head_id"]

    users = (await a.get("/users")).json()
    debit_uid = next(u["user_id"] for u in users if u["user_name"] == "debit1")
    r = await a.post(f"/users/{debit_uid}/permissions", json={"head_id": root, "granted": True})
    assert r.status_code == 200
    perms = (await a.get(f"/heads/permissions/{debit_uid}")).json()
    assert root in perms["direct"] and leaf in perms["effective"]

    d = make_client()
    await login(d, "debit1", "testdebit")
    r = await d.post("/transactions/create", json={
        "head_id": leaf, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-inh-{uuid.uuid4().hex}"})
    assert r.status_code == 200

    # Deactivate the root: subtree blocked, nothing deleted
    assert (await a.patch(f"/heads/{root}", json={"is_active": False})).status_code == 200
    r = await d.post("/transactions/create", json={
        "head_id": leaf, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-inh-{uuid.uuid4().hex}"})
    assert r.status_code == 403

    # Reactivating the leaf alone does not help; ancestor still inactive
    assert (await a.patch(f"/heads/{leaf}", json={"is_active": True})).status_code == 200
    r = await d.post("/transactions/create", json={
        "head_id": leaf, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-inh-{uuid.uuid4().hex}"})
    assert r.status_code == 403

    # Root reactivation restores; leaf's own active flag was preserved
    assert (await a.patch(f"/heads/{root}", json={"is_active": True})).status_code == 200
    r = await d.post("/transactions/create", json={
        "head_id": leaf, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-inh-{uuid.uuid4().hex}"})
    assert r.status_code == 200
    await a.aclose(); await d.aclose()


async def test_nontransactionable_head_rejects_submission(client_factory):
    d = make_client()
    await login(d, "debit1", "testdebit")
    r = await d.post("/transactions/create", json={
        "head_id": 1, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-nontxn-{uuid.uuid4().hex}"})
    assert r.status_code == 403
    await d.aclose()


async def test_head_move_cycle_rejected(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    n = uuid.uuid4().hex[:6]
    cya = (await a.post("/heads", json={"head_name": f"CycA-{n}"})).json()["head_id"]
    cyb = (await a.post("/heads", json={"head_name": f"CycB-{n}", "parent_head_id": cya})).json()["head_id"]
    cyc = (await a.post("/heads", json={"head_name": f"CycC-{n}", "parent_head_id": cyb})).json()["head_id"]
    assert (await a.post(f"/heads/{cya}/move", json={"new_parent_head_id": cyc})).status_code == 400
    assert (await a.post(f"/heads/{cya}/move", json={"new_parent_head_id": cya})).status_code == 400
    assert (await a.post(f"/heads/{cyc}/move", json={"new_parent_head_id": None})).status_code == 200
    await a.aclose()


async def test_move_preserves_transaction_identity(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    d = make_client()
    await login(d, "debit1", "testdebit")
    r = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 123, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-move-{uuid.uuid4().hex}"})
    tid = r.json()["transaction_id"]
    assert (await a.post("/heads/4/move", json={"new_parent_head_id": 3})).status_code == 200
    detail = await a.get(f"/transactions/detail/{tid}")
    assert detail.status_code == 200 and detail.json()["transaction_id"] == tid
    assert (await a.post("/heads/4/move", json={"new_parent_head_id": 2})).status_code == 200
    await a.aclose(); await d.aclose()


async def test_idempotent_duplicate_creates_exactly_one(client_factory):
    d = make_client()
    await login(d, "debit1", "testdebit")
    key = f"t-idem-{uuid.uuid4().hex}"
    r1 = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 222, "payment_medium_id": 1,
        "payable": False, "idempotency_key": key})
    r2 = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 222, "payment_medium_id": 1,  # identical retry
        "payable": False, "idempotency_key": key})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["duplicate"] is True
    assert r2.json()["transaction_id"] == r1.json()["transaction_id"]
    a = make_client()
    await login(a, "admin", "testadmin")
    detail = (await a.get(f"/transactions/detail/{r1.json()['transaction_id']}")).json()
    assert len(detail["versions"]) == 1
    assert detail["versions"][0]["transaction_amount"] == 222
    await d.aclose(); await a.aclose()


async def test_concurrent_same_idempotency_key_single_entry(client_factory):
    from app import main as app_main
    d = make_client()
    await login(d, "debit1", "testdebit")
    key = f"t-conc-{uuid.uuid4().hex}"
    transport = httpx.ASGITransport(app=app_main.app)
    async with httpx.AsyncClient(base_url="http://testserver", transport=transport) as ac:
        ac.cookies.update(d.cookies)

        async def send():
            return await ac.post("/transactions/create", json={
                "head_id": 2, "amount": 55, "payment_medium_id": 1,
                "payable": False, "idempotency_key": key},
                headers={"X-CSRF-Token": d.cookies.get("cashbook_csrf")})

        results = await _gather(send(), send(), send())
    ids = {r.json()["transaction_id"] for r in results}
    assert len(ids) == 1
    a = make_client()
    await login(a, "admin", "testadmin")
    detail = (await a.get(f"/transactions/detail/{ids.pop()}")).json()
    assert len(detail["versions"]) == 1
    await d.aclose(); await a.aclose()


async def _gather(*aws):
    import asyncio
    return await asyncio.gather(*aws)


async def test_correction_history_and_stale_edit(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    r = await a.post("/transactions/create", json={
        "head_id": 2, "amount": 100, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-corr-{uuid.uuid4().hex}",
        "transaction_type_name": "credit"})
    tid = r.json()["transaction_id"]
    detail = (await a.get(f"/transactions/detail/{tid}")).json()
    v1 = detail["versions"][0]["version_id"]
    r = await a.post(f"/transactions/{tid}/correct", json={
        "base_version_id": v1, "amount": 150, "payment_medium_id": 2,
        "transaction_type_name": "payable_credit"})
    assert r.status_code == 200
    v2 = r.json()["version_id"]
    detail = (await a.get(f"/transactions/detail/{tid}")).json()
    assert len(detail["versions"]) == 2
    assert detail["current_version_id"] == v2
    assert detail["versions"][0]["transaction_amount"] == 100
    assert detail["versions"][1]["transaction_type_name"] == "payable_credit"
    r = await a.post(f"/transactions/{tid}/correct", json={
        "base_version_id": v1, "amount": 999, "payment_medium_id": 1,
        "transaction_type_name": "credit"})
    assert r.status_code == 409
    await a.aclose()


async def test_concurrent_corrections_serialised(client_factory):
    from app import main as app_main
    a = make_client()
    await login(a, "admin", "testadmin")
    r = await a.post("/transactions/create", json={
        "head_id": 2, "amount": 10, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-cc-{uuid.uuid4().hex}",
        "transaction_type_name": "debit"})
    tid = r.json()["transaction_id"]
    base = (await a.get(f"/transactions/detail/{tid}")).json()["current_version_id"]

    transport = httpx.ASGITransport(app=app_main.app)
    async with httpx.AsyncClient(base_url="http://testserver", transport=transport) as ac:
        ac.cookies.update(a.cookies)

        async def send(amount):
            return await ac.post(f"/transactions/{tid}/correct", json={
                "base_version_id": base, "amount": amount,
                "payment_medium_id": 1, "transaction_type_name": "debit"},
                headers={"X-CSRF-Token": a.cookies.get("cashbook_csrf")})

        results = await _gather(send(111), send(222))
    statuses = [r.status_code for r in results]
    assert statuses.count(200) == 1 and statuses.count(409) == 1
    detail = (await a.get(f"/transactions/detail/{tid}")).json()
    assert len(detail["versions"]) == 2
    await a.aclose()


async def test_deactivate_totals_and_delete_versions(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    key = f"t-del-{uuid.uuid4().hex}"
    tid = (await a.post("/transactions/create", json={
        "head_id": 2, "amount": 500, "payment_medium_id": 1,
        "payable": False, "idempotency_key": key, "transaction_type_name": "credit"})).json()["transaction_id"]
    cur = (await a.get(f"/transactions/detail/{tid}")).json()["current_version_id"]
    await a.post(f"/transactions/{tid}/correct", json={
        "base_version_id": cur, "amount": 600, "payment_medium_id": 1,
        "transaction_type_name": "credit"})
    before = (await a.post("/transactions/report", json={"page": 1, "include_inactive": True})).json()
    assert (await a.post(f"/transactions/{tid}/deactivate")).status_code == 200
    after = (await a.post("/transactions/report", json={"page": 1, "include_inactive": True})).json()
    assert before["totals"]["credit_total"] - after["totals"]["credit_total"] == 600
    assert after["totals"]["inactive_credit_total"] >= 600
    assert (await a.post(f"/transactions/{tid}/reactivate")).status_code == 200
    restored = (await a.post("/transactions/report", json={"page": 1, "include_inactive": True})).json()
    assert restored["totals"]["credit_total"] == before["totals"]["credit_total"]
    # Delete cascades versions; heads/users/media metadata stay
    assert (await a.request("DELETE", f"/transactions/{tid}")).status_code == 200
    assert (await a.get(f"/transactions/detail/{tid}")).status_code == 404
    await a.aclose()


async def test_payable_groups_with_base_direction(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    tid = (await a.post("/transactions/create", json={
        "head_id": 2, "amount": 40, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-pay-{uuid.uuid4().hex}",
        "transaction_type_name": "payable_debit"})).json()["transaction_id"]
    before = (await a.post("/transactions/report", json={"page": 1, "direction": "debit"})).json()
    await a.post(f"/transactions/{tid}/deactivate")
    after = (await a.post("/transactions/report", json={"page": 1, "direction": "debit"})).json()
    assert before["totals"]["debit_total"] - after["totals"]["debit_total"] == 40
    await a.post(f"/transactions/{tid}/reactivate")
    await a.aclose()


async def test_inactive_user_cannot_login_or_recover(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    uid = (await a.post("/users", json={"username": "inact1", "password": "inactpass1",
                                        "role": "debit_user", "recovery_number": "0300-1111111"})).json()["user_id"]
    await a.patch(f"/users/{uid}", json={"is_active": False})
    c = make_client()
    assert (await login(c, "inact1", "inactpass1")).status_code == 403
    r = await c.post("/auth/forgot-password", json={"username": "inact1"})
    assert r.status_code == 200  # uniform response
    r = await c.post("/auth/verify-otp", json={"username": "inact1", "challenge_id": "zz", "code": "000000"})
    assert r.status_code == 400
    await a.aclose(); await c.aclose()


async def test_recovery_number_unique_across_accounts(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    r = await a.post("/users", json={"username": "recoveryA", "password": "recoverpass1",
                                     "role": "debit_user", "recovery_number": "0300-2222222"})
    assert r.status_code == 200
    r = await a.post("/users", json={"username": "recoveryB", "password": "recoverpass2",
                                     "role": "credit_user", "recovery_number": "0300-2222222"})
    assert r.status_code == 409
    await a.aclose()


async def test_role_change_invalidates_sessions(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    uid = (await a.post("/users", json={"username": "rolech", "password": "rolechpass1",
                                        "role": "debit_user"})).json()["user_id"]
    c = make_client()
    await login(c, "rolech", "rolechpass1")
    assert (await c.get("/auth/me")).status_code == 200
    assert (await a.patch(f"/users/{uid}", json={"role": "credit_user"})).status_code == 200
    assert (await c.get("/auth/me")).status_code == 401
    await a.aclose(); await c.aclose()


async def test_password_reset_invalidates_sessions(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    uid = (await a.post("/users", json={"username": "pwreset", "password": "pwresetpass1",
                                        "role": "debit_user"})).json()["user_id"]
    c = make_client()
    await login(c, "pwreset", "pwresetpass1")
    assert (await c.get("/auth/me")).status_code == 200
    await a.patch(f"/users/{uid}", json={"new_password": "pwresetpass2"})
    assert (await c.get("/auth/me")).status_code == 401
    assert (await login(c, "pwreset", "pwresetpass2")).status_code == 200
    await a.aclose(); await c.aclose()


async def test_otp_recovery_full_lifecycle(client_factory):
    from app import otp as otp_module
    c = make_client()
    r = await c.post("/auth/forgot-password", json={"username": "debit1"})
    assert r.status_code == 200

    def fresh_challenge() -> dict:
        return sorted(otp_module._challenges.values(), key=lambda s: s["created_at"])[-1]

    ch = fresh_challenge()
    # Wrong codes: bounded attempts then the challenge is dead
    for _ in range(otp_module.OTP_MAX_ATTEMPTS):
        r = await c.post("/auth/verify-otp", json={
            "username": "debit1", "challenge_id": ch["challenge_id"], "code": "000000"})
    assert r.status_code == 400

    # Fresh challenge; recover the real code from the keyed digest.
    # Clear the store first: the resend cooldown is per-user, and the endpoint
    # swallows the 429 deliberately (uniform anti-enumeration response).
    otp_module._challenges.clear()
    await c.post("/auth/forgot-password", json={"username": "debit1"})
    ch2 = fresh_challenge()
    real_code = None
    for guess in (f"{i:06d}" for i in range(1000000)):
        if otp_module._digest(guess, ch2["user_id"]) == ch2["code_digest"]:
            real_code = guess
            break
    assert real_code is not None
    r = await c.post("/auth/verify-otp", json={
        "username": "debit1", "challenge_id": ch2["challenge_id"], "code": real_code})
    assert r.status_code == 200
    grant_id = r.json()["grant_id"]

    r = await c.post("/auth/reset-password", json={
        "username": "debit1", "grant_id": grant_id, "new_password": "newdebitpass1"})
    assert r.status_code == 200
    assert (await c.get("/auth/me")).status_code == 200  # reset signs straight in

    # Grant replay rejected
    c2 = make_client()
    r = await c2.post("/auth/reset-password", json={
        "username": "debit1", "grant_id": grant_id, "new_password": "anotherpass1"})
    assert r.status_code == 400
    # Old password dead, new works; then restore for the dev flow
    assert (await login(make_client(), "debit1", "testdebit")).status_code == 401
    assert (await login(make_client(), "debit1", "newdebitpass1")).status_code == 200
    a = make_client()
    await login(a, "admin", "testadmin")
    users = (await a.get("/users")).json()
    debit_uid = next(u["user_id"] for u in users if u["user_name"] == "debit1")
    await a.patch(f"/users/{debit_uid}", json={"new_password": "testdebit"})
    await c.aclose(); await c2.aclose(); await a.aclose()


async def test_resend_cooldown(client_factory):
    import asyncio

    from app import otp as otp_module
    from fastapi import HTTPException

    c = make_client()
    await c.post("/auth/forgot-password", json={"username": "credit1"})
    ch = sorted(otp_module._challenges.values(), key=lambda s: s["created_at"])[-1]
    with pytest.raises(HTTPException) as exc:
        otp_module.send_otp(ch["user_id"], ch["recovery_number"], "testclient")
    assert exc.value.status_code == 429
    await c.aclose()


async def test_attachment_ownership_enforced(client_factory):
    d = make_client()
    await login(d, "debit1", "testdebit")
    files = {"file": ("test.png", _bytes_io(b"\x89PNG\r\n\x1a\n" + b"0" * 100), "image/png")}
    r = await d.post("/media/images", files=files)
    assert r.status_code == 200, r.text
    image_id = r.json()["image_id"]
    assert (await d.get(f"/media/images/{image_id}/file")).status_code == 200

    cr = make_client()
    await login(cr, "credit1", "testcredit")
    assert (await cr.get(f"/media/images/{image_id}/file")).status_code == 403
    r = await cr.post("/transactions/create", json={
        "head_id": 2, "amount": 5, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-att-{uuid.uuid4().hex}", "image_id": image_id})
    assert r.status_code == 403

    r = await d.post("/transactions/create", json={
        "head_id": 2, "amount": 5, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-att-{uuid.uuid4().hex}", "image_id": image_id})
    assert r.status_code == 200
    a = make_client()
    await login(a, "admin", "testadmin")
    assert (await a.get(f"/media/images/{image_id}/file")).status_code == 200
    await d.aclose(); await cr.aclose(); await a.aclose()


def _bytes_io(data: bytes):
    import io
    return io.BytesIO(data)


async def test_last_admin_protected(client_factory):
    a = make_client()
    await login(a, "admin", "testadmin")
    me = (await a.get("/auth/me")).json()
    assert (await a.patch(f"/users/{me['user_id']}", json={"is_active": False})).status_code == 400
    assert (await a.patch(f"/users/{me['user_id']}", json={"role": "debit_user"})).status_code == 400
    await a.aclose()


async def test_csrf_required_for_mutations(client_factory):
    from app import main as app_main
    transport = httpx.ASGITransport(app=app_main.app)
    c = httpx.AsyncClient(base_url="http://testserver", transport=transport)
    await c.post("/auth/login", json={"username": "admin", "password": "testadmin"})
    r = await c.post("/transactions/create", json={
        "head_id": 2, "amount": 1, "payment_medium_id": 1,
        "payable": False, "idempotency_key": f"t-csrf-{uuid.uuid4().hex}",
        "transaction_type_name": "debit"})
    assert r.status_code == 403
    await c.aclose()
