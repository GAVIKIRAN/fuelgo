"""Train and compare fuel-demand models.

Usage (from backend/):
    python -m ml.train            # uses the database history (run seed.py first)
    python -m ml.train --no-db    # synthetic data from priors only
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

if __package__ in (None, ""):  # allow `python ml/train.py`
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml.dataset import CATEGORICAL, FEATURES, NUMERIC, TARGET, build_synthetic  # noqa: E402

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
MODEL_PATH = os.path.join(ARTIFACT_DIR, "demand_model.joblib")
METRICS_PATH = os.path.join(ARTIFACT_DIR, "metrics.json")


def _preprocessor():
    return ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
    ])


def candidate_models(fast=False):
    return {
        "LinearRegression": LinearRegression(),
        "RandomForest": RandomForestRegressor(n_estimators=60 if fast else 200, max_depth=14,
                                              min_samples_leaf=3, n_jobs=-1, random_state=42),
        "GradientBoosting": GradientBoostingRegressor(n_estimators=80 if fast else 300,
                                                      max_depth=4, learning_rate=0.08,
                                                      subsample=0.9, random_state=42),
    }


def evaluate(y_true, y_pred):
    return {
        "MAE": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "R2": round(float(r2_score(y_true, y_pred)), 4),
    }


def train(history: pd.DataFrame | None = None, n_rows=15000, fast=False, save=True, verbose=True):
    df, patterns = build_synthetic(history, n_rows=n_rows)
    X, y = df[FEATURES], df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    results, fitted = {}, {}
    for name, model in candidate_models(fast).items():
        start = time.perf_counter()
        pipe = Pipeline([("prep", _preprocessor()), ("model", model)])
        pipe.fit(X_train, y_train)
        metrics = evaluate(y_test, pipe.predict(X_test))
        metrics["train_seconds"] = round(time.perf_counter() - start, 2)
        results[name], fitted[name] = metrics, pipe
        if verbose:
            print(f"{name:<18} MAE={metrics['MAE']:<8} RMSE={metrics['RMSE']:<8} "
                  f"R2={metrics['R2']:<7} ({metrics['train_seconds']}s)")

    best = min(results, key=lambda n: (results[n]["RMSE"], results[n]["MAE"]))
    summary = {
        "best_model": best,
        "models": results,
        "selection_metric": "RMSE (lowest wins, MAE as tie-breaker)",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_rows": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "history_rows": int(len(history)) if history is not None else 0,
        "features": FEATURES,
        "target": TARGET,
        "avg_order_litres": round(patterns["avg_order_litres"], 2),
        "target_mean": round(float(y.mean()), 3),
    }
    if verbose:
        print(f"\nBest model: {best}  (RMSE {results[best]['RMSE']}, R2 {results[best]['R2']})")

    if save:
        os.makedirs(ARTIFACT_DIR, exist_ok=True)
        joblib.dump({"pipeline": fitted[best], "summary": summary, "patterns": {
            "hour": patterns["hour"].tolist(), "zone": patterns["zone"],
            "fuel": patterns["fuel"], "avg_order_litres": patterns["avg_order_litres"]}},
            MODEL_PATH)
        with open(METRICS_PATH, "w", encoding="utf-8") as fh:
            json.dump(summary, fh, indent=2)
        if verbose:
            print(f"Saved model to {MODEL_PATH}")
    return fitted[best], summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-db", action="store_true", help="ignore database history")
    parser.add_argument("--rows", type=int, default=15000, help="synthetic rows to generate")
    args = parser.parse_args()

    history = None
    if not args.no_db:
        from dotenv import load_dotenv
        load_dotenv()
        from app import create_app
        from ml.dataset import history_from_db
        app = create_app(os.getenv("FLASK_ENV_NAME", "development"))
        with app.app_context():
            history = history_from_db()
        print(f"Loaded {len(history)} completed fuel requests from the database")
    train(history, n_rows=args.rows)


if __name__ == "__main__":
    main()
