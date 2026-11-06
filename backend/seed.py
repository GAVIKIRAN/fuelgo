"""Seed the FuelGo database with demo data.

    python seed.py            # migrate + seed (skips if data already exists)
    python seed.py --reset    # wipe everything and seed again
    python seed.py --no-train # skip ML model training

Creates 1 admin, 5 users with vehicles, 8 providers around Mysuru, ~600 historical
completed requests (plus a few cancelled ones), payments, feedback and complaints,
then trains the fuel-demand model.
"""
import argparse
import random
import sys
from datetime import timedelta

from flask_migrate import upgrade

from app import create_app
from app.extensions import db
from app.models import (Complaint, Feedback, Notification, Payment, Provider, RequestStatusHistory,
                        ServiceRequest, User, Vehicle, utcnow)
from app.services import pricing_service
from app.services.feedback_service import recompute_provider_rating
from app.services.payment_service import new_transaction_id
from app.utils.geo import ZONES, estimate_eta_minutes, haversine_km, nearest_zone, traffic_level_for_hour

ADMIN = {"name": "FuelGo Admin", "email": "admin@fuelgo.in", "phone": "9845000001",
         "password": "Admin@123"}

USERS = [
    ("Ravi Kumar", "ravi@fuelgo.in", "9845011111", [("Maruti Suzuki", "Swift", "KA09MA1234", "petrol", "car")]),
    ("Ananya Rao", "ananya@fuelgo.in", "9845022222", [("Hyundai", "Creta", "KA09MB4521", "diesel", "car"),
                                                      ("Honda", "Activa 6G", "KA09HX7788", "petrol", "scooter")]),
    ("Mohammed Irfan", "irfan@fuelgo.in", "9845033333", [("Tata", "Nexon", "KA55N3030", "petrol", "car")]),
    ("Priya Shetty", "priya@fuelgo.in", "9845044444", [("Maruti Suzuki", "Ertiga CNG", "KA09P6060", "cng", "car")]),
    ("Kiran Gowda", "kiran@fuelgo.in", "9845055555", [("Mahindra", "Bolero", "KA45K9090", "diesel", "car"),
                                                      ("Royal Enfield", "Classic 350", "KA09RE350", "petrol", "bike")]),
]
USER_PASSWORD = "User@123"

# name, email, phone, type, business, zone, lat, lng, fuel_types, verified, online, extras
PROVIDERS = [
    ("Suresh Naik", "suresh.fuel@fuelgo.in", "9886000001", "fuel", "Chamundi Fuel Express",
     "Vijayanagar", 12.3285, 76.6145, "petrol,diesel", True, True, "Mahindra Bolero Pickup with 200L certified tank"),
    ("Lakshmi Devi", "lakshmi.fuel@fuelgo.in", "9886000002", "fuel", "Mysuru Doorstep Diesel",
     "Nazarbad", 12.3035, 76.6655, "diesel,petrol", True, True, "Tata Ace with 150L bowser"),
    ("Arjun Hegde", "arjun.fuel@fuelgo.in", "9886000003", "fuel", "GreenGas CNG Mobile",
     "Kuvempunagar", 12.2860, 76.6300, "cng,petrol", True, True, "CNG cascade carrier"),
    ("Deepak Patil", "deepak.fuel@fuelgo.in", "9886000004", "fuel", "Hebbal Fuel Rescue",
     "Hebbal", 12.3510, 76.6175, "petrol,diesel", False, False, "Ape Xtra with 100L tank"),
    ("Manjunath S", "manju.mech@fuelgo.in", "9886000005", "mechanic", "Manju Auto Works",
     "Gokulam", 12.3310, 76.6395, "", True, True, "Tyre kit, jump starter, OBD scanner"),
    ("Fathima Begum", "fathima.mech@fuelgo.in", "9886000006", "mechanic", "QuickFix Roadside",
     "Saraswathipuram", 12.2995, 76.6265, "", True, True, "Portable compressor, battery tester"),
    ("Venkatesh R", "venky.mech@fuelgo.in", "9886000007", "mechanic", "Venky Towing & Repairs",
     "Bannimantap", 12.3345, 76.6610, "", True, True, "Flatbed tow truck, hydraulic jack"),
    ("Naveen Kumar", "naveen.mech@fuelgo.in", "9886000008", "mechanic", "Devaraja Garage On-Call",
     "Devaraja Mohalla", 12.3110, 76.6530, "", True, True, "Two-wheeler & car tools"),
]
PROVIDER_PASSWORD = "Provider@123"

HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 4, 7, 10, 11, 8, 7, 6, 6, 6, 7, 9, 12, 13, 11, 8, 5, 3, 2]
ZONE_WEIGHTS = {"Vijayanagar": 14, "Kuvempunagar": 11, "Gokulam": 9, "Jayalakshmipuram": 8,
                "Nazarbad": 12, "Saraswathipuram": 9, "Hebbal": 10, "Bannimantap": 11,
                "Chamundipuram": 7, "Devaraja Mohalla": 9}
COMMENTS = {5: ["Super quick, saved my day!", "Very professional and polite.", "Arrived before ETA. Excellent!"],
            4: ["Good service, slightly delayed.", "Helpful and friendly.", "Fair price."],
            3: ["Okay service.", "Took longer than expected."],
            2: ["Late arrival.", "Charged more than estimate."],
            1: ["Very late and rude."]}
ADDRESSES = ["Near {z} bus stop", "{z} main road", "Opposite {z} park", "{z} 2nd cross",
             "Behind {z} temple", "{z} ring road junction"]


def weather_for(rng, month):
    if month in (6, 7, 8, 9):
        return rng.choices(["clear", "cloudy", "rain", "storm"], [25, 30, 35, 10])[0]
    return rng.choices(["clear", "cloudy", "rain", "storm"], [60, 25, 12, 3])[0]


def reset_db():
    db.drop_all()
    with db.engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")


def seed(train_model=True):
    rng = random.Random(2026)
    pricing_service.ensure_defaults()

    admin = User(name=ADMIN["name"], email=ADMIN["email"], phone=ADMIN["phone"], role="admin")
    admin.set_password(ADMIN["password"])
    db.session.add(admin)

    users = []
    for name, email, phone, vehicles in USERS:
        u = User(name=name, email=email, phone=phone, role="user",
                 address=f"{rng.choice(list(ZONES))}, Mysuru")
        u.set_password(USER_PASSWORD)
        db.session.add(u)
        db.session.flush()
        for make, model, reg, fuel, vtype in vehicles:
            db.session.add(Vehicle(user_id=u.id, make=make, model=model, registration_number=reg,
                                   fuel_type=fuel, vehicle_type=vtype))
        users.append(u)

    providers = []
    for (name, email, phone, ptype, business, zone, lat, lng, fuels, verified, online,
         extras) in PROVIDERS:
        u = User(name=name, email=email, phone=phone, role="provider")
        u.set_password(PROVIDER_PASSWORD)
        db.session.add(u)
        db.session.flush()
        p = Provider(user_id=u.id, provider_type=ptype, business_name=business, zone=zone,
                     service_radius_km=12.0, fuel_types=fuels or None,
                     vehicle_info=extras if ptype == "fuel" else "Service van",
                     tools_info=extras if ptype == "mechanic" else "Fuel dispensing nozzle, fire extinguisher",
                     verification_status="VERIFIED" if verified else "PENDING",
                     is_verified=verified, is_available=online, lat=lat, lng=lng,
                     last_location_at=utcnow())
        db.session.add(p)
        providers.append(p)
    db.session.flush()

    # ---------------- historical requests
    fuel_providers = [p for p in providers if p.provider_type == "fuel" and p.is_verified]
    mech_providers = [p for p in providers if p.provider_type == "mechanic" and p.is_verified]
    prices = pricing_service.get_fuel_prices()
    now = utcnow()
    zones, zone_w = list(ZONE_WEIGHTS), list(ZONE_WEIGHTS.values())
    n_completed = 0
    for i in range(640):
        days_ago = rng.randint(1, 180)
        hour_ist = rng.choices(range(24), HOUR_WEIGHTS)[0]
        created_ist = (now + timedelta(hours=5, minutes=30) - timedelta(days=days_ago)).replace(
            hour=hour_ist, minute=rng.randint(0, 59), second=rng.randint(0, 59), microsecond=0)
        created = created_ist - timedelta(hours=5, minutes=30)  # store UTC
        zone = rng.choices(zones, zone_w)[0]
        zlat, zlng = ZONES[zone]
        lat, lng = zlat + rng.uniform(-0.008, 0.008), zlng + rng.uniform(-0.008, 0.008)
        user = rng.choice(users)
        is_fuel = rng.random() < 0.65
        status = "COMPLETED" if rng.random() > 0.06 else "CANCELLED"
        pool = fuel_providers if is_fuel else mech_providers
        provider = min(pool, key=lambda p: haversine_km(lat, lng, p.lat, p.lng) + rng.uniform(0, 3))
        dist = round(haversine_km(lat, lng, provider.lat, provider.lng), 2)
        traffic = traffic_level_for_hour(hour_ist)
        eta = estimate_eta_minutes(dist, traffic)

        req = ServiceRequest(user_id=user.id, provider_id=provider.id, lat=lat, lng=lng,
                             address=rng.choice(ADDRESSES).format(z=zone) + ", Mysuru",
                             zone=nearest_zone(lat, lng), status=status,
                             distance_km=dist, eta_minutes=eta, weather=weather_for(rng, created.month),
                             traffic_level=traffic, created_at=created, updated_at=created,
                             auto_assign=rng.random() < 0.4)
        if is_fuel:
            req.service_type = "fuel"
            req.fuel_type = rng.choices(["petrol", "diesel", "cng"], [62, 30, 8])[0]
            if req.fuel_type not in provider.fuel_type_list:
                req.fuel_type = provider.fuel_type_list[0]
            req.quantity_litres = float(rng.choice([2, 3, 5, 5, 5, 8, 10, 10, 15, 20]))
            fuel_cost = prices[req.fuel_type] * req.quantity_litres
            delivery = 49 + max(0, dist - 2) * 8
            breakdown_lines = [{"label": f"{req.fuel_type.title()} {req.quantity_litres:g} L",
                                "amount": round(fuel_cost, 2)},
                               {"label": "Delivery fee", "amount": round(delivery, 2)}]
        else:
            req.service_type = "mechanic"
            req.problem_category = rng.choices(
                ["flat_tyre", "battery_jumpstart", "engine_trouble", "towing", "general"],
                [35, 25, 18, 8, 14])[0]
            base = {"flat_tyre": 199, "battery_jumpstart": 249, "engine_trouble": 449,
                    "towing": 999, "general": 299}[req.problem_category]
            req.description = {"flat_tyre": "Rear tyre punctured", "battery_jumpstart": "Car won't start",
                               "engine_trouble": "Engine overheating", "towing": "Need towing to garage",
                               "general": "Strange noise from brakes"}[req.problem_category]
            breakdown_lines = [{"label": "Base charge", "amount": base},
                               {"label": "Distance charge", "amount": round(max(0, dist - 2) * 10, 2)}]
        req.estimated_price = round(sum(l["amount"] for l in breakdown_lines), 2)
        req.price_breakdown = {"lines": breakdown_lines, "total": req.estimated_price,
                               "distance_km": dist, "currency": "INR"}
        db.session.add(req)
        db.session.flush()
        db.session.add(RequestStatusHistory(request_id=req.id, status="PENDING", created_at=created,
                                            note="Request created", changed_by=user.id))

        if status == "CANCELLED":
            req.cancelled_at = created + timedelta(minutes=rng.randint(1, 6))
            req.cancel_reason = rng.choice(["Found a fuel station nearby", "Vehicle started", "Changed plans"])
            db.session.add(RequestStatusHistory(request_id=req.id, status="CANCELLED",
                                                created_at=req.cancelled_at, note=req.cancel_reason,
                                                changed_by=user.id))
            continue

        n_completed += 1
        req.accepted_at = created + timedelta(minutes=rng.randint(1, 4))
        req.arrived_at = req.accepted_at + timedelta(minutes=eta + rng.randint(-3, 8))
        req.completed_at = req.arrived_at + timedelta(minutes=rng.randint(5, 45))
        req.final_price = round(req.estimated_price * rng.choice([1, 1, 1, 1, 1.05, 1.1]), 2)
        req.updated_at = req.completed_at
        for st, ts in (("ACCEPTED", req.accepted_at), ("EN_ROUTE", req.accepted_at + timedelta(minutes=1)),
                       ("ARRIVED", req.arrived_at), ("IN_PROGRESS", req.arrived_at + timedelta(minutes=1)),
                       ("COMPLETED", req.completed_at)):
            db.session.add(RequestStatusHistory(request_id=req.id, status=st, created_at=ts,
                                                changed_by=provider.user_id))
        method = rng.choices(["UPI", "CARD", "CASH"], [60, 15, 25])[0]
        paid_at = req.completed_at + timedelta(minutes=rng.randint(1, 10))
        db.session.add(Payment(request_id=req.id, user_id=user.id, amount=req.final_price,
                               method=method, gateway="cash" if method == "CASH" else "mock",
                               transaction_id=new_transaction_id(), status="SUCCESS",
                               gateway_reference=f"pay_seed_{req.id}", paid_at=paid_at,
                               created_at=paid_at, updated_at=paid_at))
        if rng.random() < 0.72:
            rating = rng.choices([5, 4, 3, 2, 1], [48, 32, 12, 5, 3])[0]
            db.session.add(Feedback(request_id=req.id, user_id=user.id, provider_id=provider.id,
                                    rating=rating, comment=rng.choice(COMMENTS[rating]),
                                    created_at=paid_at + timedelta(minutes=2)))
            if rating <= 2 and rng.random() < 0.5:
                resolved = rng.random() < 0.5
                db.session.add(Complaint(
                    request_id=req.id, user_id=user.id, provider_id=provider.id,
                    subject="Service delay" if rating == 2 else "Unprofessional behaviour",
                    description="The provider arrived much later than the ETA shown in the app.",
                    status="RESOLVED" if resolved else "OPEN",
                    resolution_note="Spoke to provider; partial refund issued as goodwill." if resolved else None,
                    resolved_by=admin.id if resolved else None,
                    resolved_at=paid_at + timedelta(days=1) if resolved else None,
                    created_at=paid_at + timedelta(minutes=5), updated_at=paid_at + timedelta(minutes=5)))

    db.session.flush()
    for p in providers:
        recompute_provider_rating(p.id)

    for u in users:
        db.session.add(Notification(user_id=u.id, title="Welcome to FuelGo",
                                    message="Your roadside assistant is ready. Tap Request Help in an emergency.",
                                    type="welcome"))
    db.session.add(Notification(user_id=admin.id, title="Provider awaiting verification",
                                message="Hebbal Fuel Rescue (fuel) is awaiting verification.",
                                type="provider_registration"))
    db.session.commit()
    print(f"Seeded: 1 admin, {len(users)} users, {len(providers)} providers, "
          f"{n_completed} completed historical requests.")

    if train_model:
        from ml.dataset import history_from_db
        from ml.train import train
        print("\nTraining fuel-demand models...")
        train(history_from_db())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="drop all data and reseed")
    parser.add_argument("--no-train", action="store_true", help="skip ML model training")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.reset:
            print("Resetting database...")
            reset_db()
        upgrade()  # apply Alembic migrations (creates tables on first run)
        if db.session.query(User.id).first() is not None:
            print("Database already has data. Use `python seed.py --reset` to start over.")
            sys.exit(0)
        seed(train_model=not args.no_train)
        print("\nDemo logins:")
        print(f"  admin     {ADMIN['email']} / {ADMIN['password']}")
        print(f"  user      {USERS[0][1]} / {USER_PASSWORD}")
        print(f"  provider  {PROVIDERS[0][1]} / {PROVIDER_PASSWORD}  (fuel)")
        print(f"  provider  {PROVIDERS[4][1]} / {PROVIDER_PASSWORD}  (mechanic)")


if __name__ == "__main__":
    main()
