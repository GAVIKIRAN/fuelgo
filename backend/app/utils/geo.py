"""Geospatial helpers: Haversine distance, ETA estimation and zone lookup."""
import math

EARTH_RADIUS_KM = 6371.0088

# Average urban speed in km/h by traffic level (Mysuru city conditions).
TRAFFIC_SPEED_KMPH = {"low": 35.0, "medium": 25.0, "high": 15.0}
# Road distance is typically longer than straight-line distance.
ROAD_FACTOR = 1.3
DISPATCH_MINUTES = 3  # time for the provider to get moving

# Mysuru service zones (approximate centroids).
ZONES = {
    "Vijayanagar": (12.3270, 76.6170),
    "Kuvempunagar": (12.2840, 76.6280),
    "Gokulam": (12.3300, 76.6380),
    "Jayalakshmipuram": (12.3290, 76.6280),
    "Nazarbad": (12.3010, 76.6640),
    "Saraswathipuram": (12.2990, 76.6280),
    "Hebbal": (12.3500, 76.6150),
    "Bannimantap": (12.3330, 76.6600),
    "Chamundipuram": (12.2930, 76.6500),
    "Devaraja Mohalla": (12.3100, 76.6520),
}


def haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance between two points in kilometres."""
    for v in (lat1, lng1, lat2, lng2):
        if v is None:
            raise ValueError("Coordinates must not be None")
    if not (-90 <= lat1 <= 90 and -90 <= lat2 <= 90):
        raise ValueError("Latitude must be between -90 and 90")
    if not (-180 <= lng1 <= 180 and -180 <= lng2 <= 180):
        raise ValueError("Longitude must be between -180 and 180")
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def estimate_eta_minutes(distance_km, traffic="medium", include_dispatch=True):
    """Estimate travel time in whole minutes for a straight-line distance."""
    if distance_km < 0:
        raise ValueError("Distance must be non-negative")
    speed = TRAFFIC_SPEED_KMPH.get(traffic, TRAFFIC_SPEED_KMPH["medium"])
    minutes = (distance_km * ROAD_FACTOR) / speed * 60
    if include_dispatch:
        minutes += DISPATCH_MINUTES
    return max(1, int(math.ceil(minutes)))


def nearest_zone(lat, lng):
    """Return the name of the closest Mysuru zone to a coordinate."""
    return min(ZONES, key=lambda z: haversine_km(lat, lng, *ZONES[z]))


def interpolate(start, end, fraction):
    """Linear interpolation between two (lat, lng) points; fraction in [0, 1]."""
    fraction = max(0.0, min(1.0, fraction))
    return (start[0] + (end[0] - start[0]) * fraction,
            start[1] + (end[1] - start[1]) * fraction)


def traffic_level_for_hour(hour):
    """Heuristic traffic level by hour of day (used when no live data is available)."""
    if hour in (8, 9, 10, 17, 18, 19, 20):
        return "high"
    if 7 <= hour <= 21:
        return "medium"
    return "low"
