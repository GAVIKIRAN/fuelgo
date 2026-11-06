import io

import pytest

from .conftest import fuel_request_payload, provider_by_email


@pytest.fixture()
def completed(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = client.post("/api/v1/requests", headers=h, json=fuel_request_payload()).get_json()["id"]
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    for st in ("EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"):
        client.patch(f"/api/v1/provider/requests/{rid}/status", headers=ph, json={"status": st})
    return rid


def test_feedback_updates_rating(client, auth, completed):
    h = auth("cust@test.in")
    res = client.post("/api/v1/feedback", headers=h, json={"request_id": completed, "rating": 4, "comment": "Good"})
    assert res.status_code == 201
    assert provider_by_email("near@test.in").rating_avg == 4.0
    assert client.post("/api/v1/feedback", headers=h, json={"request_id": completed, "rating": 5}).status_code == 409
    ratings = client.get("/api/v1/provider/ratings", headers=auth("near@test.in")).get_json()
    assert ratings["items"][0]["rating"] == 4


def test_feedback_validation(client, auth, completed):
    h = auth("cust@test.in")
    assert client.post("/api/v1/feedback", headers=h, json={"request_id": completed, "rating": 6}).status_code == 422
    assert client.post("/api/v1/feedback", headers=auth("other@test.in"),
                       json={"request_id": completed, "rating": 3}).status_code == 404


def test_complaint_and_resolve(client, auth, completed):
    h, ah = auth("cust@test.in"), auth("admin@test.in")
    res = client.post("/api/v1/complaints", headers=h, json={
        "request_id": completed, "subject": "Overcharged", "description": "Charged more than estimate"})
    assert res.status_code == 201
    cid = res.get_json()["id"]
    open_ = client.get("/api/v1/admin/complaints?status=OPEN", headers=ah).get_json()
    assert open_["pagination"]["total"] == 1
    res = client.patch(f"/api/v1/admin/complaints/{cid}/resolve", headers=ah,
                       json={"resolution_note": "Refunded difference"})
    assert res.status_code == 200 and res.get_json()["status"] == "RESOLVED"
    assert client.patch(f"/api/v1/admin/complaints/{cid}/resolve", headers=ah,
                        json={"resolution_note": "again"}).status_code == 409
    mine = client.get("/api/v1/complaints", headers=h).get_json()["items"]
    assert mine[0]["resolution_note"] == "Refunded difference"


def test_dashboard(client, auth, completed):
    body = client.get("/api/v1/admin/dashboard", headers=auth("admin@test.in")).get_json()
    assert body["totals"]["users"] == 2
    assert body["totals"]["providers"] == 4
    assert body["totals"]["pending_verifications"] == 1
    assert body["requests_by_status"]["COMPLETED"] == 1
    assert len(body["requests_per_day"]) == 14


def test_provider_verification_flow(client, auth):
    ah = auth("admin@test.in")
    ph = auth("pending@test.in")
    res = client.patch("/api/v1/provider/availability", headers=ph, json={"is_available": True})
    assert res.status_code == 403

    # upload a document, then admin verifies
    res = client.post("/api/v1/provider/documents", headers=ph, content_type="multipart/form-data",
                      data={"doc_type": "driving_license", "file": (io.BytesIO(b"%PDF-1.4"), "dl.pdf")})
    assert res.status_code == 201
    doc_url = res.get_json()["url"]
    assert client.get(doc_url, headers=ah).status_code == 200
    assert client.get(doc_url, headers=auth("cust@test.in")).status_code == 404

    pid = provider_by_email("pending@test.in").id
    pending = client.get("/api/v1/admin/providers?status=PENDING", headers=ah).get_json()
    assert [p["id"] for p in pending["items"]] == [pid]
    assert pending["items"][0]["documents"][0]["doc_type"] == "driving_license"
    res = client.patch(f"/api/v1/admin/providers/{pid}/verification", headers=ah, json={"status": "VERIFIED"})
    assert res.status_code == 200 and res.get_json()["is_verified"] is True
    res = client.patch("/api/v1/provider/availability", headers=ph,
                       json={"is_available": True, "lat": 12.31, "lng": 76.64})
    assert res.status_code == 200 and res.get_json()["is_available"] is True

    res = client.patch(f"/api/v1/admin/providers/{pid}/verification", headers=ah,
                       json={"status": "SUSPENDED", "note": "Expired licence"})
    assert res.get_json()["is_available"] is False


def test_block_unblock_and_delete_user(client, auth):
    ah = auth("admin@test.in")
    users = client.get("/api/v1/admin/users?role=user", headers=ah).get_json()
    other = next(u for u in users["items"] if u["email"] == "other@test.in")
    res = client.patch(f"/api/v1/admin/users/{other['id']}/status", headers=ah, json={"is_active": False})
    assert res.get_json()["is_active"] is False
    res = client.post("/api/v1/auth/login", json={"email": "other@test.in", "password": "Passw0rd!"})
    assert res.status_code == 403
    client.patch(f"/api/v1/admin/users/{other['id']}/status", headers=ah, json={"is_active": True})
    assert client.delete(f"/api/v1/admin/users/{other['id']}", headers=ah).status_code == 204
    me = client.get("/api/v1/auth/me", headers=ah).get_json()
    assert client.delete(f"/api/v1/admin/users/{me['id']}", headers=ah).status_code == 409


def test_pricing_update_changes_estimate(client, auth):
    ah = auth("admin@test.in")
    res = client.put("/api/v1/admin/pricing", headers=ah, json={
        "fuel_prices": [{"fuel_type": "petrol", "price_per_litre": 100}],
        "config": {"fuel_base_delivery_fee": 60}})
    assert res.status_code == 200
    est = client.post("/api/v1/requests/estimate", headers=auth("cust@test.in"), json={
        "service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 10, "lat": 12.31, "lng": 76.64}).get_json()
    assert est["lines"][0]["amount"] == 1000
    assert next(l for l in est["lines"] if l["label"] == "Delivery fee")["amount"] == 60
    bad = client.put("/api/v1/admin/pricing", headers=ah, json={"config": {"unknown_key": 1}})
    assert bad.status_code == 422


def test_admin_request_monitor_filters(client, auth, completed):
    ah = auth("admin@test.in")
    res = client.get("/api/v1/admin/requests?status=COMPLETED&service_type=fuel", headers=ah).get_json()
    assert res["pagination"]["total"] == 1
    res = client.get("/api/v1/admin/requests?status=PENDING", headers=ah).get_json()
    assert res["pagination"]["total"] == 0
