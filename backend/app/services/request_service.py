"""Service request lifecycle:

PENDING → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED
(plus REJECTED when no provider is left, and CANCELLED by the customer/admin).
"""
from datetime import datetime, time

from sqlalchemy import or_, select

from ..extensions import db
from ..models import (Provider, RequestRejection, RequestStatus, RequestStatusHistory, Role,
                      ServiceRequest, ServiceType, User, Vehicle, utcnow)
from ..utils.errors import APIError, Conflict, Forbidden, NotFound
from ..utils.geo import estimate_eta_minutes, haversine_km, nearest_zone, traffic_level_for_hour
from ..utils.pagination import paginate
from ..utils.timeutil import now_ist
from . import matching_service, pricing_service
from .notification_service import notify
from .realtime import broadcast_request_update, emit_to_user

STATUS_MESSAGES = {
    RequestStatus.ACCEPTED: ("Provider accepted", "{provider} accepted your request. ETA {eta} min."),
    RequestStatus.EN_ROUTE: ("Provider on the way", "{provider} is on the way. ETA {eta} min."),
    RequestStatus.ARRIVED: ("Provider arrived", "{provider} has arrived at your location."),
    RequestStatus.IN_PROGRESS: ("Service started", "{provider} has started working on your request."),
    RequestStatus.COMPLETED: ("Service completed",
                              "Your service is complete. Amount due: ₹{amount}. Please pay and rate."),
}


# ---------------------------------------------------------------- helpers
def _add_history(req, status, note=None, actor=None):
    db.session.add(RequestStatusHistory(request_id=req.id, status=status, note=note,
                                        changed_by=actor.id if actor else None))


def _label(req):
    return "fuel delivery" if req.service_type == ServiceType.FUEL else "mechanic assistance"


def _estimate_for(req, distance_km):
    return pricing_service.estimate(req.service_type, distance_km, fuel_type=req.fuel_type,
                                    quantity_litres=req.quantity_litres,
                                    problem_category=req.problem_category, hour=now_ist().hour)


def _assign(req, candidate):
    req.provider_id = candidate["provider"].id
    req.provider = candidate["provider"]
    req.distance_km = candidate["distance_km"]
    req.eta_minutes = candidate["eta_minutes"]
    breakdown = _estimate_for(req, candidate["distance_km"])
    req.estimated_price = breakdown["total"]
    req.price_breakdown = breakdown


def _notify_provider_new(req):
    notify(req.provider.user_id, "New service request",
           f"New {_label(req)} request {req.distance_km:.1f} km away"
           f"{' at ' + req.address if req.address else ''}.", "request_new", req.id, commit=False)
    emit_to_user(req.provider.user_id, "request:new", req.to_dict())


def get_request(user, request_id, lock=False):
    q = select(ServiceRequest).where(ServiceRequest.id == request_id)
    if lock:
        q = q.with_for_update()
    req = db.session.scalar(q)
    if req is None:
        raise NotFound("Service request")
    if user.role == Role.ADMIN:
        return req
    if user.role == Role.USER and req.user_id == user.id:
        return req
    if user.role == Role.PROVIDER and user.provider and req.provider_id == user.provider.id:
        return req
    raise NotFound("Service request")


def _provider_of(user):
    if user.provider is None:
        raise Forbidden("Provider profile not found")
    return user.provider


# ---------------------------------------------------------------- customer actions
def estimate(data):
    """Price estimate + nearest provider distance for the request form."""
    candidates = matching_service.find_candidates(
        data["service_type"], data["lat"], data["lng"], fuel_type=data.get("fuel_type"), limit=1)
    distance = candidates[0]["distance_km"] if candidates else None
    breakdown = pricing_service.estimate(
        data["service_type"], distance or 0.0, fuel_type=data.get("fuel_type"),
        quantity_litres=data.get("quantity_litres"),
        problem_category=data.get("problem_category"), hour=now_ist().hour)
    breakdown["providers_available"] = bool(candidates)
    breakdown["nearest_eta_minutes"] = candidates[0]["eta_minutes"] if candidates else None
    return breakdown


def match(data):
    candidates = matching_service.find_candidates(
        data["service_type"], data["lat"], data["lng"], fuel_type=data.get("fuel_type"))

    def est(distance):
        if data["service_type"] == ServiceType.FUEL and not data.get("fuel_type"):
            return None
        return pricing_service.estimate(
            data["service_type"], distance, fuel_type=data.get("fuel_type"),
            quantity_litres=data.get("quantity_litres") or 5,
            problem_category=data.get("problem_category"), hour=now_ist().hour)["total"]

    return matching_service.serialize_candidates(candidates, est)


def _ensure_no_active_request(user):
    active = db.session.scalar(select(ServiceRequest).where(
        ServiceRequest.user_id == user.id, ServiceRequest.status.in_(RequestStatus.ACTIVE)))
    if active:
        raise Conflict("You already have an active request. Complete or cancel it first.",
                       details={"active_request_id": active.id})


def create_request(user, data, photo_path=None):
    _ensure_no_active_request(user)

    vehicle = None
    if data.get("vehicle_id"):
        vehicle = db.session.get(Vehicle, data["vehicle_id"])
        if vehicle is None or vehicle.user_id != user.id:
            raise NotFound("Vehicle")
        if (data["service_type"] == ServiceType.FUEL and vehicle.fuel_type in ("petrol", "diesel", "cng")
                and vehicle.fuel_type != data["fuel_type"]):
            raise APIError(f"{vehicle.make} {vehicle.model} runs on {vehicle.fuel_type}, "
                           f"not {data['fuel_type']}.", 422,
                           details={"fuel_type": ["Does not match the selected vehicle."]})

    is_fuel = data["service_type"] == ServiceType.FUEL
    hour = now_ist().hour
    req = ServiceRequest(
        user_id=user.id, vehicle_id=vehicle.id if vehicle else None,
        service_type=data["service_type"],
        fuel_type=data.get("fuel_type") if is_fuel else None,
        quantity_litres=data.get("quantity_litres") if is_fuel else None,
        problem_category=None if is_fuel else data.get("problem_category"),
        description=data.get("description"), photo_path=photo_path,
        lat=data["lat"], lng=data["lng"], address=data.get("address"),
        zone=nearest_zone(data["lat"], data["lng"]),
        status=RequestStatus.PENDING, auto_assign=bool(data.get("auto_assign")),
        traffic_level=traffic_level_for_hour(hour), weather="clear",
    )

    candidates = matching_service.find_candidates(
        req.service_type, req.lat, req.lng, fuel_type=req.fuel_type, limit=25)
    if not candidates:
        raise APIError("No verified providers are available near you right now. "
                       "Please try again in a few minutes.", 404, code="NO_PROVIDERS")
    chosen = None
    if data.get("provider_id"):
        chosen = next((c for c in candidates if c["provider"].id == data["provider_id"]), None)
        if chosen is None:
            if not req.auto_assign:
                raise Conflict("The selected provider is no longer available. "
                               "Please pick another or use auto-assign.", details={"code": "PROVIDER_UNAVAILABLE"})
    if chosen is None:
        chosen = candidates[0]

    db.session.add(req)
    db.session.flush()
    _assign(req, chosen)
    _add_history(req, RequestStatus.PENDING,
                 f"Request created, offered to {chosen['provider'].business_name}", user)
    notify(user.id, "Booking confirmed",
           f"Your {_label(req)} request #{req.id} was sent to {chosen['provider'].business_name}. "
           f"Waiting for them to accept.", "booking", req.id, commit=False)
    _notify_provider_new(req)
    db.session.commit()
    broadcast_request_update(req)
    return req


def cancel_request(user, request_id, reason):
    req = get_request(user, request_id, lock=True)
    if user.role == Role.PROVIDER:
        raise Forbidden("Providers should reject the request instead of cancelling")
    if req.status not in RequestStatus.CANCELLABLE:
        raise Conflict(f"A request that is {req.status.replace('_', ' ').lower()} cannot be cancelled")
    req.status = RequestStatus.CANCELLED
    req.cancelled_at = utcnow()
    req.cancel_reason = reason
    _add_history(req, RequestStatus.CANCELLED, reason, user)
    if req.provider:
        notify(req.provider.user_id, "Request cancelled",
               f"Request #{req.id} was cancelled: {reason}", "request_cancelled", req.id, commit=False)
    if user.role == Role.ADMIN:
        notify(req.user_id, "Request cancelled",
               f"Your request #{req.id} was cancelled by support: {reason}", "request_cancelled",
               req.id, commit=False)
    db.session.commit()
    broadcast_request_update(req)
    return req


def list_user_requests(user, filters):
    q = select(ServiceRequest).where(ServiceRequest.user_id == user.id)
    return paginate(_apply_filters(q, filters).order_by(ServiceRequest.created_at.desc()))


def active_request_for_user(user):
    req = db.session.scalar(select(ServiceRequest).where(
        ServiceRequest.user_id == user.id, ServiceRequest.status.in_(RequestStatus.ACTIVE))
        .order_by(ServiceRequest.created_at.desc()))
    return req


def _apply_filters(q, filters):
    if filters.get("status"):
        q = q.where(ServiceRequest.status == filters["status"])
    if filters.get("service_type"):
        q = q.where(ServiceRequest.service_type == filters["service_type"])
    if filters.get("date_from"):
        q = q.where(ServiceRequest.created_at >= datetime.combine(filters["date_from"], time.min))
    if filters.get("date_to"):
        q = q.where(ServiceRequest.created_at <= datetime.combine(filters["date_to"], time.max))
    if filters.get("q"):
        term = f"%{filters['q']}%"
        q = q.join(User, User.id == ServiceRequest.user_id).where(
            or_(ServiceRequest.address.ilike(term), User.name.ilike(term),
                ServiceRequest.zone.ilike(term)))
    return q


# ---------------------------------------------------------------- provider actions
def provider_incoming(user):
    provider = _provider_of(user)
    rows = db.session.scalars(select(ServiceRequest).where(
        ServiceRequest.provider_id == provider.id,
        ServiceRequest.status == RequestStatus.PENDING).order_by(ServiceRequest.created_at))
    return [r.to_dict() for r in rows]


def provider_active_job(user):
    provider = _provider_of(user)
    return db.session.scalar(select(ServiceRequest).where(
        ServiceRequest.provider_id == provider.id,
        ServiceRequest.status.in_(RequestStatus.PROVIDER_ACTIVE)))


def provider_history(user, filters):
    provider = _provider_of(user)
    q = select(ServiceRequest).where(ServiceRequest.provider_id == provider.id)
    return paginate(_apply_filters(q, filters).order_by(ServiceRequest.created_at.desc()))


def accept_request(user, request_id):
    provider = _provider_of(user)
    if not provider.is_verified:
        raise Forbidden("Your account is awaiting admin verification")
    req = get_request(user, request_id, lock=True)
    if req.status != RequestStatus.PENDING:
        raise Conflict(f"Request is already {req.status.lower()}")
    other = db.session.scalar(select(ServiceRequest).where(
        ServiceRequest.provider_id == provider.id, ServiceRequest.id != req.id,
        ServiceRequest.status.in_(RequestStatus.PROVIDER_ACTIVE)))
    if other:
        raise Conflict("Finish your current job before accepting another one",
                       details={"active_request_id": other.id})

    if provider.lat is not None:
        req.distance_km = round(haversine_km(provider.lat, provider.lng, req.lat, req.lng), 2)
        req.eta_minutes = estimate_eta_minutes(req.distance_km, traffic_level_for_hour(now_ist().hour))
    req.status = RequestStatus.ACCEPTED
    req.accepted_at = utcnow()
    _add_history(req, RequestStatus.ACCEPTED, f"Accepted by {provider.business_name}", user)
    _notify_status(req)
    db.session.commit()
    broadcast_request_update(req)
    return req


def reject_request(user, request_id, reason):
    """Provider declines: auto-reassign to the next nearest provider, else REJECTED."""
    provider = _provider_of(user)
    req = get_request(user, request_id, lock=True)
    if req.status != RequestStatus.PENDING:
        raise Conflict(f"Only pending requests can be rejected (current: {req.status.lower()})")
    db.session.add(RequestRejection(request_id=req.id, provider_id=provider.id, reason=reason))
    db.session.flush()
    _add_history(req, RequestStatus.PENDING, f"Declined by {provider.business_name}: {reason}", user)
    reassigned = reassign(req, actor=user)
    db.session.commit()
    broadcast_request_update(req)
    return req, reassigned


def reassign(req, actor=None):
    """Offer a pending request to the next best provider. Returns True on success."""
    rejected = set(db.session.scalars(select(RequestRejection.provider_id)
                                      .where(RequestRejection.request_id == req.id)))
    old_provider = req.provider
    candidates = matching_service.find_candidates(
        req.service_type, req.lat, req.lng, fuel_type=req.fuel_type,
        exclude_ids=rejected | ({old_provider.id} if old_provider else set()), limit=1)
    if not candidates:
        req.status = RequestStatus.REJECTED
        _add_history(req, RequestStatus.REJECTED, "No other providers available nearby", actor)
        notify(req.user_id, "No provider available",
               f"Sorry, no provider could take request #{req.id}. Please try again shortly.",
               "request_rejected", req.id, commit=False)
        return False
    _assign(req, candidates[0])
    _add_history(req, RequestStatus.PENDING,
                 f"Reassigned to {candidates[0]['provider'].business_name}", actor)
    notify(req.user_id, "Finding another provider",
           f"Your request #{req.id} was reassigned to {req.provider.business_name} "
           f"({req.distance_km:.1f} km away).", "request_reassigned", req.id, commit=False)
    _notify_provider_new(req)
    return True


def _notify_status(req):
    title, template = STATUS_MESSAGES[req.status]
    amount = f"{(req.final_price or req.estimated_price or 0):.2f}"
    notify(req.user_id, title, template.format(provider=req.provider.business_name,
                                               eta=req.eta_minutes or "-", amount=amount),
           f"status_{req.status.lower()}", req.id, commit=False)


def update_status(user, request_id, new_status, final_price=None, note=None, actor_is_system=False):
    req = get_request(user, request_id, lock=True)
    expected = RequestStatus.PROVIDER_FLOW.get(req.status)
    if expected != new_status:
        raise Conflict(f"Cannot move a request from {req.status} to {new_status}",
                       details={"allowed_next": expected})
    apply_status(req, new_status, actor=None if actor_is_system else user,
                 final_price=final_price, note=note)
    db.session.commit()
    broadcast_request_update(req)
    return req


def apply_status(req, new_status, actor=None, final_price=None, note=None):
    req.status = new_status
    if new_status == RequestStatus.ARRIVED:
        req.arrived_at = utcnow()
        req.eta_minutes = 0
        if req.provider:
            req.provider.update_location(req.lat, req.lng)
    elif new_status == RequestStatus.COMPLETED:
        req.completed_at = utcnow()
        req.final_price = round(final_price if final_price is not None
                                else (req.estimated_price or 0), 2)
    _add_history(req, new_status, note, actor)
    _notify_status(req)
