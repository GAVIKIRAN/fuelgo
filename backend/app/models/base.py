from datetime import datetime, timezone

from ..extensions import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    """Serialise a naive-UTC datetime as ISO-8601 with a Z suffix."""
    return dt.isoformat() + "Z" if dt else None


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Role:
    USER = "user"
    PROVIDER = "provider"
    ADMIN = "admin"
    ALL = (USER, PROVIDER, ADMIN)


class ServiceType:
    FUEL = "fuel"
    MECHANIC = "mechanic"
    ALL = (FUEL, MECHANIC)


class FuelType:
    PETROL = "petrol"
    DIESEL = "diesel"
    CNG = "cng"
    ALL = (PETROL, DIESEL, CNG)


class ProblemCategory:
    FLAT_TYRE = "flat_tyre"
    BATTERY = "battery_jumpstart"
    ENGINE = "engine_trouble"
    TOWING = "towing"
    GENERAL = "general"
    ALL = (FLAT_TYRE, BATTERY, ENGINE, TOWING, GENERAL)


class RequestStatus:
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ALL = (PENDING, ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED)
    ACTIVE = (PENDING, ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS)
    PROVIDER_ACTIVE = (ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS)
    TERMINAL = (COMPLETED, REJECTED, CANCELLED)
    # Allowed forward transitions driven by the provider
    PROVIDER_FLOW = {
        ACCEPTED: EN_ROUTE,
        EN_ROUTE: ARRIVED,
        ARRIVED: IN_PROGRESS,
        IN_PROGRESS: COMPLETED,
    }
    CANCELLABLE = (PENDING, ACCEPTED, EN_ROUTE)


class VerificationStatus:
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"
    ALL = (PENDING, VERIFIED, REJECTED, SUSPENDED)


class PaymentMethod:
    UPI = "UPI"
    CARD = "CARD"
    CASH = "CASH"
    ALL = (UPI, CARD, CASH)


class PaymentStatus:
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    ALL = (PENDING, SUCCESS, FAILED, REFUNDED)
