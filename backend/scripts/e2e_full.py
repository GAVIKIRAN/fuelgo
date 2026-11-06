"""Feature-by-feature end-to-end checks against a running, seeded server.

    python seed.py --reset && flask run          # terminal 1
    python scripts/e2e_full.py                   # terminal 2

Complements scripts/e2e_flow.py (the core fuel journey). Covers: public landing data,
mechanic request with photo, reject → auto-reassign, REST location fallback, cash
payment + earnings + ratings, card payments, cancellation rules, complaints, refunds,
notifications, provider documents + admin verification/suspension, blocking users,
pricing changes, admin filters/dashboard, ML retrain and the un-versioned ML alias.
"""
import argparse
import io
import random
import string
import sys
import uuid

import requests

sys.stdout.reconfigure(errors="replace")
PASSED = []
PARTNERS = {
    "Chamundi Fuel Express": "suresh.fuel@fuelgo.in", "Mysuru Doorstep Diesel": "lakshmi.fuel@fuelgo.in",
    "GreenGas CNG Mobile": "arjun.fuel@fuelgo.in", "Manju Auto Works": "manju.mech@fuelgo.in",
    "QuickFix Roadside": "fathima.mech@fuelgo.in", "Venky Towing & Repairs": "venky.mech@fuelgo.in",
    "Devaraja Garage On-Call": "naveen.mech@fuelgo.in",
}


def check(name, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        raise SystemExit(1)
    PASSED.append(name)


class C:
    def __init__(self, base, token=None):
        self.base, self.token = base.rstrip("/") + "/api/v1", token

    def __call__(self, method, path, **kw):
        h = kw.pop("headers", {})
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return requests.request(method, self.base + path, headers=h, timeout=90, **kw)

    def login(self, email, password="Provider@123"):
        r = self("POST", "/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, (email, r.text)
        self.token = r.json()["access_token"]
        return self


def new_user(base, tag, label):
    c = C(base)
    r = c("POST", "/auth/register", json={"name": f"E2E {label}", "email": f"{label}_{tag}@test.in",
                                          "phone": "98" + "".join(random.choices(string.digits, k=8)),
                                          "password": "E2ePass123"})
    assert r.status_code == 201, r.text
    c.token = r.json()["access_token"]
    return c, r.json()["user"]


def partner_for(base, req):
    return C(base).login(PARTNERS[req["provider"]["business_name"]])


def complete(base, req, final=None):
    p = partner_for(base, req)
    assert p("POST", f"/provider/requests/{req['id']}/accept").status_code == 200
    for st in ("EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"):
        body = {"status": st} | ({"final_price": final} if st == "COMPLETED" and final else {})
        r = p("PATCH", f"/provider/requests/{req['id']}/status", json=body)
        assert r.status_code == 200, r.text
    return p, r.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5000")
    base = ap.parse_args().base
    tag = uuid.uuid4().hex[:6]
    anon = C(base)
    admin = C(base).login("admin@fuelgo.in", "Admin@123")

    # ---- public / landing data
    r = anon("GET", "/stats/public")
    s = r.json()
    check("public stats (no login)", r.status_code == 200 and s["completed_requests"] > 500,
          f"{s['completed_requests']} done, {s['avg_rating']}*, ~{s['avg_arrival_minutes']} min")
    check("public stats exposes no emails", "@" not in r.text)
    r = anon("GET", "/pricing")
    check("public pricing", r.status_code == 200 and len(r.json()["fuel_prices"]) == 3)
    check("meta zones", len(anon("GET", "/meta").json()["zones"]) == 10)
    check("health", anon("GET", "/health").json()["status"] == "ok")
    check("swagger docs page", requests.get(base + "/api/docs", timeout=30).status_code == 200)

    # ---- mechanic request with photo, near QuickFix Roadside
    u1, _ = new_user(base, tag, "mech")
    loc = {"lat": 12.2990, "lng": 76.6270}
    r = u1("POST", "/requests/estimate", json={"service_type": "mechanic", "problem_category": "flat_tyre", **loc})
    check("mechanic estimate uses category base charge", r.json()["lines"][0]["amount"] == 199)
    r = u1("POST", "/requests", json={"service_type": "mechanic", "problem_category": "flat_tyre",
                                      "description": "Rear tyre flat", "auto_assign": True, **loc})
    check("create mechanic request", r.status_code == 201, r.json().get("provider", {}).get("business_name", r.text[:80]))
    mreq = r.json()
    r = u1("POST", f"/requests/{mreq['id']}/photo", files={"photo": ("tyre.png", io.BytesIO(b"\x89PNG demo"), "image/png")})
    check("upload problem photo", r.status_code == 201 and r.json()["photo_url"])
    check("photo is served", requests.get(base + r.json()["photo_url"], timeout=30).status_code == 200)

    # reject → auto-reassign
    first = partner_for(base, mreq)
    first_name = mreq["provider"]["business_name"]
    check("assigned mechanic sees it in incoming",
          any(x["id"] == mreq["id"] for x in first("GET", "/provider/requests/incoming").json()["items"]))
    r = first("POST", f"/provider/requests/{mreq['id']}/reject", json={"reason": "Too far away"})
    check("reject -> reassigned to next mechanic", r.json()["reassigned"] is True)
    mreq = u1("GET", f"/requests/{mreq['id']}").json()
    check("new mechanic differs from the one who declined",
          mreq["provider"]["business_name"] != first_name, f"{first_name} -> {mreq['provider']['business_name']}")
    notes = [n["title"] for n in u1("GET", "/notifications").json()["items"]]
    check("customer notified of reassignment", "Finding another provider" in notes)

    # accept + REST location fallback
    second = partner_for(base, mreq)
    second("POST", f"/provider/requests/{mreq['id']}/accept")
    before = u1("GET", f"/requests/{mreq['id']}/tracking").json()["distance_km"]
    r = second("POST", "/provider/location", json={"lat": loc["lat"] + 0.003, "lng": loc["lng"]})
    after = u1("GET", f"/requests/{mreq['id']}/tracking").json()["distance_km"]
    check("REST location update refreshes tracking", r.status_code == 200 and after < before, f"{before} -> {after} km")
    r = second("PATCH", "/provider/availability", json={"is_available": False})
    check("provider can't go offline mid-job", r.status_code == 409)
    for st in ("EN_ROUTE", "ARRIVED", "IN_PROGRESS"):
        second("PATCH", f"/provider/requests/{mreq['id']}/status", json={"status": st})
    r = second("PATCH", f"/provider/requests/{mreq['id']}/status", json={"status": "COMPLETED", "final_price": 350})
    check("complete with adjusted final price", r.json()["final_price"] == 350)

    # cash payment
    r = u1("POST", "/payments/initiate", json={"request_id": mreq["id"], "method": "CASH"})
    check("customer chooses cash", r.status_code == 201 and r.json()["payment"]["method"] == "CASH")
    pid = r.json()["payment"]["id"]
    check("customer cannot self-confirm cash", u1("POST", f"/payments/{pid}/confirm", json={}).status_code == 409)
    r = second("POST", f"/provider/requests/{mreq['id']}/cash-received")
    check("provider marks cash received", r.status_code == 200 and r.json()["status"] == "SUCCESS")
    e = second("GET", "/provider/earnings").json()
    check("earnings dashboard", e["completed_jobs"] >= 1 and len(e["daily"]) == 7, f"total Rs {e['total_earnings']}")
    r = u1("POST", "/feedback", json={"request_id": mreq["id"], "rating": 4, "comment": "Fixed quickly"})
    check("rate mechanic", r.status_code == 201)
    check("duplicate rating blocked", u1("POST", "/feedback", json={"request_id": mreq["id"], "rating": 5}).status_code == 409)
    check("provider sees rating", second("GET", "/provider/ratings").json()["items"][0]["comment"] == "Fixed quickly")

    # complaint → admin resolves
    r = u1("POST", "/complaints", json={"request_id": mreq["id"], "subject": "Charged above estimate",
                                        "description": "Estimate was 199, paid 350"})
    cid = r.json()["id"]
    check("raise complaint", r.status_code == 201)
    check("admin sees open complaint",
          any(c["id"] == cid for c in admin("GET", "/admin/complaints?status=OPEN&per_page=100").json()["items"]))
    r = admin("PATCH", f"/admin/complaints/{cid}/resolve", json={"resolution_note": "Extra was for a new valve; explained"})
    check("admin resolves complaint", r.json()["status"] == "RESOLVED")
    check("customer sees resolution", u1("GET", "/complaints").json()["items"][0]["status"] == "RESOLVED")

    # ---- fuel by card: decline then success, refund
    u2, _ = new_user(base, tag, "card")
    r = u2("POST", "/requests", json={"service_type": "fuel", "fuel_type": "diesel", "quantity_litres": 10,
                                      "lat": 12.3035, "lng": 76.6650, "auto_assign": True})
    check("diesel request", r.status_code == 201, r.json()["provider"]["business_name"])
    freq = r.json()
    complete(base, freq)
    pid = u2("POST", "/payments/initiate", json={"request_id": freq["id"], "method": "CARD"}).json()["payment"]["id"]
    r = u2("POST", f"/payments/{pid}/confirm", json={"card_number": "4000000000000002", "card_expiry": "12/30", "card_cvv": "123"})
    check("declined card -> 402", r.status_code == 402)
    pid = u2("POST", "/payments/initiate", json={"request_id": freq["id"], "method": "CARD"}).json()["payment"]["id"]
    r = u2("POST", f"/payments/{pid}/confirm", json={"card_number": "4111111111111111", "card_expiry": "12/30", "card_cvv": "123"})
    check("card retry succeeds", r.status_code == 200 and r.json()["status"] == "SUCCESS")
    check("already paid", u2("POST", "/payments/initiate", json={"request_id": freq["id"], "method": "UPI"}).status_code == 409)
    check("payment history", u2("GET", "/payments").json()["pagination"]["total"] == 2)
    r = admin("PATCH", f"/admin/payments/{pid}/refund", json={"refund_requested": True, "refund_note": "Goodwill", "mark_refunded": True})
    check("admin refund", r.json()["status"] == "REFUNDED")
    check("refund notification", "Refund processed" in [n["title"] for n in u2("GET", "/notifications").json()["items"]])
    r = u2("POST", "/notifications/read-all")
    check("mark notifications read", r.json()["unread_count"] == 0 and u2("GET", "/notifications").json()["unread_count"] == 0)

    # ---- cancellation rules
    r = u2("POST", "/requests", json={"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 3,
                                      "lat": 12.3285, "lng": 76.6150, "auto_assign": True})
    creq = r.json()
    r = u2("POST", f"/requests/{creq['id']}/cancel", json={"reason": "Vehicle started"})
    check("cancel pending request", r.json()["status"] == "CANCELLED")
    check("provider can't accept cancelled", partner_for(base, creq)("POST", f"/provider/requests/{creq['id']}/accept").status_code == 409)
    check("cannot pay a cancelled request", u2("POST", "/payments/initiate", json={"request_id": creq["id"], "method": "UPI"}).status_code == 409)
    r = u2("GET", "/requests?status=CANCELLED")
    check("history filter by status", r.json()["pagination"]["total"] == 1)
    check("other user can't read request", u1("GET", f"/requests/{creq['id']}").status_code == 404)

    # ---- vehicles
    reg = "KA09" + "".join(random.choices(string.ascii_uppercase, k=2)) + str(random.randint(1000, 9999))
    r = u2("POST", "/vehicles", json={"make": "Mahindra", "model": "Thar", "registration_number": reg, "fuel_type": "diesel"})
    vid = r.json()["id"]
    check("add vehicle", r.status_code == 201)
    check("edit vehicle", u2("PATCH", f"/vehicles/{vid}", json={"model": "Thar Roxx"}).json()["model"] == "Thar Roxx")
    r = u2("POST", "/requests", json={"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                      "vehicle_id": vid, "lat": 12.32, "lng": 76.63, "auto_assign": True})
    check("fuel/vehicle mismatch rejected", r.status_code == 422)
    check("delete vehicle", u2("DELETE", f"/vehicles/{vid}").status_code == 204)
    check("no providers far away", u2("POST", "/requests", json={"service_type": "fuel", "fuel_type": "petrol",
                                                                 "quantity_litres": 5, "lat": 13.5, "lng": 75.0,
                                                                 "auto_assign": True}).json()["error"]["code"] == "NO_PROVIDERS")

    # ---- provider onboarding: documents, verify, suspend
    pc = C(base)
    r = pc("POST", "/auth/register", json={"name": "E2E Fuel Partner", "email": f"fuelp_{tag}@test.in", "password": "E2ePass123",
                                           "role": "provider", "provider_type": "fuel", "business_name": f"E2E Fuel {tag}",
                                           "zone": "Hebbal", "fuel_types": ["petrol"]})
    pc.token = r.json()["access_token"]
    prov_id = r.json()["user"]["provider"]["id"]
    check("admins notified of new provider",
          any("awaiting verification" in n["message"] for n in admin("GET", "/notifications?per_page=50").json()["items"]))
    r = pc("POST", "/provider/documents", data={"doc_type": "fuel_permit"},
           files={"file": ("permit.pdf", io.BytesIO(b"%PDF-1.4 demo"), "application/pdf")})
    check("provider uploads document", r.status_code == 201)
    doc_url = r.json()["url"].replace("/api/v1", "")
    check("admin can open document", admin("GET", doc_url).status_code == 200)
    check("customer cannot open document", u1("GET", doc_url).status_code == 404)
    check("bad file type rejected", pc("POST", "/provider/documents", data={"doc_type": "other"},
                                       files={"file": ("x.exe", io.BytesIO(b"MZ"), "application/octet-stream")}).status_code == 415)
    pend = admin("GET", "/admin/providers?status=PENDING&per_page=100").json()["items"]
    check("admin pending-verification filter", any(p["id"] == prov_id and p["documents"] for p in pend))
    check("reject with note", admin("PATCH", f"/admin/providers/{prov_id}/verification",
                                    json={"status": "REJECTED", "note": "Permit unreadable"}).json()["verification_status"] == "REJECTED")
    check("re-upload puts it back to PENDING", pc("POST", "/provider/documents", data={"doc_type": "fuel_permit"},
                                                  files={"file": ("p2.pdf", io.BytesIO(b"%PDF"), "application/pdf")}).status_code == 201
          and pc("GET", "/provider/profile").json()["verification_status"] == "PENDING")
    admin("PATCH", f"/admin/providers/{prov_id}/verification", json={"status": "VERIFIED"})
    r = pc("PATCH", "/provider/availability", json={"is_available": True, "lat": 12.351, "lng": 76.6175})
    check("verified provider online", r.json()["is_available"] is True)
    r = admin("PATCH", f"/admin/providers/{prov_id}/verification", json={"status": "SUSPENDED", "note": "Test suspension"})
    check("suspension forces offline", r.json()["is_available"] is False)
    check("suspended can't go online", pc("PATCH", "/provider/availability", json={"is_available": True}).status_code == 403)

    # ---- admin: users, pricing, monitor, dashboard
    users = admin("GET", f"/admin/users?q=card_{tag}").json()["items"]
    uid = users[0]["id"]
    admin("PATCH", f"/admin/users/{uid}/status", json={"is_active": False})
    check("blocked user's token rejected", u2("GET", "/auth/me").status_code == 403)
    check("blocked user can't log in", C(base)("POST", "/auth/login", json={"email": f"card_{tag}@test.in", "password": "E2ePass123"}).status_code == 403)
    admin("PATCH", f"/admin/users/{uid}/status", json={"is_active": True})
    check("unblocked user works again", u2("GET", "/auth/me").status_code == 200)

    old = {f["fuel_type"]: f["price_per_litre"] for f in admin("GET", "/admin/pricing").json()["fuel_prices"]}
    admin("PUT", "/admin/pricing", json={"fuel_prices": [{"fuel_type": "petrol", "price_per_litre": 110}]})
    est = u1("POST", "/requests/estimate", json={"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 2, "lat": 12.33, "lng": 76.62}).json()
    check("pricing change reflected in estimates", est["lines"][0]["amount"] == 220)
    admin("PUT", "/admin/pricing", json={"fuel_prices": [{"fuel_type": "petrol", "price_per_litre": old["petrol"]}]})
    check("non-admin can't change pricing", u1("PUT", "/admin/pricing", json={"fuel_prices": []}).status_code == 403)

    mon = admin("GET", "/admin/requests?service_type=mechanic&status=COMPLETED&per_page=1").json()
    check("admin request monitor filters", mon["pagination"]["total"] > 0)
    check("admin feedback list", admin("GET", "/admin/feedback?rating=4").json()["pagination"]["total"] > 0)
    check("admin payments filter", admin("GET", "/admin/payments?status=REFUNDED").json()["pagination"]["total"] >= 1)
    d = admin("GET", "/admin/dashboard").json()
    check("admin dashboard KPIs", d["totals"]["requests"] > 600 and len(d["requests_per_day"]) == 14)

    # ---- ML
    r = admin("POST", "/admin/ml/retrain")
    check("ML retrain", r.status_code == 200, f"best {r.json()['best_model']}")
    r = admin("GET", "/admin/ml/insights").json()
    check("ML insights", len(r["forecast_7_days"]) == 7 and len(r["heatmap"]) > 50 and r["top_zones"])
    r = requests.get(base + "/api/admin/ml/predict-demand", params={"date": "2026-12-25", "zone": "Hebbal", "fuel_type": "diesel"},
                     headers={"Authorization": f"Bearer {admin.token}"}, timeout=60)
    check("ML predict via /api/admin/ml alias", r.status_code == 200 and len(r.json()["hourly"]) == 24)
    check("ML forbidden for users", u1("GET", "/admin/ml/insights").status_code == 403)

    # ---- auth details
    r = C(base)("POST", "/auth/login", json={"email": "ravi@fuelgo.in", "password": "User@123"}).json()
    r2 = requests.post(base + "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {r['refresh_token']}"}, timeout=30)
    check("refresh token", r2.status_code == 200 and r2.json()["access_token"])
    check("validation error format", C(base)("POST", "/auth/register", json={"email": "bad"}).json()["error"]["code"] == "VALIDATION_ERROR")

    print(f"\nAll {len(PASSED)} checks passed.")


if __name__ == "__main__":
    main()
