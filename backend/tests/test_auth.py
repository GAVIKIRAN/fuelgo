from app.extensions import db
from app.models import User

from .conftest import PASSWORD


def test_register_user_and_me(client):
    res = client.post("/api/v1/auth/register", json={
        "name": "New User", "email": "New@Test.in", "password": "Secret123", "phone": "9876500000"})
    assert res.status_code == 201
    body = res.get_json()
    assert body["user"]["email"] == "new@test.in"
    assert body["user"]["role"] == "user"
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.get_json()["name"] == "New User"


def test_register_duplicate_email(client):
    res = client.post("/api/v1/auth/register", json={
        "name": "Dup", "email": "cust@test.in", "password": "Secret123"})
    assert res.status_code == 409
    assert res.get_json()["error"]["code"] == "CONFLICT"


def test_register_validation_error_format(client):
    res = client.post("/api/v1/auth/register", json={"name": "X", "email": "bad", "password": "short"})
    assert res.status_code == 422
    err = res.get_json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert {"email", "password", "name"} <= set(err["details"])


def test_register_provider_requires_fields_and_starts_pending(client):
    res = client.post("/api/v1/auth/register", json={
        "name": "Prov", "email": "p@test.in", "password": "Secret123", "role": "provider"})
    assert res.status_code == 422
    res = client.post("/api/v1/auth/register", json={
        "name": "Prov", "email": "p@test.in", "password": "Secret123", "role": "provider",
        "provider_type": "mechanic", "business_name": "Prov Garage", "zone": "Gokulam"})
    assert res.status_code == 201
    provider = res.get_json()["user"]["provider"]
    assert provider["verification_status"] == "PENDING"
    assert provider["is_available"] is False
    assert provider["lat"] is not None  # defaulted to zone centroid


def test_cannot_self_register_as_admin(client):
    res = client.post("/api/v1/auth/register", json={
        "name": "Evil", "email": "evil@test.in", "password": "Secret123", "role": "admin"})
    assert res.status_code == 422


def test_login_wrong_password(client):
    res = client.post("/api/v1/auth/login", json={"email": "cust@test.in", "password": "nope1234"})
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_blocked_user_cannot_login_or_use_token(client, auth):
    headers = auth("cust@test.in")
    user = db.session.query(User).filter_by(email="cust@test.in").one()
    user.is_active = False
    db.session.commit()
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 403
    res = client.post("/api/v1/auth/login", json={"email": "cust@test.in", "password": PASSWORD})
    assert res.status_code == 403


def test_refresh_token(client):
    tokens = client.post("/api/v1/auth/login", json={"email": "cust@test.in", "password": PASSWORD}).get_json()
    res = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert res.status_code == 200 and "access_token" in res.get_json()
    # access token cannot be used as refresh token
    res = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert res.status_code == 401


def test_missing_token_is_401(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "UNAUTHORIZED"


def test_role_required_blocks_wrong_role(client, auth):
    assert client.get("/api/v1/admin/dashboard", headers=auth("cust@test.in")).status_code == 403
    assert client.get("/api/v1/provider/earnings", headers=auth("cust@test.in")).status_code == 403
    assert client.get("/api/v1/vehicles", headers=auth("near@test.in")).status_code == 403


def test_update_profile_and_password(client, auth):
    h = auth("cust@test.in")
    res = client.patch("/api/v1/auth/me", headers=h, json={"name": "Renamed", "address": "Gokulam"})
    assert res.status_code == 200 and res.get_json()["name"] == "Renamed"
    res = client.patch("/api/v1/auth/me", headers=h, json={"current_password": "wrong", "new_password": "NewPass123"})
    assert res.status_code == 422
    res = client.patch("/api/v1/auth/me", headers=h, json={"current_password": PASSWORD, "new_password": "NewPass123"})
    assert res.status_code == 200
    ok = client.post("/api/v1/auth/login", json={"email": "cust@test.in", "password": "NewPass123"})
    assert ok.status_code == 200


def test_unknown_route_uses_json_error(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "NOT_FOUND"
