from app.extensions import db
from app.models import Provider, ServiceRequest

from .conftest import CUSTOMER_LOC, fuel_request_payload, provider_by_email


def _create(client, h, **kw):
    return client.post("/api/v1/requests", headers=h, json=fuel_request_payload(**kw))


def _advance(client, ph, rid, *statuses, final_price=None):
    for st in statuses:
        body = {"status": st}
        if st == "COMPLETED" and final_price is not None:
            body["final_price"] = final_price
        res = client.patch(f"/api/v1/provider/requests/{rid}/status", headers=ph, json=body)
        assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_estimate_includes_fuel_and_delivery(client, auth):
    res = client.post("/api/v1/requests/estimate", headers=auth("cust@test.in"), json={
        "service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 10,
        "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1]})
    assert res.status_code == 200
    body = res.get_json()
    assert body["providers_available"] is True
    assert body["lines"][0]["amount"] == round(102.85 * 10, 2)
    assert any(l["label"] == "Delivery fee" for l in body["lines"])
    assert body["total"] >= 1028.5 + 49


def test_match_ranks_nearest_first_and_excludes_unverified(client, auth):
    res = client.post("/api/v1/requests/match", headers=auth("cust@test.in"), json={
        "service_type": "fuel", "fuel_type": "petrol", "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1]})
    items = res.get_json()["items"]
    names = [i["business_name"] for i in items]
    assert names[0] == "NearFuel Services"
    assert "Pending Services" not in names
    assert items[0]["distance_km"] < items[1]["distance_km"]
    assert all(i["eta_minutes"] >= 1 for i in items)


def test_match_filters_by_fuel_type(client, auth):
    res = client.post("/api/v1/requests/match", headers=auth("cust@test.in"), json={
        "service_type": "fuel", "fuel_type": "cng", "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1]})
    assert res.get_json()["items"] == []


def test_full_lifecycle(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    res = _create(client, h)
    assert res.status_code == 201, res.get_json()
    req = res.get_json()
    assert req["status"] == "PENDING"
    assert req["provider"]["business_name"] == "NearFuel Services"
    assert req["estimated_price"] > 0 and req["zone"]

    incoming = client.get("/api/v1/provider/requests/incoming", headers=ph).get_json()["items"]
    assert [r["id"] for r in incoming] == [req["id"]]

    res = client.post(f"/api/v1/provider/requests/{req['id']}/accept", headers=ph)
    assert res.status_code == 200 and res.get_json()["status"] == "ACCEPTED"

    done = _advance(client, ph, req["id"], "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED",
                    final_price=600)
    assert done["status"] == "COMPLETED" and done["final_price"] == 600
    statuses = [h_["status"] for h_ in done["history"]]
    assert statuses == ["PENDING", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"]

    hist = client.get("/api/v1/requests?status=COMPLETED", headers=h).get_json()
    assert hist["pagination"]["total"] == 1
    notes = client.get("/api/v1/notifications", headers=h).get_json()
    titles = [n["title"] for n in notes["items"]]
    assert "Booking confirmed" in titles and "Provider accepted" in titles and "Service completed" in titles
    assert notes["unread_count"] >= 3


def test_invalid_transition(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = _create(client, h).get_json()["id"]
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    res = client.patch(f"/api/v1/provider/requests/{rid}/status", headers=ph, json={"status": "COMPLETED"})
    assert res.status_code == 409
    assert res.get_json()["error"]["details"]["allowed_next"] == "EN_ROUTE"


def test_double_booking_prevented(client, auth):
    h = auth("cust@test.in")
    assert _create(client, h).status_code == 201
    res = _create(client, h)
    assert res.status_code == 409
    assert "active_request_id" in res.get_json()["error"]["details"]


def test_busy_provider_not_offered_to_second_customer(client, auth):
    first = _create(client, auth("cust@test.in")).get_json()
    second = _create(client, auth("other@test.in")).get_json()
    assert first["provider"]["business_name"] == "NearFuel Services"
    assert second["provider"]["business_name"] == "FarFuel Services"


def test_provider_cannot_accept_two_jobs(client, auth, app):
    ph = auth("near@test.in")
    first = _create(client, auth("cust@test.in")).get_json()
    client.post(f"/api/v1/provider/requests/{first['id']}/accept", headers=ph)
    # force a second pending offer to the same provider
    second = _create(client, auth("other@test.in")).get_json()
    req = db.session.get(ServiceRequest, second["id"])
    req.provider_id = provider_by_email("near@test.in").id
    db.session.commit()
    res = client.post(f"/api/v1/provider/requests/{second['id']}/accept", headers=ph)
    assert res.status_code == 409


def test_pick_specific_provider(client, auth):
    far = provider_by_email("far@test.in")
    res = _create(client, auth("cust@test.in"), auto_assign=False, provider_id=far.id)
    assert res.status_code == 201
    assert res.get_json()["provider_id"] == far.id


def test_pick_unavailable_provider_without_auto_assign(client, auth):
    pending = provider_by_email("pending@test.in")
    res = _create(client, auth("cust@test.in"), auto_assign=False, provider_id=pending.id)
    assert res.status_code == 409


def test_must_choose_provider_or_auto_assign(client, auth):
    res = _create(client, auth("cust@test.in"), auto_assign=False)
    assert res.status_code == 422


def test_reject_reassigns_then_rejects(client, auth):
    h = auth("cust@test.in")
    rid = _create(client, h).get_json()["id"]
    res = client.post(f"/api/v1/provider/requests/{rid}/reject", headers=auth("near@test.in"),
                      json={"reason": "Low on fuel"})
    assert res.get_json() == {"request_id": rid, "reassigned": True, "status": "PENDING"}
    detail = client.get(f"/api/v1/requests/{rid}", headers=h).get_json()
    assert detail["provider"]["business_name"] == "FarFuel Services"

    res = client.post(f"/api/v1/provider/requests/{rid}/reject", headers=auth("far@test.in"), json={})
    assert res.get_json()["reassigned"] is False
    detail = client.get(f"/api/v1/requests/{rid}", headers=h).get_json()
    assert detail["status"] == "REJECTED"
    # user can book again after rejection
    assert _create(client, h).status_code in (201, 404)


def test_no_providers_nearby(client, auth):
    res = _create(client, auth("cust@test.in"), lat=13.5, lng=75.0)
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "NO_PROVIDERS"


def test_vehicle_fuel_mismatch(client, auth):
    h = auth("cust@test.in")
    vid = client.get("/api/v1/vehicles", headers=h).get_json()["items"][0]["id"]
    res = _create(client, h, vehicle_id=vid, fuel_type="diesel")
    assert res.status_code == 422


def test_cancel_rules(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = _create(client, h).get_json()["id"]
    res = client.post(f"/api/v1/requests/{rid}/cancel", headers=h, json={"reason": "Found a pump"})
    assert res.status_code == 200 and res.get_json()["status"] == "CANCELLED"
    assert client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph).status_code == 409

    rid = _create(client, h).get_json()["id"]
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    _advance(client, ph, rid, "EN_ROUTE", "ARRIVED")
    assert client.post(f"/api/v1/requests/{rid}/cancel", headers=h, json={}).status_code == 409


def test_other_user_cannot_see_request(client, auth):
    rid = _create(client, auth("cust@test.in")).get_json()["id"]
    assert client.get(f"/api/v1/requests/{rid}", headers=auth("other@test.in")).status_code == 404
    assert client.get(f"/api/v1/requests/{rid}", headers=auth("far@test.in")).status_code == 404
    assert client.get(f"/api/v1/requests/{rid}", headers=auth("admin@test.in")).status_code == 200


def test_mechanic_request_requires_category(client, auth):
    h = auth("cust@test.in")
    res = client.post("/api/v1/requests", headers=h, json={
        "service_type": "mechanic", "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1], "auto_assign": True})
    assert res.status_code == 422
    res = client.post("/api/v1/requests", headers=h, json={
        "service_type": "mechanic", "problem_category": "flat_tyre", "description": "Rear tyre",
        "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1], "auto_assign": True})
    assert res.status_code == 201
    assert res.get_json()["provider"]["provider_type"] == "mechanic"


def test_photo_upload(client, auth):
    import io
    h = auth("cust@test.in")
    rid = _create(client, h).get_json()["id"]
    res = client.post(f"/api/v1/requests/{rid}/photo", headers=h,
                      data={"photo": (io.BytesIO(b"\x89PNG fake"), "tyre.png")},
                      content_type="multipart/form-data")
    assert res.status_code == 201
    url = res.get_json()["photo_url"]
    assert client.get(url).status_code == 200
    bad = client.post(f"/api/v1/requests/{rid}/photo", headers=h,
                      data={"photo": (io.BytesIO(b"x"), "evil.exe")}, content_type="multipart/form-data")
    assert bad.status_code == 415


def test_live_location_updates_eta(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = _create(client, h).get_json()["id"]
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    before = client.get(f"/api/v1/requests/{rid}/tracking", headers=h).get_json()
    res = client.post("/api/v1/provider/location", headers=ph,
                      json={"lat": CUSTOMER_LOC[0] + 0.002, "lng": CUSTOMER_LOC[1]})
    assert res.status_code == 200 and res.get_json()["active_request_id"] == rid
    after = client.get(f"/api/v1/requests/{rid}/tracking", headers=h).get_json()
    assert after["distance_km"] < before["distance_km"]
    assert after["provider"]["lat"] == CUSTOMER_LOC[0] + 0.002


def test_simulator_drives_to_arrival(client, auth):
    h, ph = auth("cust@test.in"), auth("near@test.in")
    rid = _create(client, h).get_json()["id"]
    assert client.post(f"/api/v1/requests/{rid}/simulate", headers=h).status_code == 409  # not accepted yet
    client.post(f"/api/v1/provider/requests/{rid}/accept", headers=ph)
    assert client.post(f"/api/v1/requests/{rid}/simulate", headers=h).status_code == 202
    detail = client.get(f"/api/v1/requests/{rid}", headers=h).get_json()
    assert detail["status"] == "ARRIVED"
    p = db.session.get(Provider, detail["provider_id"])
    assert abs(p.lat - CUSTOMER_LOC[0]) < 1e-6


def test_offline_provider_hands_off_pending(client, auth):
    h = auth("cust@test.in")
    rid = _create(client, h).get_json()["id"]
    res = client.patch("/api/v1/provider/availability", headers=auth("near@test.in"),
                       json={"is_available": False})
    assert res.status_code == 200
    detail = client.get(f"/api/v1/requests/{rid}", headers=h).get_json()
    assert detail["provider"]["business_name"] == "FarFuel Services"
