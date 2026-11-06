from datetime import timedelta

from sqlalchemy import func, or_, select

from ..extensions import db
from ..models import (Complaint, Feedback, Payment, PaymentStatus, Provider, RequestStatus, Role,
                      ServiceRequest, User, VerificationStatus, utcnow)
from ..utils.errors import Conflict, NotFound
from ..utils.pagination import paginate
from .notification_service import notify
from .request_service import _apply_filters


def dashboard():
    count = lambda model, *where: db.session.scalar(select(func.count(model.id)).where(*where))
    by_status = dict(db.session.execute(
        select(ServiceRequest.status, func.count(ServiceRequest.id))
        .group_by(ServiceRequest.status)).all())
    by_type = dict(db.session.execute(
        select(ServiceRequest.service_type, func.count(ServiceRequest.id))
        .group_by(ServiceRequest.service_type)).all())
    revenue = db.session.scalar(select(func.coalesce(func.sum(Payment.amount), 0))
                                .where(Payment.status == PaymentStatus.SUCCESS))
    avg_rating = db.session.scalar(select(func.avg(Feedback.rating)))

    start = (utcnow() - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
    recent = db.session.execute(select(ServiceRequest.created_at, ServiceRequest.service_type)
                                .where(ServiceRequest.created_at >= start)).all()
    payments = db.session.execute(select(Payment.paid_at, Payment.amount).where(
        Payment.status == PaymentStatus.SUCCESS, Payment.paid_at >= start)).all()
    per_day = []
    for i in range(14):
        day = (start + timedelta(days=i)).date()
        per_day.append({
            "date": day.isoformat(),
            "fuel": sum(1 for c, t in recent if c.date() == day and t == "fuel"),
            "mechanic": sum(1 for c, t in recent if c.date() == day and t == "mechanic"),
            "revenue": round(sum(a for p, a in payments if p and p.date() == day), 2),
        })

    return {
        "totals": {
            "users": count(User, User.role == Role.USER),
            "providers": count(Provider),
            "verified_providers": count(Provider, Provider.is_verified.is_(True)),
            "pending_verifications": count(Provider, Provider.verification_status == VerificationStatus.PENDING),
            "online_providers": count(Provider, Provider.is_available.is_(True)),
            "requests": count(ServiceRequest),
            "active_requests": count(ServiceRequest, ServiceRequest.status.in_(RequestStatus.ACTIVE)),
            "revenue": round(float(revenue or 0), 2),
            "avg_rating": round(float(avg_rating), 2) if avg_rating else None,
            "open_complaints": count(Complaint, Complaint.status == "OPEN"),
        },
        "requests_by_status": {s: by_status.get(s, 0) for s in RequestStatus.ALL},
        "requests_by_type": {"fuel": by_type.get("fuel", 0), "mechanic": by_type.get("mechanic", 0)},
        "requests_per_day": per_day,
    }


def list_users(filters):
    q = select(User)
    if filters.get("role"):
        q = q.where(User.role == filters["role"])
    if filters.get("q"):
        term = f"%{filters['q']}%"
        q = q.where(or_(User.name.ilike(term), User.email.ilike(term), User.phone.ilike(term)))
    if filters.get("is_active") in ("true", "false"):
        q = q.where(User.is_active.is_(filters["is_active"] == "true"))
    return paginate(q.order_by(User.created_at.desc()))


def set_user_active(admin, user_id, is_active):
    user = db.session.get(User, user_id)
    if user is None:
        raise NotFound("User")
    if user.id == admin.id:
        raise Conflict("You cannot block your own account")
    user.is_active = is_active
    if not is_active and user.provider:
        user.provider.is_available = False
    db.session.commit()
    return user.to_dict()


def delete_user(admin, user_id):
    user = db.session.get(User, user_id)
    if user is None:
        raise NotFound("User")
    if user.id == admin.id or user.role == Role.ADMIN:
        raise Conflict("Admin accounts cannot be deleted here")
    active = db.session.scalar(select(ServiceRequest.id).where(
        or_(ServiceRequest.user_id == user.id,
            ServiceRequest.provider_id == (user.provider.id if user.provider else -1)),
        ServiceRequest.status.in_(RequestStatus.ACTIVE)))
    if active:
        raise Conflict("User has an active service request", details={"request_id": active})
    db.session.delete(user)
    db.session.commit()


def list_providers(filters):
    q = select(Provider).join(User, Provider.user_id == User.id)
    if filters.get("status"):
        q = q.where(Provider.verification_status == filters["status"])
    if filters.get("type"):
        q = q.where(Provider.provider_type == filters["type"])
    if filters.get("q"):
        term = f"%{filters['q']}%"
        q = q.where(or_(Provider.business_name.ilike(term), User.name.ilike(term),
                        Provider.zone.ilike(term)))
    return paginate(q.order_by(Provider.created_at.desc()),
                    lambda p: p.to_dict(include_documents=True) | {"email": p.user.email})


def verify_provider(admin, provider_id, status, note=None):
    p = db.session.get(Provider, provider_id)
    if p is None:
        raise NotFound("Provider")
    if status != VerificationStatus.VERIFIED:
        active = db.session.scalar(select(ServiceRequest.id).where(
            ServiceRequest.provider_id == p.id,
            ServiceRequest.status.in_(RequestStatus.PROVIDER_ACTIVE)))
        if active and status == VerificationStatus.SUSPENDED:
            raise Conflict("Provider is on an active job; suspend after it completes",
                           details={"request_id": active})
    p.verification_status = status
    p.is_verified = status == VerificationStatus.VERIFIED
    p.verification_note = note
    if not p.is_verified:
        p.is_available = False
    messages = {
        VerificationStatus.VERIFIED: ("Account verified", "You are verified! Go online to start receiving requests."),
        VerificationStatus.REJECTED: ("Verification rejected", f"Your verification was rejected. {note or ''}".strip()),
        VerificationStatus.SUSPENDED: ("Account suspended", f"Your provider account was suspended. {note or ''}".strip()),
    }
    title, msg = messages[status]
    notify(p.user_id, title, msg, "verification", commit=False)
    db.session.commit()
    if not p.is_verified:
        # release any pending offers
        from . import request_service
        for req in list(db.session.scalars(select(ServiceRequest).where(
                ServiceRequest.provider_id == p.id, ServiceRequest.status == RequestStatus.PENDING))):
            request_service.reject_request(p.user, req.id, "Provider no longer available")
    return p.to_dict(include_documents=True)


def list_requests(filters):
    q = select(ServiceRequest)
    if filters.get("provider_id"):
        q = q.where(ServiceRequest.provider_id == filters["provider_id"])
    if filters.get("active") in ("1", "true"):
        q = q.where(ServiceRequest.status.in_(RequestStatus.ACTIVE))
    return paginate(_apply_filters(q, filters).order_by(ServiceRequest.created_at.desc()))

