import math

import pytest

from app.utils.geo import (ZONES, estimate_eta_minutes, haversine_km, interpolate, nearest_zone,
                           traffic_level_for_hour)

MYSURU_PALACE = (12.3052, 76.6552)
BENGALURU_VIDHANA_SOUDHA = (12.9791, 77.5913)


def test_haversine_zero_distance():
    assert haversine_km(*MYSURU_PALACE, *MYSURU_PALACE) == 0


def test_haversine_mysuru_to_bengaluru():
    d = haversine_km(*MYSURU_PALACE, *BENGALURU_VIDHANA_SOUDHA)
    assert 125 < d < 128  # straight-line ≈ 126 km


def test_haversine_symmetric():
    a = haversine_km(*MYSURU_PALACE, *BENGALURU_VIDHANA_SOUDHA)
    b = haversine_km(*BENGALURU_VIDHANA_SOUDHA, *MYSURU_PALACE)
    assert math.isclose(a, b)


def test_haversine_one_degree_latitude():
    assert math.isclose(haversine_km(0, 0, 1, 0), 111.19, rel_tol=1e-3)


@pytest.mark.parametrize("args", [(91, 0, 0, 0), (0, 181, 0, 0), (None, 0, 0, 0)])
def test_haversine_invalid(args):
    with pytest.raises(ValueError):
        haversine_km(*args)


def test_eta_increases_with_distance_and_traffic():
    assert estimate_eta_minutes(1) < estimate_eta_minutes(5)
    assert estimate_eta_minutes(5, "low") < estimate_eta_minutes(5, "high")


def test_eta_values():
    # 5 km * 1.3 road factor / 25 km/h = 15.6 min + 3 dispatch -> 19
    assert estimate_eta_minutes(5, "medium") == 19
    assert estimate_eta_minutes(0, include_dispatch=False) == 1  # minimum 1 minute
    with pytest.raises(ValueError):
        estimate_eta_minutes(-1)


def test_nearest_zone():
    for name, (lat, lng) in ZONES.items():
        assert nearest_zone(lat + 0.0005, lng - 0.0005) == name


def test_interpolate_bounds():
    assert interpolate((0, 0), (10, 20), 0.5) == (5, 10)
    assert interpolate((0, 0), (10, 20), 2) == (10, 20)
    assert interpolate((0, 0), (10, 20), -1) == (0, 0)


def test_traffic_levels():
    assert traffic_level_for_hour(9) == "high"
    assert traffic_level_for_hour(14) == "medium"
    assert traffic_level_for_hour(3) == "low"
