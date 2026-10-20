import pytest
from models.decision_engine import evaluate_decision

def test_insufficient_data_rule():
    dec = evaluate_decision(
        current_price=20000,
        predicted_7d=19000,
        predicted_30d=18000,
        stats={},
        observation_count=5
    )
    assert dec["recommendation"] == "MONITOR"
    assert dec["confidence"] == "Insufficient Data"
    assert dec["potential_saving"] == 0.0

def test_all_time_low_buy_rule():
    # current_price within 2% of lowestEver
    dec = evaluate_decision(
        current_price=49000,
        predicted_7d=49200,
        predicted_30d=49000,
        stats={"lowestEver": 48500, "average90": 55000, "highest90": 58000},
        observation_count=90
    )
    assert dec["recommendation"] == "BUY"
    assert dec["confidence"] in ["High", "Moderate"]
    assert "lowest recorded price" in dec["explanation"].lower()

def test_projected_price_drop_wait_rule():
    # predicted_30d drops by 10%
    dec = evaluate_decision(
        current_price=50000,
        predicted_7d=49000,
        predicted_30d=45000,
        stats={"lowestEver": 48000, "average90": 52000, "highest90": 56000},
        observation_count=60
    )
    assert dec["recommendation"] == "WAIT"
    assert dec["potential_saving"] == 5000.0
    assert "forecasted to drop" in dec["explanation"].lower()

def test_price_rising_while_below_average_buy_rule():
    dec = evaluate_decision(
        current_price=30000,
        predicted_7d=32000, # +6.6% increase expected
        predicted_30d=33000,
        stats={"lowestEver": 27000, "average90": 34000, "highest90": 36000},
        observation_count=60
    )
    assert dec["recommendation"] == "BUY"
    assert "upward adjustment" in dec["explanation"].lower()

def test_near_peak_high_wait_rule():
    dec = evaluate_decision(
        current_price=79000,
        predicted_7d=79000,
        predicted_30d=78500,
        stats={"lowestEver": 65000, "average90": 70000, "highest90": 80000},
        observation_count=60
    )
    assert dec["recommendation"] == "WAIT"
    assert "near the 90-day peak" in dec["explanation"].lower()

def test_conflicting_signal_low_price_vs_projected_drop():
    # At all-time low (49,000 vs 48,500), but models project a further drop to 45,000 (> 4% drop)
    dec = evaluate_decision(
        current_price=49000,
        predicted_7d=48000,
        predicted_30d=45000,
        stats={"lowestEver": 48500, "average90": 55000, "highest90": 60000},
        observation_count=60
    )
    # Conflict resolution: WAIT for deeper discount rather than buying prematurely
    assert dec["recommendation"] == "WAIT"
    assert dec["potential_saving"] == 4000.0

def test_stale_forecast_guard():
    dec = evaluate_decision(
        current_price=50000,
        predicted_7d=45000,
        predicted_30d=40000,
        stats={"lowestEver": 48000, "average90": 52000, "highest90": 56000},
        observation_count=60,
        forecast_age_days=10.0 # 10 days old > 7 days threshold
    )
    assert dec["recommendation"] == "MONITOR"
    assert "stale" in dec["explanation"].lower()

def test_high_uncertainty_guard():
    # Predicted drop, but uncertainty spread is ₹18,000 on a ₹50,000 item (36% > 25% threshold)
    dec = evaluate_decision(
        current_price=50000,
        predicted_7d=46000,
        predicted_30d=45000,
        stats={"lowestEver": 48000, "average90": 52000, "highest90": 56000},
        observation_count=60,
        uncertainty_width=18000.0
    )
    assert dec["recommendation"] == "MONITOR"
    assert "uncertainty" in dec["explanation"].lower()

def test_unrealistic_savings_guard():
    # Predicted collapse from 60,000 to 15,000 (75% drop)
    dec = evaluate_decision(
        current_price=60000,
        predicted_7d=30000,
        predicted_30d=15000,
        stats={"lowestEver": 55000, "average90": 62000, "highest90": 68000},
        observation_count=60
    )
    assert dec["recommendation"] == "MONITOR"
    assert "exceeds realistic retail discount boundaries" in dec["explanation"].lower()

def test_zero_or_negative_price_boundary():
    dec = evaluate_decision(
        current_price=0.0,
        predicted_7d=0.0,
        predicted_30d=0.0,
        stats={},
        observation_count=60
    )
    assert dec["recommendation"] == "MONITOR"
    assert dec["confidence"] == "Insufficient Data"
