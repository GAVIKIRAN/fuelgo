from sqlalchemy import func, select

from ..extensions import db
from ..models import Complaint, Feedback, Provider, RequestStatus, Role, User, utcnow
from ..utils.errors import Conflict, Forbidden, NotFound
from ..utils.pagination import paginate
from . import request_service
from .notification_service import notify


def recompute_provider_rating(provider_id):
    avg, count = db.session.execute(
        select(func.avg(Feedback.rating), func.count(Feedback.id))
        .where(Feedback.provider_id == provider_id)).one()
    provider = db.session.get(Provider, provider_id)
    provider.rating_avg = round(float(avg or 0), 2)
    provider.rating_count = int(count or 0)


def submit_feedback(user, data):
    req = request_service.get_request(user, data["request_id"])
    if req.user_id != user.id:
        raise Forbidden("Only the customer can rate this service")
    if req.status != RequestStatus.COMPLETED:
        raise Conflict("You can rate a service once it is completed")
    if req.provider_id is None:
        raise Conflict("No provider to rate for this request")
    if req.feedback is not None:
        raise Conflict("You have already rated this service")
    fb = Feedback(request_id=req.id, user_id=user.id, provider_id=req.provider_id,
                  rating=data["rating"], comment=data.get("comment"))
    db.session.add(fb)
    db.session.flush()
    recompute_provider_rating(req.provider_id)
    notify(req.provider.user_id, "New rating received",
           f"You received {data['rating']}★ for request #{req.id}.", "feedback", req.id,
           commit=False)
    db.session.commit()
    return fb.to_dict()


def provider_ratings(user):
    q = (select(Feedback).where(Feedback.provider_id == user.provider.id)
         .order_by(Feedback.created_at.desc()))
    return paginate(q)


def list_feedback(filters):
    q = select(Feedback)
    if filters.get("rating"):
        q = q.where(Feedback.rating == int(filters["rating"]))
    return paginate(q.order_by(Feedback.created_at.desc()))


def create_complaint(user, data):
    req = request_service.get_request(user, data["request_id"])
    if req.user_id != user.id:
        raise Forbidden("Only the customer can raise a complaint for this request")
    c = Complaint(request_id=req.id, user_id=user.id, provider_id=req.provider_id,
                  subject=data["subject"].strip(), description=data["description"].strip())
    db.session.add(c)
    db.session.flush()
    for admin_id in db.session.scalars(select(User.id).where(User.role == Role.ADMIN)):
        notify(admin_id, "New complaint", f"Complaint on request #{req.id}: {c.subject}",
               "complaint", req.id, commit=False)
    notify(user.id, "Complaint registered",
           f"We received your complaint #{c.id}. Our team will get back to you.", "complaint",
           req.id, commit=False)
    db.session.commit()
    return c.to_dict()


def user_complaints(user):
    return paginate(select(Complaint).where(Complaint.user_id == user.id)
                    .order_by(Complaint.created_at.desc()))


def list_complaints(filters):
    q = select(Complaint)
    if filters.get("status"):
        q = q.where(Complaint.status == filters["status"])
    return paginate(q.order_by(Complaint.created_at.desc()))


def resolve_complaint(admin, complaint_id, note):
    c = db.session.get(Complaint, complaint_id)
    if c is None:
        raise NotFound("Complaint")
    if c.status == "RESOLVED":
        raise Conflict("Complaint already resolved")
    c.status = "RESOLVED"
    c.resolution_note = note
    c.resolved_by = admin.id
    c.resolved_at = utcnow()
    notify(c.user_id, "Complaint resolved", f"Complaint #{c.id} was resolved: {note}",
           "complaint_resolved", c.request_id, commit=False)
    db.session.commit()
    return c.to_dict()
