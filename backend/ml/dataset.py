"""Fuel-demand dataset.

Each row is one (date, hour, zone, fuel_type) slot with the context features
``weather`` and ``traffic`` and the target ``demand_litres`` – total litres of
emergency fuel requested in that slot.

The seeded service history (~600 requests) is too sparse to train on directly, so we
learn its empirical patterns (zone share, hour profile, fuel mix, typical order
size) and blend them with domain priors to generate a realistic synthetic dataset.
"""
import numpy as np
import pandas as pd

ZONES = ["Vijayanagar", "Kuvempunagar", "Gokulam", "Jayalakshmipuram", "Nazarbad",
         "Saraswathipuram", "Hebbal", "Bannimantap", "Chamundipuram", "Devaraja Mohalla"]
FUEL_TYPES = ["petrol", "diesel", "cng"]
WEATHER = ["clear", "cloudy", "rain", "storm"]
TRAFFIC = ["low", "medium", "high"]

CATEGORICAL = ["zone", "fuel_type", "weather", "traffic"]
NUMERIC = ["hour", "day_of_week", "month", "is_weekend", "hour_sin", "hour_cos"]
FEATURES = NUMERIC + CATEGORICAL
TARGET = "demand_litres"

# Domain priors -------------------------------------------------------------
# Hourly profile: morning commute + evening commute peaks, quiet nights.
HOUR_PRIOR = np.array([0.15, 0.1, 0.08, 0.08, 0.1, 0.25, 0.5, 0.9, 1.4, 1.5, 1.1, 0.9,
                       0.85, 0.8, 0.8, 0.9, 1.1, 1.45, 1.6, 1.4, 1.0, 0.7, 0.45, 0.25])
DOW_PRIOR = np.array([1.05, 1.0, 1.0, 1.0, 1.1, 1.25, 1.15])  # Mon..Sun – weekend trips
FUEL_PRIOR = {"petrol": 0.62, "diesel": 0.30, "cng": 0.08}
WEATHER_EFFECT = {"clear": 1.0, "cloudy": 1.05, "rain": 1.25, "storm": 0.75}
TRAFFIC_EFFECT = {"low": 0.85, "medium": 1.0, "high": 1.2}
MONTH_EFFECT = {1: 0.95, 2: 0.95, 3: 1.0, 4: 1.05, 5: 1.1, 6: 1.0, 7: 0.95, 8: 0.95,
                9: 1.0, 10: 1.25, 11: 1.05, 12: 1.1}  # October = Mysuru Dasara festival
# Monsoon months get more rain.
WEATHER_PROBS = {m: [0.6, 0.25, 0.12, 0.03] for m in range(1, 13)}
for m in (6, 7, 8, 9):
    WEATHER_PROBS[m] = [0.25, 0.3, 0.35, 0.10]


def traffic_for_hour(hour):
    if hour in (8, 9, 10, 17, 18, 19, 20):
        return "high"
    if 7 <= hour <= 21:
        return "medium"
    return "low"


def add_time_features(df):
    """Derive model features from ``ts`` (datetime) column in-place and return df."""
    ts = pd.to_datetime(df["ts"])
    df["hour"] = ts.dt.hour
    df["day_of_week"] = ts.dt.dayofweek
    df["month"] = ts.dt.month
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    return df


def learn_patterns(history: pd.DataFrame | None):
    """Blend empirical distributions from service history with the priors."""
    hour = HOUR_PRIOR / HOUR_PRIOR.mean()
    zone_w = {z: 1.0 for z in ZONES}
    fuel_w = dict(FUEL_PRIOR)
    avg_qty = 8.0
    if history is not None and len(history) >= 30:
        h = history.copy()
        ts = pd.to_datetime(h["created_at"])
        counts = np.bincount(ts.dt.hour, minlength=24).astype(float) + 1.0
        emp = counts / counts.mean()
        hour = 0.5 * hour + 0.5 * emp
        zc = h["zone"].value_counts()
        if len(zc):
            mean = zc.mean()
            zone_w = {z: 0.5 + 0.5 * (zc.get(z, mean * 0.5) / mean) for z in ZONES}
        fc = h["fuel_type"].value_counts(normalize=True)
        if len(fc):
            fuel_w = {f: 0.5 * FUEL_PRIOR[f] + 0.5 * float(fc.get(f, 0.02)) for f in FUEL_TYPES}
        q = h["quantity_litres"].dropna()
        if len(q):
            avg_qty = float(q.mean())
    return {"hour": hour, "zone": zone_w, "fuel": fuel_w, "avg_order_litres": avg_qty}


def expected_demand(rows: pd.DataFrame, patterns, base_orders_per_hour=1.6):
    """Noise-free demand (litres) for rows with ts/zone/fuel_type/weather/traffic."""
    ts = pd.to_datetime(rows["ts"])
    hour_f = patterns["hour"][ts.dt.hour.to_numpy()]
    dow_f = DOW_PRIOR[ts.dt.dayofweek.to_numpy()]
    month_f = ts.dt.month.map(MONTH_EFFECT).to_numpy()
    zone_f = rows["zone"].map(patterns["zone"]).fillna(1.0).to_numpy()
    fuel_f = rows["fuel_type"].map(patterns["fuel"]).fillna(0.1).to_numpy() * 3
    weather_f = rows["weather"].map(WEATHER_EFFECT).fillna(1.0).to_numpy()
    traffic_f = rows["traffic"].map(TRAFFIC_EFFECT).fillna(1.0).to_numpy()
    orders = base_orders_per_hour * hour_f * dow_f * month_f * zone_f * fuel_f * weather_f * traffic_f
    return orders * patterns["avg_order_litres"]


def build_synthetic(history: pd.DataFrame | None = None, n_rows=15000, days=365, seed=42,
                    end_date=None):
    """Generate ``n_rows`` random hourly slots over the last ``days`` days."""
    rng = np.random.default_rng(seed)
    patterns = learn_patterns(history)
    end = pd.Timestamp(end_date or pd.Timestamp.today().normalize())
    day_offsets = rng.integers(0, days, n_rows)
    hours = rng.integers(0, 24, n_rows)
    ts = end - pd.to_timedelta(day_offsets, unit="D") + pd.to_timedelta(hours, unit="h")
    df = pd.DataFrame({
        "ts": ts,
        "zone": rng.choice(ZONES, n_rows),
        "fuel_type": rng.choice(FUEL_TYPES, n_rows),
    })
    months = pd.to_datetime(df["ts"]).dt.month.to_numpy()
    df["weather"] = [rng.choice(WEATHER, p=WEATHER_PROBS[m]) for m in months]
    # traffic mostly follows the hour, with some randomness
    base_traffic = [traffic_for_hour(h) for h in hours]
    flip = rng.random(n_rows) < 0.2
    df["traffic"] = np.where(flip, rng.choice(TRAFFIC, n_rows), base_traffic)

    mean = expected_demand(df, patterns)
    # Poisson order counts × gamma-distributed order sizes ≈ realistic litres
    orders = rng.poisson(mean / patterns["avg_order_litres"])
    litres = np.array([rng.gamma(4.0, patterns["avg_order_litres"] / 4.0, k).sum() if k else 0.0
                       for k in orders])
    df[TARGET] = np.round(litres, 2)
    df["orders"] = orders
    return add_time_features(df), patterns


def history_from_db():
    """Completed fuel requests from the database as a DataFrame (needs app context)."""
    from sqlalchemy import select

    from app.extensions import db
    from app.models import ServiceRequest

    rows = db.session.execute(select(
        ServiceRequest.created_at, ServiceRequest.zone, ServiceRequest.fuel_type,
        ServiceRequest.quantity_litres, ServiceRequest.weather, ServiceRequest.traffic_level)
        .where(ServiceRequest.service_type == "fuel", ServiceRequest.status == "COMPLETED")).all()
    return pd.DataFrame(rows, columns=["created_at", "zone", "fuel_type", "quantity_litres",
                                       "weather", "traffic"])
