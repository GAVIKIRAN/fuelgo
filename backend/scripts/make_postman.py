"""Generate postman/FuelGo.postman_collection.json from the live OpenAPI spec.

    python scripts/make_postman.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app  # noqa: E402

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "postman",
                                   "FuelGo.postman_collection.json"))

EXAMPLES = {
    ("post", "/api/v1/auth/register"): {"name": "Test User", "email": "test.user@fuelgo.in",
                                        "phone": "9876500000", "password": "Test@1234"},
    ("post", "/api/v1/auth/login"): {"email": "ravi@fuelgo.in", "password": "User@123"},
    ("post", "/api/v1/vehicles"): {"make": "Honda", "model": "City", "registration_number": "KA09XY4321",
                                   "fuel_type": "petrol"},
    ("post", "/api/v1/requests/estimate"): {"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                            "lat": 12.332, "lng": 76.636},
    ("post", "/api/v1/requests/match"): {"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                         "lat": 12.332, "lng": 76.636},
    ("post", "/api/v1/requests"): {"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
                                   "lat": 12.332, "lng": 76.636, "address": "Gokulam 3rd stage",
                                   "auto_assign": True},
    ("post", "/api/v1/requests/{request_id}/cancel"): {"reason": "Vehicle started"},
    ("patch", "/api/v1/provider/availability"): {"is_available": True, "lat": 12.3285, "lng": 76.6145},
    ("post", "/api/v1/provider/location"): {"lat": 12.33, "lng": 76.63},
    ("post", "/api/v1/provider/requests/{request_id}/reject"): {"reason": "Too far away"},
    ("patch", "/api/v1/provider/requests/{request_id}/status"): {"status": "EN_ROUTE"},
    ("post", "/api/v1/payments/initiate"): {"request_id": 1, "method": "UPI"},
    ("post", "/api/v1/payments/{payment_id}/confirm"): {"upi_id": "demo@okaxis"},
    ("post", "/api/v1/feedback"): {"request_id": 1, "rating": 5, "comment": "Great service"},
    ("post", "/api/v1/complaints"): {"request_id": 1, "subject": "Late arrival",
                                     "description": "Provider arrived 30 minutes late"},
    ("patch", "/api/v1/admin/users/{user_id}/status"): {"is_active": False},
    ("patch", "/api/v1/admin/providers/{provider_id}/verification"): {"status": "VERIFIED", "note": "Documents OK"},
    ("patch", "/api/v1/admin/payments/{payment_id}/refund"): {"refund_requested": True, "refund_note": "Late"},
    ("patch", "/api/v1/admin/complaints/{complaint_id}/resolve"): {"resolution_note": "Refunded delivery fee"},
    ("put", "/api/v1/admin/pricing"): {"fuel_prices": [{"fuel_type": "petrol", "price_per_litre": 103.1}],
                                       "config": {"fuel_base_delivery_fee": 49}},
}
QUERIES = {
    "/api/v1/admin/ml/predict-demand": [("date", "2026-12-01"), ("zone", "Vijayanagar"), ("fuel_type", "petrol"),
                                        ("weather", "clear")],
}
LOGIN_SCRIPT = [
    "const data = pm.response.json();",
    "if (data.access_token) { pm.collectionVariables.set('token', data.access_token); }",
    "if (data.refresh_token) { pm.collectionVariables.set('refresh_token', data.refresh_token); }",
]


def to_postman_path(path):
    return path.replace("{", ":").replace("}", "")


def main():
    app = create_app("testing")
    spec = app.test_client().get("/api/openapi.json").get_json()
    folders = {}
    for path, ops in sorted(spec["paths"].items()):
        if path.startswith("/api/admin/ml"):
            continue  # alias of /api/v1/admin/ml
        for method, op in ops.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            tag = (op.get("tags") or ["general"])[0]
            pm_path = to_postman_path(path)
            raw = "{{baseUrl}}" + pm_path
            url = {"raw": raw, "host": ["{{baseUrl}}"], "path": [p for p in pm_path.split("/") if p]}
            variables = [{"key": p[1:], "value": "1"} for p in url["path"] if p.startswith(":")]
            if variables:
                url["variable"] = variables
            if path in QUERIES:
                url["query"] = [{"key": k, "value": v} for k, v in QUERIES[path]]
                url["raw"] += "?" + "&".join(f"{k}={v}" for k, v in QUERIES[path])
            item = {"name": f"{method.upper()} {path.replace('/api/v1', '')}",
                    "request": {"method": method.upper(), "header": [], "url": url,
                                "description": op.get("summary") or op.get("description", "")}}
            body = EXAMPLES.get((method, path))
            if body is not None:
                item["request"]["header"].append({"key": "Content-Type", "value": "application/json"})
                item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2)}
            elif path.endswith("/photo") or path.endswith("/documents") and method == "post":
                field = "photo" if path.endswith("/photo") else "file"
                form = [{"key": field, "type": "file", "src": ""}]
                if field == "file":
                    form.append({"key": "doc_type", "value": "driving_license", "type": "text"})
                item["request"]["body"] = {"mode": "formdata", "formdata": form}
            if op.get("security") == []:
                item["request"]["auth"] = {"type": "noauth"}
            if path in ("/api/v1/auth/login", "/api/v1/auth/register"):
                item["event"] = [{"listen": "test", "script": {"type": "text/javascript", "exec": LOGIN_SCRIPT}}]
            if path == "/api/v1/auth/refresh":
                item["request"]["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{refresh_token}}", "type": "string"}]}
            folders.setdefault(tag, []).append(item)

    collection = {
        "info": {"name": "FuelGo API", "_postman_id": "6f0e0d2c-fuel-go-api-collection",
                 "description": "FuelGo REST API v1. Run 'POST /auth/login' first; the token is stored automatically.\n"
                                "Demo logins: ravi@fuelgo.in / User@123, suresh.fuel@fuelgo.in / Provider@123, "
                                "admin@fuelgo.in / Admin@123.",
                 "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]},
        "variable": [{"key": "baseUrl", "value": "http://127.0.0.1:5000"}, {"key": "token", "value": ""},
                     {"key": "refresh_token", "value": ""}],
        "item": [{"name": name, "item": items} for name, items in folders.items()],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(collection, fh, indent=2, ensure_ascii=False)
    print(f"Wrote {sum(len(i) for i in folders.values())} requests in {len(folders)} folders to {OUT}")


if __name__ == "__main__":
    main()
