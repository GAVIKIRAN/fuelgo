from datetime import timedelta

from sqlalchemy import func, select

from ..extensions import db
from ..models import (Payment, PaymentStatus, ProviderDocument, RequestStatus, ServiceRequest,
                      VerificationStatus, utcnow)
from ..utils.errors import Conflict, Forbidden, NotFound
from ..utils.files import save_upload
from . import pricing_service
from .tracking_service import update_provider_location

DOC_TYPES = ("driving_license", "id_proof", "vehicle_rc", "fuel_permit", "trade_certificate",
             "other")


def get_profile(user):
    if user.provider is None:
        raise NotFound("Provider profile")
    return user.provider


def update_profile(user, data):
    p = get_profile(user)
    for field in ("business_name", "zone", "service_radius_km", "vehicle_info", "tools_info"):
        if field in data:
            setattr(p, field, data[field])
    if "fuel_types" in data:
        p.fuel_types = ",".join(data["fuel_types"])
    db.session.commit()
    return p.to_dict(include_documents=True)


def set_availability(user, is_available, lat=None, lng=None):
    p = get_profile(user)
    if is_available and not p.is_verified:
        raise Forbidden("Your account must be verified by an admin before going online")
    if not is_available:
        active = db.session.scalar(select(ServiceRequest.id).where(
            ServiceRequest.provider_id == p.id,
            ServiceRequest.status.in_(RequestStatus.PROVIDER_ACTIVE)))
        if active:
            raise Conflict("Finish your current job before going offline",
                           details={"active_request_id": active})
    p.is_available = is_available
    if lat is not None and lng is not None:
        update_provider_location(p, lat, lng)  # commits
    else:
        db.session.commit()
    if not is_available:
        # hand pending offers to someone else
        from . import request_service
        pending = db.session.scalars(select(ServiceRequest).where(
            ServiceRequest.provider_id == p.id, ServiceRequest.status == RequestStatus.PENDING))
        for req in list(pending):
            request_service.reject_request(user, req.id, "Provider went offline")
    return p.to_dict()


def upload_document(user, doc_type, file_storage):
    p = get_profile(user)
    if doc_type not in DOC_TYPES:
        from ..utils.errors import APIError
        raise APIError(f"doc_type must be one of: {', '.join(DOC_TYPES)}", 422)
    path = save_upload(file_storage, f"documents/{p.id}")
    doc = ProviderDocument(provider_id=p.id, doc_type=doc_type, file_path=path,
                           original_name=file_storage.filename[:255])
    db.session.add(doc)
    if p.verification_status == VerificationStatus.REJECTED:
        p.verification_status = VerificationStatus.PENDING  # re-submit for review
    db.session.commit()
    return doc.to_dict()


def delete_document(user, doc_id):
    p = get_profile(user)
    doc = db.session.get(ProviderDocument, doc_id)
    if doc is None or doc.provider_id != p.id:
        raise NotFound("Document")
    db.session.delete(doc)
    db.session.commit()


def earnings(user):
    p = get_profile(user)
    commission = pricing_service.get_config()["provider_commission_pct"] / 100
    completed = list(db.session.scalars(select(ServiceRequest).where(
        ServiceRequest.provider_id == p.id, ServiceRequest.status == RequestStatus.COMPLETED)))
    now = utcnow()
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_week = start_today - timedelta(days=6)
    start_month = start_today - timedelta(days=29)

    def net(reqs):
        return round(sum((r.final_price or 0) for r in reqs) * (1 - commission), 2)

    daily = []
    for i in range(6, -1, -1):
        day = start_today - timedelta(days=i)
        reqs = [r for r in completed if r.completed_at and day <= r.completed_at < day + timedelta(days=1)]
        daily.append({"date": day.date().isoformat(), "earnings": net(reqs), "jobs": len(reqs)})

    paid_ids = set(db.session.scalars(select(Payment.request_id).where(
        Payment.status == PaymentStatus.SUCCESS,
        Payment.request_id.in_([r.id for r in completed] or [0]))))
    unpaid = [r for r in completed if r.id not in paid_ids]
    total_jobs = db.session.scalar(select(func.count(ServiceRequest.id))
                                   .where(ServiceRequest.provider_id == p.id))
    return {
        "commission_pct": commission * 100,
        "total_earnings": net(completed),
        "gross_revenue": round(sum((r.final_price or 0) for r in completed), 2),
        "today": net([r for r in completed if r.completed_at and r.completed_at >= start_today]),
        "this_week": net([r for r in completed if r.completed_at and r.completed_at >= start_week]),
        "this_month": net([r for r in completed if r.completed_at and r.completed_at >= start_month]),
        "completed_jobs": len(completed),
        "total_jobs": total_jobs,
        "pending_payments": len(unpaid),
        "rating_avg": round(p.rating_avg or 0, 2),
        "rating_count": p.rating_count,
        "daily": daily,
    }
