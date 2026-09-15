"""Quick manual smoke test against a running backend on :8000."""
import re
import sys

import httpx

BASE = "http://127.0.0.1:8000"


def client() -> httpx.Client:
    c = httpx.Client(base_url=BASE)
    # Sync the CSRF cookie into a header for mutations, like the frontend does.
    original = c.post

    def post(url, **kw):
        headers = kw.pop("headers", {})
        csrf = c.cookies.get("cashbook_csrf")
        if csrf:
            headers["X-CSRF-Token"] = csrf
        return original(url, headers=headers, **kw)

    c.post = post  # type: ignore
    return c


def main() -> None:
    results = []

    def check(name, ok, extra=""):
        results.append((name, ok))
        print(f"{'PASS' if ok else 'FAIL'} {name} {extra}")

    admin = client()
    r = admin.post("/auth/login", json={"username": "admin", "password": "admin123"})
    check("admin login", r.status_code == 200)

    r = admin.get("/heads/tree")
    check("admin tree", r.status_code == 200 and isinstance(r.json(), list))

    r = admin.post("/transactions/create", json={
        "head_id": 2, "amount": 500, "payment_medium_id": 1, "payable": False,
        "idempotency_key": "smoke-key-0000000001", "transaction_type_name": "debit"})
    check("admin create debit", r.status_code == 200, r.text if r.status_code != 200 else "")
    txn_id = r.json().get("transaction_id") if r.status_code == 200 else None

    r = admin.post("/transactions/create", json={
        "head_id": 2, "amount": 500, "payment_medium_id": 1, "payable": False,
        "idempotency_key": "smoke-key-0000000001", "transaction_type_name": "debit"})
    check("idempotent duplicate", r.status_code == 200 and r.json().get("duplicate") is True)

    r = admin.post("/transactions/report", json={"page": 1})
    check("report", r.status_code == 200 and r.json()["totals"]["debit_total"] == 500)

    if txn_id:
        r = admin.get(f"/transactions/detail/{txn_id}")
        check("detail", r.status_code == 200 and len(r.json()["versions"]) == 1)
        r = admin.post(f"/transactions/{txn_id}/correct", json={
            "base_version_id": 1, "amount": 700, "payment_medium_id": 1,
            "transaction_type_name": "debit"})
        check("correct", r.status_code == 200, r.text if r.status_code != 200 else "")
        r = admin.post(f"/transactions/{txn_id}/deactivate")
        check("deactivate", r.status_code == 200)
        r = admin.post("/transactions/report", json={"page": 1})
        check("inactive excluded from totals", r.status_code == 200 and r.json()["totals"]["debit_total"] == 0)
        r = admin.post("/transactions/report", json={"page": 1, "include_inactive": True})
        check("inactive shown when requested", r.status_code == 200 and r.json()["totals"]["active_count"] == 0)

    debit = client()
    r = debit.post("/auth/login", json={"username": "debit1", "password": "debit123"})
    check("debit login", r.status_code == 200)
    r = debit.post("/transactions/create", json={
        "head_id": 2, "amount": 300, "payment_medium_id": 1, "payable": False,
        "idempotency_key": "smoke-key-0000000002"})
    check("debit user create", r.status_code == 200, r.text if r.status_code != 200 else "")
    r = debit.post("/transactions/create", json={
        "head_id": 2, "amount": 300, "payment_medium_id": 1, "payable": False,
        "idempotency_key": "smoke-key-0000000003", "transaction_type_name": "credit"})
    check("debit user cannot forge credit type", r.status_code == 200 and "transaction_id" in r.json())
    r = admin.get("/transactions/detail/1")
    ttype = None
    if r.status_code == 200:
        tid = r.json()["transaction_id"]
        r2 = admin.get(f"/transactions/detail/{tid}")
    r = debit.get("/transactions/detail/1")
    check("regular user blocked from detail", r.status_code == 403)
    r = debit.post("/transactions/report", json={"page": 1})
    check("regular user blocked from report", r.status_code == 403)

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("Failures:", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
