"""Fuel demand prediction: model loading, prediction, insights and retraining."""
import os
import threading
import joblib
import pandas as pd
from sqlalchemy import select

from ml import train as trainer
from ml.dataset import FEATURES, FUEL_TYPES, ZONES, add_time_features, history_from_db, traffic_for_hour

from ..extensions import db
from ..models import ServiceRequest
from ..utils.errors import APIError
from ..utils.timeutil import now_ist

_lock = threading.Lock()
_cache = {"bundle": None, "mtime": None}


def _load_bundle(auto_train=True):
    with _lock:
        path = trainer.MODEL_PATH
        if not os.path.exists(path):
            if not auto_train:
                raise APIError("Model not trained yet", 503)
            trainer.train(history_from_db(), fast=True, verbose=False)
        mtime = os.path.getmtime(path)
        if _cache["bundle"] is None or _cache["mtime"] != mtime:
            _cache["bundle"] = joblib.load(path)
            _cache["mtime"] = mtime
        return _cache["bundle"]


def _frame(rows):
    df = add_time_features(pd.DataFrame(rows))
    return df[FEATURES]


def predict_demand(date, zone, fuel_type, weather=None, traffic=None):
    if zone not in ZONES:
        raise APIError(f"Unknown zone '{zone}'", 422, details={"zone": [f"Choose one of: {', '.join(ZONES)}"]})
    bundle = _load_bundle()
    rows = [{"ts": pd.Timestamp(date) + pd.Timedelta(hours=h), "zone": zone,
             "fuel_type": fuel_type, "weather": weather or "clear",
             "traffic": traffic or traffic_for_hour(h)} for h in range(24)]
    preds = bundle["pipeline"].predict(_frame(rows)).clip(min=0)
    avg_order = bundle["summary"]["avg_order_litres"]
    hourly = [{"hour": h, "demand_litres": round(float(p), 2),
               "expected_orders": round(float(p) / avg_order, 2)} for h, p in enumerate(preds)]
    peak = max(hourly, key=lambda r: r["demand_litres"])
    return {
        "date": str(date), "zone": zone, "fuel_type": fuel_type,
        "weather": weather or "clear", "traffic": traffic or "auto (by hour)",
        "total_litres": round(float(preds.sum()), 2),
        "expected_orders": round(float(preds.sum()) / avg_order, 1),
        "peak_hour": peak["hour"],
        "hourly": hourly,
        "model": bundle["summary"]["best_model"],
    }


def insights():
    bundle = _load_bundle()
    pipe = bundle["pipeline"]

    # --- historical patterns from the database
    reqs = db.session.execute(select(ServiceRequest.created_at, ServiceRequest.zone,
                                     ServiceRequest.service_type, ServiceRequest.fuel_type,
                                     ServiceRequest.quantity_litres)
                              .where(ServiceRequest.status == "COMPLETED")).all()
    hist = pd.DataFrame(reqs, columns=["created_at", "zone", "service_type", "fuel_type", "qty"])
    if len(hist):
        # stored timestamps are UTC; patterns are reported in IST
        hist["hour"] = (pd.to_datetime(hist["created_at"]) + pd.Timedelta(hours=5, minutes=30)).dt.hour
        hist["dow"] = (pd.to_datetime(hist["created_at"]) + pd.Timedelta(hours=5, minutes=30)).dt.dayofweek
    peak_hours = []
    for h in range(24):
        sub = hist[hist["hour"] == h] if len(hist) else hist
        peak_hours.append({"hour": h,
                           "fuel": int((sub["service_type"] == "fuel").sum()) if len(sub) else 0,
                           "mechanic": int((sub["service_type"] == "mechanic").sum()) if len(sub) else 0})
    heatmap = []
    if len(hist):
        grid = hist.groupby(["dow", "hour"]).size()
        heatmap = [{"day_of_week": int(d), "hour": int(h), "count": int(c)} for (d, h), c in grid.items()]

    top_zones = []
    if len(hist):
        fuel = hist[hist["service_type"] == "fuel"]
        g = hist.groupby("zone").agg(requests=("zone", "size"))
        litres = fuel.groupby("zone")["qty"].sum()
        g["litres"] = litres
        g = g.fillna(0).sort_values("requests", ascending=False).head(10)
        top_zones = [{"zone": z, "requests": int(r.requests), "litres": round(float(r.litres), 1)}
                     for z, r in g.iterrows()]

    # --- 7-day forecast from the model (all zones, by fuel type)
    today = pd.Timestamp(now_ist().date())
    rows = []
    for d in range(1, 8):
        day = today + pd.Timedelta(days=d)
        for zone in ZONES:
            for ft in FUEL_TYPES:
                for h in range(24):
                    rows.append({"ts": day + pd.Timedelta(hours=h), "zone": zone, "fuel_type": ft,
                                 "weather": "clear", "traffic": traffic_for_hour(h), "_day": day})
    df = pd.DataFrame(rows)
    df["pred"] = pipe.predict(_frame(df.drop(columns=["_day"]))).clip(min=0)
    forecast = []
    for day, sub in df.groupby("_day"):
        entry = {"date": day.date().isoformat(), "day": day.strftime("%a"),
                 "total_litres": round(float(sub["pred"].sum()), 1)}
        for ft in FUEL_TYPES:
            entry[ft] = round(float(sub.loc[sub["fuel_type"] == ft, "pred"].sum()), 1)
        forecast.append(entry)
    hourly_profile = df.groupby(df["ts"].dt.hour)["pred"].mean()
    predicted_peak = [int(h) for h in hourly_profile.sort_values(ascending=False).head(3).index]
    zone_forecast = (df.groupby("zone")["pred"].sum().sort_values(ascending=False)
                     .round(1).reset_index().rename(columns={"pred": "litres_next_7_days"})
                     .to_dict(orient="records"))

    return {
        "peak_hours": peak_hours,
        "predicted_peak_hours": predicted_peak,
        "heatmap": heatmap,
        "top_zones": top_zones,
        "zone_forecast": zone_forecast,
        "forecast_7_days": forecast,
        "metrics": bundle["summary"],
        "zones": ZONES,
        "fuel_types": FUEL_TYPES,
        "history_requests": int(len(hist)),
    }


def metrics():
    return _load_bundle()["summary"]


def retrain():
    history = history_from_db()
    with _lock:
        _, summary = trainer.train(history, verbose=False)
        _cache["bundle"] = None
    return summary

