"""Live provider tracking and the demo drive simulator."""
import logging
import threading

from flask import current_app
from sqlalchemy import select

from ..extensions import db, socketio
from ..models import Provider, RequestStatus, ServiceRequest, User
from ..utils.errors import APIError, Conflict, Forbidden
from ..utils.geo import estimate_eta_minutes, haversine_km, interpolate, traffic_level_for_hour
from ..utils.timeutil import now_ist
from . import request_service
from .realtime import emit_to_request

log = logging.getLogger(__name__)
TRACKABLE = (RequestStatus.ACCEPTED, RequestStatus.EN_ROUTE)
_running_simulations = set()
_sim_lock = threading.Lock()


def tracking_payload(req):
    p = req.provider
    return {
        "request_id": req.id,
        "status": req.status,
        "provider": {"id": p.id, "lat": p.lat, "lng": p.lng, "name": p.business_name,
                     "phone": p.user.phone if p.user else None,
                     "last_location_at": p.to_dict()["last_location_at"]} if p else None,
        "destination": {"lat": req.lat, "lng": req.lng, "address": req.address},
        "eta_minutes": req.eta_minutes,
        "distance_km": req.distance_km,
        "simulating": req.id in _running_simulations,
    }


def get_tracking(user, request_id):
    return tracking_payload(request_service.get_request(user, request_id))


def update_provider_location(provider, lat, lng):
    """Store the provider's position; refresh ETA on their active job and push it live."""
    provider.update_location(lat, lng)
    job = db.session.scalar(select(ServiceRequest).where(
        ServiceRequest.provider_id == provider.id, ServiceRequest.status.in_(TRACKABLE)))
    if job is not None:
        dist = haversine_km(lat, lng, job.lat, job.lng)
        job.distance_km = round(dist, 2)
        job.eta_minutes = 0 if dist < 0.05 else estimate_eta_minutes(
            dist, traffic_level_for_hour(now_ist().hour), include_dispatch=False)
    db.session.commit()
    if job is not None:
        emit_to_request(job.id, "tracking:update", tracking_payload(job))
    return job


def update_location_for_user(user, lat, lng):
    if user.provider is None:
        raise Forbidden("Only providers can share live location")
    job = update_provider_location(user.provider, lat, lng)
    return {"lat": lat, "lng": lng, "active_request_id": job.id if job else None,
            "eta_minutes": job.eta_minutes if job else None}


# ------------------------------------------------------------------ simulator
def start_simulation(user, request_id):
    """Drive the assigned provider from their position to the customer in steps,
    emitting live updates, then mark the request ARRIVED. Demo aid only."""
    if not current_app.config.get("SIMULATOR_ENABLED"):
        raise APIError("The tracking simulator is disabled", 403)
    req = request_service.get_request(user, request_id)
    if req.status not in TRACKABLE:
        raise Conflict("Simulation is only possible once a provider has accepted and before arrival")
    if req.provider is None or req.provider.lat is None:
        raise Conflict("Provider location unknown")
    with _sim_lock:
        if req.id in _running_simulations:
            raise Conflict("A simulation is already running for this request")
        _running_simulations.add(req.id)

    if req.status == RequestStatus.ACCEPTED:
        request_service.apply_status(req, RequestStatus.EN_ROUTE, actor=user,
                                     note="Simulator: provider started driving")
        db.session.commit()
        request_service.broadcast_request_update(req)

    app = current_app._get_current_object()
    args = (app, req.id, user.id, (req.provider.lat, req.provider.lng), (req.lat, req.lng))
    if app.testing:
        _run_simulation(*args)
    else:
        socketio.start_background_task(_run_simulation, *args)
    return {"request_id": req.id, "started": True,
            "steps": app.config["SIMULATOR_STEPS"],
            "step_seconds": app.config["SIMULATOR_STEP_SECONDS"]}


def _run_simulation(app, request_id, actor_id, start, end):
    steps = app.config["SIMULATOR_STEPS"]
    delay = app.config["SIMULATOR_STEP_SECONDS"]
    try:
        with app.app_context():
            for i in range(1, steps + 1):
                req = db.session.get(ServiceRequest, request_id)
                if req is None or req.status not in TRACKABLE:
                    return  # cancelled or advanced manually
                provider = db.session.get(Provider, req.provider_id)
                lat, lng = interpolate(start, end, i / steps)
                update_provider_location(provider, lat, lng)
                if delay:
                    socketio.sleep(delay)
            req = db.session.get(ServiceRequest, request_id)
            if req is not None and req.status == RequestStatus.EN_ROUTE:
                actor = db.session.get(User, actor_id)
                request_service.apply_status(req, RequestStatus.ARRIVED, actor=actor,
                                             note="Simulator: provider arrived")
                db.session.commit()
                request_service.broadcast_request_update(req)
            db.session.remove()
    except Exception:
        log.exception("Simulation for request %s failed", request_id)
    finally:
        with _sim_lock:
            _running_simulations.discard(request_id)
