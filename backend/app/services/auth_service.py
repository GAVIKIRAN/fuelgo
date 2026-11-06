from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import func, select

from ..extensions import db
from ..models import Provider, Role, User, VerificationStatus
from ..utils.errors import APIError, Conflict
from ..utils.geo import ZONES
from .notification_service import notify


def _tokens(user):
    claims = {"role": user.role, "name": user.name}
    return {
        "access_token": create_access_token(identity=str(user.id), additional_claims=claims),
        "refresh_token": create_refresh_token(identity=str(user.id)),
        "user": user.to_dict(include_provider=True),
    }


def register(data):
    email = data["email"].strip().lower()
    if db.session.scalar(select(User).where(func.lower(User.email) == email)):
        raise Conflict("An account with this email already exists")

    user = User(name=data["name"].strip(), email=email, phone=data.get("phone"),
                role=data.get("role", Role.USER))
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()

    if user.role == Role.PROVIDER:
        zone = data.get("zone")
        lat, lng = data.get("lat"), data.get("lng")
        if (lat is None or lng is None) and zone in ZONES:
            lat, lng = ZONES[zone]
        provider = Provider(
            user_id=user.id,
            provider_type=data["provider_type"],
            business_name=data["business_name"].strip(),
            zone=zone,
            service_radius_km=data.get("service_radius_km") or 10.0,
            vehicle_info=data.get("vehicle_info"),
            tools_info=data.get("tools_info"),
            fuel_types=",".join(data.get("fuel_types") or
                                (["petrol", "diesel"] if data["provider_type"] == "fuel" else [])),
            verification_status=VerificationStatus.PENDING,
            is_verified=False,
            is_available=False,
            lat=lat, lng=lng,
        )
        db.session.add(provider)
        db.session.flush()
        # tell every admin a new provider is waiting for verification
        for admin_id in db.session.scalars(select(User.id).where(User.role == Role.ADMIN)):
            notify(admin_id, "New provider registration",
                   f"{provider.business_name} ({provider.provider_type}) is awaiting verification.",
                   "provider_registration", commit=False)
        notify(user.id, "Welcome to FuelGo",
               "Upload your documents. An admin will verify your account before you can go online.",
               "welcome", commit=False)
    else:
        notify(user.id, "Welcome to FuelGo",
               "Add your vehicle so we can help you faster in an emergency.", "welcome",
               commit=False)

    db.session.commit()
    return _tokens(user)


def login(email, password):
    user = db.session.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None or not user.check_password(password):
        raise APIError("Invalid email or password", 401, code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise APIError("Your account has been blocked. Contact support.", 403, code="ACCOUNT_BLOCKED")
    return _tokens(user)


def refresh(user):
    if user is None or not user.is_active:
        raise APIError("Account unavailable", 401)
    claims = {"role": user.role, "name": user.name}
    return {"access_token": create_access_token(identity=str(user.id), additional_claims=claims)}


def update_profile(user, data):
    if data.get("new_password"):
        if not user.check_password(data["current_password"]):
            raise APIError("Current password is incorrect", 422,
                           details={"current_password": ["Incorrect password."]})
        user.set_password(data["new_password"])
    for field in ("name", "phone", "address"):
        if field in data:
            setattr(user, field, data[field])
    db.session.commit()
    return user.to_dict(include_provider=True)
