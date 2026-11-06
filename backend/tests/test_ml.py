import pandas as pd

from ml.dataset import FEATURES, TARGET, build_synthetic
from ml.train import train


def test_synthetic_dataset_shape_and_patterns():
    df, patterns = build_synthetic(None, n_rows=3000, seed=1)
    assert len(df) == 3000
    assert set(FEATURES + [TARGET]) <= set(df.columns)
    assert (df[TARGET] >= 0).all()
    by_hour = df.groupby("hour")[TARGET].mean()
    assert by_hour.loc[18] > by_hour.loc[3]  # evening peak beats the small hours


def test_training_selects_best_model(tmp_path):
    _, summary = train(None, n_rows=2500, fast=True, save=False, verbose=False)
    assert summary["best_model"] in summary["models"]
    best = summary["models"][summary["best_model"]]
    assert all(best["RMSE"] <= m["RMSE"] for m in summary["models"].values())
    assert {"MAE", "RMSE", "R2"} <= set(best)


def test_history_influences_patterns():
    history = pd.DataFrame({
        "created_at": pd.date_range("2026-01-01", periods=200, freq="h"),
        "zone": ["Hebbal"] * 200, "fuel_type": ["diesel"] * 200, "quantity_litres": [20.0] * 200,
        "weather": ["clear"] * 200, "traffic": ["low"] * 200})
    _, patterns = build_synthetic(history, n_rows=500)
    assert patterns["avg_order_litres"] == 20.0
    assert patterns["zone"]["Hebbal"] > patterns["zone"]["Gokulam"]


def test_predict_and_insights_endpoints(client, auth):
    h = auth("admin@test.in")
    res = client.get("/api/v1/admin/ml/predict-demand?date=2026-12-01&zone=Gokulam&fuel_type=petrol&weather=rain",
                     headers=h)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert len(body["hourly"]) == 24 and body["total_litres"] > 0
    # alias path from the project brief
    alias = client.get("/api/admin/ml/predict-demand?date=2026-12-01&zone=Gokulam&fuel_type=petrol", headers=h)
    assert alias.status_code == 200

    bad = client.get("/api/v1/admin/ml/predict-demand?date=2026-12-01&zone=Nowhere&fuel_type=petrol", headers=h)
    assert bad.status_code == 422

    ins = client.get("/api/v1/admin/ml/insights", headers=h).get_json()
    assert len(ins["forecast_7_days"]) == 7
    assert len(ins["peak_hours"]) == 24
    assert ins["metrics"]["best_model"]

    assert client.get("/api/v1/admin/ml/insights", headers=auth("cust@test.in")).status_code == 403
