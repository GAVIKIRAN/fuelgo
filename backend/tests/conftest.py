import pytest

from app import create_app
from app.extensions import db
from app.models import Provider, User, Vehicle
from app.services import pricing_service

PASSWORD = "Passw0rd!"

# Mysuru coordinates
CUSTOMER_LOC = (12.3100, 76.6400)


@pytest.fixture()
def app(tmp_path, monkeypatch):
    from ml import train as trainer
    monkeypatch.setattr(trainer, "ARTIFACT_DIR", str(tmp_path))
    monkeypatch.setattr(trainer, "MODEL_PATH", str(tmp_path / "model.joblib"))
    monkeypatch.setattr(trainer, "METRICS_PATH", str(tmp_path / "metrics.json"))
    app = create_app("testing")
    app.config["UPLOAD_FOLDER"] = str(tmp_path / "uploads")
    with app.app_context():
        db.create_all()
        pricing_service.ensure_defaults()
        _seed()
        yield app
        db.session.remove()
        db.drop_all()


def _user(name, email, role="user", phone="9876543210"):
    u = User(name=name, email=email, role=role, phone=phone)
    u.set_password(PASSWORD)
    db.session.add(u)
    db.session.flush()
    return u


def _provider(name, email, ptype, lat, lng, fuels="petrol,diesel", verified=True, online=True,
              rating=0.0, count=0):
    u = _user(name, email, "provider")
    p = Provider(user_id=u.id, provider_type=ptype, business_name=f"{name} Services", zone="Gokulam",
                 service_radius_km=15, fuel_types=fuels if ptype == "fuel" else None,
                 verification_status="VERIFIED" if verified else "PENDING", is_verified=verified,
                 is_available=online, lat=lat, lng=lng, rating_avg=rating, rating_count=count)
    db.session.add(p)
    db.session.flush()
    return p


def _seed():
    _user("Admin", "admin@test.in", "admin")
    cust = _user("Customer", "cust@test.in")
    db.session.add(Vehicle(user_id=cust.id, make="Maruti", model="Swift",
                           registration_number="KA09AB1234", fuel_type="petrol"))
    _user("Other", "other@test.in")
    # near (≈1 km) and far (≈4 km) fuel providers, plus a mechanic
    _provider("NearFuel", "near@test.in", "fuel", 12.3180, 76.6430)
    _provider("FarFuel", "far@test.in", "fuel", 12.3400, 76.6500)
    _provider("Mech", "mech@test.in", "mechanic", 12.3050, 76.6350)
    _provider("Pending", "pending@test.in", "fuel", 12.3110, 76.6410, verified=False, online=False)
    db.session.commit()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password=PASSWORD):
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.get_json()
    return {"Authorization": f"Bearer {res.get_json()['access_token']}"}


@pytest.fixture()
def auth(client):
    cache = {}

    def _get(email):
        if email not in cache:
            cache[email] = login(client, email)
        return cache[email]
    return _get


def fuel_request_payload(**overrides):
    data = {"service_type": "fuel", "fuel_type": "petrol", "quantity_litres": 5,
            "lat": CUSTOMER_LOC[0], "lng": CUSTOMER_LOC[1], "address": "Test road",
            "auto_assign": True}
    data.update(overrides)
    return data


def provider_by_email(email):
    from sqlalchemy import select
    return db.session.scalar(select(Provider).join(User).where(User.email == email))
