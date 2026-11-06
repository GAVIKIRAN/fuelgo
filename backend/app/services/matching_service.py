"""Nearby provider matching: filter by type/availability/verification, rank by
distance, rating and ETA."""
from sqlalchemy import select

from ..extensions import db
from ..models import Provider, RequestStatus, ServiceRequest, ServiceType, User
from ..utils.geo import estimate_eta_minutes, haversine_km, traffic_level_for_hour
from ..utils.timeutil import now_ist

# Ranking weights (lower score = better match)
W_DISTANCE, W_RATING, W_ETA = 0.55, 0.30, 0.15
MAX_SEARCH_KM = 25.0
NEW_PROVIDER_RATING = 4.0  # neutral prior for providers without ratings yet


def busy_provider_ids():
    """Providers that already hold an active request (pending offer or ongoing job)."""
    return set(db.session.scalars(
        select(ServiceRequest.provider_id).where(
            ServiceRequest.provider_id.is_not(None),
            ServiceRequest.status.in_(RequestStatus.ACTIVE))))


def find_candidates(service_type, lat, lng, fuel_type=None, exclude_ids=(), limit=10,
                    ignore_busy_for=None):
    """Return ranked candidate dicts: {"provider", "distance_km", "eta_minutes", "score"}.

    ``ignore_busy_for`` lets a request keep its own provider when re-ranking.
    """
    q = (select(Provider).join(User, Provider.user_id == User.id)
         .where(Provider.provider_type == service_type,
                Provider.is_verified.is_(True),
                Provider.is_available.is_(True),
                Provider.lat.is_not(None), Provider.lng.is_not(None),
                User.is_active.is_(True)))
    busy = busy_provider_ids()
    if ignore_busy_for is not None:
        busy.discard(ignore_busy_for)
    excluded = set(exclude_ids) | busy

    traffic = traffic_level_for_hour(now_ist().hour)
    results = []
    for p in db.session.scalars(q):
        if p.id in excluded:
            continue
        if service_type == ServiceType.FUEL and fuel_type and fuel_type not in p.fuel_type_list:
            continue
        dist = haversine_km(lat, lng, p.lat, p.lng)
        if dist > min(p.service_radius_km, MAX_SEARCH_KM):
            continue
        eta = estimate_eta_minutes(dist, traffic)
        rating = p.rating_avg if p.rating_count else NEW_PROVIDER_RATING
        score = (W_DISTANCE * (dist / MAX_SEARCH_KM)
                 + W_RATING * (1 - rating / 5.0)
                 + W_ETA * min(eta, 90) / 90)
        results.append({"provider": p, "distance_km": round(dist, 2), "eta_minutes": eta,
                        "score": round(score, 4)})
    results.sort(key=lambda r: (r["score"], r["distance_km"]))
    return results[:limit]


def serialize_candidates(candidates, estimate_fn=None):
    out = []
    for c in candidates:
        item = c["provider"].to_dict()
        item.update(distance_km=c["distance_km"], eta_minutes=c["eta_minutes"], score=c["score"])
        if estimate_fn:
            item["estimate"] = estimate_fn(c["distance_km"])
        out.append(item)
    return out
