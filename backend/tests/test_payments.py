import pytest

from app.services.payments.gateways import luhn_valid

from .conftest import fuel_request_payload


@pytest.fixture()
def completed(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = client.post("/api/v1/requests", headers=h, json=fuel_request_payload()).get_json()["id"]
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    for st in ("EN_ROUTE", "ARRIVED", "IN_PROGRESS"):
        client.patch(f"/api/v1/provider/requests/{rid}/status", headers=ph, json={"status": st})
    client.patch(f"/api/v1/provider/requests/{rid}/status", headers=ph,
                 json={"status": "COMPLETED", "final_price": 650.0})
    return rid


def test_luhn():
    assert luhn_valid("4111111111111111")
    assert not luhn_valid("4111111111111112")


def test_cannot_pay_before_completion(client, auth):
    h = auth("cust@test.in")
    rid = client.post("/api/v1/requests", headers=h, json=fuel_request_payload()).get_json()["id"]
    res = client.post("/api/v1/payments/initiate", headers=h, json={"request_id": rid, "method": "UPI"})
    assert res.status_code == 409


def test_upi_success_and_receipt(client, auth, completed):
    h = auth("cust@test.in")
    res = client.post("/api/v1/payments/initiate", headers=h, json={"request_id": completed, "method": "UPI"})
    assert res.status_code == 201
    payment = res.get_json()["payment"]
    assert payment["amount"] == 650.0 and payment["status"] == "PENDING"
    assert payment["transaction_id"].startswith("FG")
    assert res.get_json()["checkout"]["order_id"].startswith("order_mock_")

    res = client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=h, json={"upi_id": "demo@okaxis"})
    assert res.status_code == 200 and res.get_json()["status"] == "SUCCESS"

    rcpt = client.get(f"/api/v1/payments/{payment['id']}/receipt", headers=h).get_json()
    assert rcpt["receipt_number"] == f"RCPT-{payment['transaction_id']}"
    assert rcpt["request"]["final_price"] == 650.0
    # provider can also see the receipt, other users can't
    assert client.get(f"/api/v1/payments/{payment['id']}/receipt", headers=auth("near@test.in")).status_code == 200
    assert client.get(f"/api/v1/payments/{payment['id']}/receipt", headers=auth("other@test.in")).status_code == 404

    again = client.post("/api/v1/payments/initiate", headers=h, json={"request_id": completed, "method": "UPI"})
    assert again.status_code == 409
    detail = client.get(f"/api/v1/requests/{completed}", headers=h).get_json()
    assert detail["payment_status"] == "SUCCESS"


def test_failed_payment_then_retry(client, auth, completed):
    h = auth("cust@test.in")
    pid = client.post("/api/v1/payments/initiate", headers=h,
                      json={"request_id": completed, "method": "CARD"}).get_json()["payment"]["id"]
    res = client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={
        "card_number": "4000000000000002", "card_expiry": "12/39", "card_cvv": "123"})
    assert res.status_code == 402
    err = res.get_json()["error"]
    assert err["code"] == "PAYMENT_FAILED" and err["details"]["payment"]["status"] == "FAILED"

    pid2 = client.post("/api/v1/payments/initiate", headers=h,
                       json={"request_id": completed, "method": "CARD"}).get_json()["payment"]["id"]
    assert pid2 != pid
    res = client.post(f"/api/v1/payments/{pid2}/confirm", headers=h, json={
        "card_number": "4111111111111111", "card_expiry": "12/39", "card_cvv": "123"})
    assert res.status_code == 200 and res.get_json()["status"] == "SUCCESS"


def test_upi_failure_and_validation(client, auth, completed):
    h = auth("cust@test.in")
    pid = client.post("/api/v1/payments/initiate", headers=h,
                      json={"request_id": completed, "method": "UPI"}).get_json()["payment"]["id"]
    assert client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={"upi_id": "not-a-upi"}).status_code == 422
    assert client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={"upi_id": "fail@okaxis"}).status_code == 402


def test_expired_card(client, auth, completed):
    h = auth("cust@test.in")
    pid = client.post("/api/v1/payments/initiate", headers=h,
                      json={"request_id": completed, "method": "CARD"}).get_json()["payment"]["id"]
    res = client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={
        "card_number": "4111111111111111", "card_expiry": "01/20", "card_cvv": "123"})
    assert res.status_code == 402 and "expired" in res.get_json()["error"]["message"].lower()


def test_cash_flow(client, auth, completed):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    res = client.post("/api/v1/payments/initiate", headers=h, json={"request_id": completed, "method": "CASH"})
    pid = res.get_json()["payment"]["id"]
    assert client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={}).status_code == 409
    res = client.post(f"/api/v1/provider/requests/{completed}/cash-received", headers=ph)
    assert res.status_code == 200 and res.get_json()["status"] == "SUCCESS"
    assert res.get_json()["id"] == pid
    assert client.post(f"/api/v1/provider/requests/{completed}/cash-received", headers=ph).status_code == 409
    earnings = client.get("/api/v1/provider/earnings", headers=ph).get_json()
    assert earnings["completed_jobs"] == 1 and earnings["total_earnings"] == 585.0  # 10% commission
    assert earnings["pending_payments"] == 0


def test_admin_refund(client, auth, completed):
    h = auth("cust@test.in")
    pid = client.post("/api/v1/payments/initiate", headers=h,
                      json={"request_id": completed, "method": "UPI"}).get_json()["payment"]["id"]
    client.post(f"/api/v1/payments/{pid}/confirm", headers=h, json={"upi_id": "demo@okaxis"})
    ah = auth("admin@test.in")
    res = client.patch(f"/api/v1/admin/payments/{pid}/refund", headers=ah,
                       json={"refund_requested": True, "refund_note": "Late delivery", "mark_refunded": True})
    assert res.status_code == 200 and res.get_json()["status"] == "REFUNDED"
    listing = client.get("/api/v1/admin/payments?refund_requested=true", headers=ah).get_json()
    assert listing["pagination"]["total"] == 1
