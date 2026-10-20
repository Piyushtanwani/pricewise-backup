import pytest
from datetime import datetime, timedelta
from models.forecaster import clean_series, naive_baseline_forecast, linear_trend_forecast, fit_predict_xgboost, generate_full_forecast

def test_clean_series_empty():
    df = clean_series([])
    assert len(df) == 0

def test_clean_series_dedup_and_sort():
    raw = [
        {"date": "2026-05-02", "price": 50000},
        {"date": "2026-05-01", "price": 52000},
        {"date": "2026-05-02", "price": 49000}, # should take min
    ]
    df = clean_series(raw)
    assert len(df) == 2
    assert df['y'].iloc[0] == 52000
    assert df['y'].iloc[1] == 49000

def test_naive_baseline():
    raw = [{"date": "2026-05-01", "price": 30000}, {"date": "2026-05-02", "price": 28000}]
    df = clean_series(raw)
    preds = naive_baseline_forecast(df, [7, 14, 30])
    assert preds[7] == 28000
    assert preds[14] == 28000
    assert preds[30] == 28000

def test_linear_trend_non_negative():
    raw = [{"date": f"2026-01-{i:02d}", "price": max(100, 1000 - i * 100)} for i in range(1, 15)]
    df = clean_series(raw)
    preds, intervals = linear_trend_forecast(df, [7, 14, 30])
    for h in [7, 14, 30]:
        assert preds[h] >= 0.0
        assert intervals[h][0] >= 0.0
        assert intervals[h][1] >= intervals[h][0]

def test_insufficient_history_handling():
    # Only 5 points
    raw = [{"date": f"2026-05-{i:02d}", "price": 25000} for i in range(1, 6)]
    fc = generate_full_forecast("test-id", raw, current_price=25000)
    assert fc["status"] == "insufficient_data"
    assert fc["confidence"] == "Insufficient Data"
    assert len(fc["points"]) == 4

def test_sufficient_history_forecast():
    # 35 points with subtle variation
    raw = [{"date": f"2026-05-01", "price": 40000}]
    base_date = datetime(2026, 5, 1)
    for i in range(1, 35):
        dt = base_date + timedelta(days=i)
        raw.append({"date": dt.strftime('%Y-%m-%d'), "price": 40000 - i * 50})

    fc = generate_full_forecast("test-id-2", raw, current_price=38300, model_choice="xgboost")
    assert fc["status"] == "success"
    assert fc["predicted_7d"] > 0
    assert fc["predicted_30d"] > 0
    assert fc["confidence"] in ["High", "Moderate", "Low"]
    assert fc["trend"] in ["DROPPING", "STABLE", "RISING"]
