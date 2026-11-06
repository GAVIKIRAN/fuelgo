"""End-to-end check against a running server (python seed.py && flask run first).

    pip install "python-socketio[client]" requests
    python scripts/e2e_flow.py [--base http://127.0.0.1:5000]

Flow: register user -> add vehicle -> estimate -> match -> request fuel -> provider
accepts -> live tracking over Socket.IO (simulator) -> complete -> pay (failed then
successful) -> receipt -> rate; register a provider -> admin verifies -> provider goes
online; ML predict-demand + insights.
"""
import argparse
import random
import string
import sys
import time
import uuid

import requests
import socketio

sys.stdout.reconfigure(errors="replace")
PASS, FAIL = "PASS", "FAIL"
results = []


def check(name, cond, detail=""):
    results.append((PASS if cond else FAIL, name, detail))
    print(f"[{PASS if cond else FAIL}] {name} {detail}")
    if not cond:
        raise SystemExit(1)


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/") + "/api/v1"
        self.token = None

    def call(self, method, path, **kw):
        headers = kw.pop("headers", {})
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return requests.request(method, self.base + path, headers=headers, timeout=60, **kw)

    def login(self, email, password):
        r = self.call("POST", "/auth/login", json={"email": email, "password": password})
        check(f"login {email}", r.status_code == 200, str(r.status_code))
        self.token = r.json()["access_token"]
        return r.json()["user"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5000")
    args = ap.parse_args()
    tag = uuid.uuid4().hex[:6]

    # 1. register user + vehicle
    user = Client(args.base)
    r = user.call("POST", "/auth/register", json={"name": "E2E Tester", "email": f"e2e_{tag}@test.in",
                                                  "phone": "9811122233", "password": "E2ePass123"})
    check("register user", r.status_code == 201, str(r.status_code))
    user.token = r.json()["access_token"]
    r = user.call("POST", "/vehicles", json={"make": "Honda", "model": "Amaze",
                                             "registration_number": "KA09" + "".join(random.choices(string.ascii_uppercase, k=2)) + str(random.randint(1000, 9999)),
                                             "fuel_type": "petrol"})
    check("add vehicle", r.status_code == 201, r.text[:120])
    vehicle_id = r.json()["id"]

    # 2. estimate + match (near Gokulam, Mysuru)
    loc = {"lat": 12.3320, "lng": 76.6360}
    r = user.call("POST", "/requests/estimate", json={"service_type": "fuel", "fuel_type": "petrol",
                                                      "quantity_litres": 5, **loc})
    check("estimate", r.status_code == 200 and r.json()["providers_available"], f"total Rs {r.json().get('total')}")
    r = user.call("POST", "/requests/match", json={"service_type": "fuel", "fuel_type": "petrol",
                                                   "quantity_litres": 5, **loc})
    providers = r.json()["items"]
    check("match providers", len(providers) > 0,
          ", ".join(f"{p['business_name']} {p['distance_km']}km" for p in providers))

    # 3. request fuel (auto-assign)
    r = user.call("POST", "/requests", json={"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                             "vehicle_id": vehicle_id, "address": "Gokulam 3rd stage", "auto_assign": True, **loc})
    check("create fuel request", r.status_code == 201, r.text[:160])
    req = r.json()
    rid = req["id"]
    provider_email = None
    for email in ("suresh.fuel@fuelgo.in", "lakshmi.fuel@fuelgo.in", "arjun.fuel@fuelgo.in"):
        p = Client(args.base)
        p.login(email, "Provider@123")
        incoming = p.call("GET", "/provider/requests/incoming").json()["items"]
        if any(x["id"] == rid for x in incoming):
            provider_email, prov = email, p
            break
    check("assigned provider sees request", provider_email is not None, provider_email or "")

    # double booking guard
    r = user.call("POST", "/requests", json={"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                             "auto_assign": True, **loc})
    check("double booking blocked", r.status_code == 409)

    # 4. provider accepts
    r = prov.call("POST", f"/provider/requests/{rid}/accept")
    check("provider accepts", r.status_code == 200 and r.json()["status"] == "ACCEPTED")

    # 5. live tracking over Socket.IO with the simulator
    updates, statuses = [], []
    sio = socketio.Client(reconnection=False)
    sio.on("tracking:update", lambda d: updates.append(d))
    sio.on("request:update", lambda d: statuses.append(d["status"]))
    sio.connect(args.base, auth={"token": user.token}, transports=["websocket"], wait_timeout=10)
    joined = sio.call("request:join", {"request_id": rid}, timeout=10)
    check("socket join request room", joined.get("ok") is True)
    r = user.call("POST", f"/requests/{rid}/simulate")
    check("start simulator", r.status_code == 202)
    deadline = time.time() + 60
    while time.time() < deadline and "ARRIVED" not in statuses:
        time.sleep(0.5)
    sio.disconnect()
    etas = [u["eta_minutes"] for u in updates]
    check("received live tracking updates", len(updates) >= 5, f"{len(updates)} updates, ETA {etas[:1]}->{etas[-1:]}")
    check("ETA decreased to arrival", etas and etas[-1] <= etas[0])
    check("status ARRIVED pushed over socket", "ARRIVED" in statuses, str(statuses))

    # 6. provider completes
    for st in ("IN_PROGRESS", "COMPLETED"):
        body = {"status": st}
        if st == "COMPLETED":
            body["final_price"] = req["estimated_price"]
        r = prov.call("PATCH", f"/provider/requests/{rid}/status", json=body)
        check(f"provider -> {st}", r.status_code == 200, r.text[:100] if r.status_code != 200 else "")

    # 7. pay: failure, then success
    r = user.call("POST", "/payments/initiate", json={"request_id": rid, "method": "UPI"})
    check("initiate payment", r.status_code == 201)
    pid = r.json()["payment"]["id"]
    r = user.call("POST", f"/payments/{pid}/confirm", json={"upi_id": "fail@okaxis"})
    check("declined UPI returns 402", r.status_code == 402 and r.json()["error"]["code"] == "PAYMENT_FAILED")
    r = user.call("POST", "/payments/initiate", json={"request_id": rid, "method": "UPI"})
    pid = r.json()["payment"]["id"]
    r = user.call("POST", f"/payments/{pid}/confirm", json={"upi_id": "demo@okaxis"})
    check("retry UPI succeeds", r.status_code == 200 and r.json()["status"] == "SUCCESS", r.json().get("transaction_id", ""))
    r = user.call("GET", f"/payments/{pid}/receipt")
    check("receipt", r.status_code == 200, r.json().get("receipt_number", ""))

    # 8. rate
    r = user.call("POST", "/feedback", json={"request_id": rid, "rating": 5, "comment": "E2E: great"})
    check("rate service", r.status_code == 201)
    notes = user.call("GET", "/notifications").json()
    check("notifications delivered", notes["pagination"]["total"] >= 5, f"{notes['pagination']['total']} notifications")

    # 9. new provider -> admin verification -> online
    newp = Client(args.base)
    r = newp.call("POST", "/auth/register", json={"name": "E2E Mechanic", "email": f"e2e_mech_{tag}@test.in",
                                                  "password": "E2ePass123", "role": "provider", "provider_type": "mechanic",
                                                  "business_name": f"E2E Garage {tag}", "zone": "Hebbal"})
    check("register provider", r.status_code == 201)
    newp.token = r.json()["access_token"]
    pid_new = r.json()["user"]["provider"]["id"]
    r = newp.call("PATCH", "/provider/availability", json={"is_available": True})
    check("unverified provider cannot go online", r.status_code == 403)
    admin = Client(args.base)
    admin.login("admin@fuelgo.in", "Admin@123")
    r = admin.call("PATCH", f"/admin/providers/{pid_new}/verification", json={"status": "VERIFIED"})
    check("admin verifies provider", r.status_code == 200 and r.json()["is_verified"])
    r = newp.call("PATCH", "/provider/availability", json={"is_available": True, "lat": 12.35, "lng": 76.615})
    check("verified provider goes online", r.status_code == 200 and r.json()["is_available"])
    newp.call("PATCH", "/provider/availability", json={"is_available": False})

    # 10. ML
    r = admin.call("GET", "/admin/ml/predict-demand", params={"date": "2026-12-01", "zone": "Vijayanagar",
                                                              "fuel_type": "petrol", "weather": "rain"})
    check("ML predict-demand", r.status_code == 200, f"{r.json().get('total_litres')} L, peak {r.json().get('peak_hour')}h")
    r = admin.call("GET", "/admin/ml/insights")
    check("ML insights", r.status_code == 200 and len(r.json()["forecast_7_days"]) == 7,
          f"best model {r.json()['metrics']['best_model']}")
    r = admin.call("GET", "/admin/dashboard")
    check("admin dashboard", r.status_code == 200, f"revenue Rs {r.json()['totals']['revenue']}")

    print(f"\nAll {len(results)} checks passed.")


if __name__ == "__main__":
    sys.exit(main())
