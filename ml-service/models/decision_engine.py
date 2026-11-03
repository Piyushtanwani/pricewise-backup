from typing import Dict, Any, Optional

def evaluate_decision(
    current_price: float,
    predicted_7d: float,
    predicted_30d: float,
    stats: Dict[str, Any],
    confidence: str = "Moderate",
    observation_count: int = 30,
    uncertainty_width: Optional[float] = None,
    forecast_age_days: Optional[float] = None,
    predicted_14d: Optional[float] = None
) -> Dict[str, Any]:
    """
    Deterministic decision engine for PriceWise.
    Precedence of Rules:
      1. INSUFFICIENT DATA / ZERO PRICE: If observation_count < 14 or current_price <= 0 -> MONITOR with Insufficient Data.
      2. STALE FORECAST: If forecast_age_days > 7 -> MONITOR (requires live sync).
      3. ALL-TIME LOW / NEAR LOW: If current_price <= lowest_ever * 1.02:
         - If predicted_30d < current_price * 0.96 and uncertainty is moderate -> WAIT for deeper discount.
         - Else -> BUY NOW (High confidence).
      4. HIGH UNCERTAINTY FILTER: If uncertainty_width / current_price > 0.25 on projected drops -> MONITOR.
      5. SIGNIFICANT PROJECTED DROP: If min(predicted_7d, predicted_14d, predicted_30d) <= current_price * 0.95 -> WAIT.
      6. PROJECTED PRICE INCREASE: If predicted_7d >= current_price * 1.04 AND current_price <= avg_90 -> BUY NOW.
      7. NEAR 90-DAY HIGH: If current_price >= highest_90 * 0.97 -> WAIT / MONITOR.
      8. DEFAULT / STABLE: Near average -> MONITOR.
    """
    current_price = max(0.0, float(current_price))
    predicted_7d = max(0.0, float(predicted_7d))
    predicted_30d = max(0.0, float(predicted_30d))
    p14 = float(predicted_14d) if predicted_14d is not None and predicted_14d > 0 else None

    # 1. Insufficient data or invalid price
    if observation_count < 14 or current_price <= 0:
        return {
            "recommendation": "MONITOR",
            "confidence": "Insufficient Data",
            "potential_saving": 0.0,
            "horizon": None,
            "explanation": "Insufficient historical observations (< 14 records) to reliably forecast future price changes. We recommend monitoring this item as more daily prices are recorded."
        }

    # 2. Stale Forecast Check
    if forecast_age_days is not None and forecast_age_days > 7:
        return {
            "recommendation": "MONITOR",
            "confidence": "Low",
            "potential_saving": 0.0,
            "horizon": None,
            "explanation": f"Forecast was computed {int(forecast_age_days)} days ago and is stale. Please refresh prices to generate a fresh forecast."
        }

    lowest_ever = float(stats.get('lowestEver') or stats.get('lowest90') or current_price)
    lowest_90 = float(stats.get('lowest90') or lowest_ever)
    avg_90 = float(stats.get('average90') or current_price)
    highest_90 = float(stats.get('highest90') or current_price)

    is_high_uncertainty = uncertainty_width is not None and current_price > 0 and (uncertainty_width / current_price) > 0.25

    # 3. Rule: All-time low / near all-time low (Physical price reality takes precedence)
    if current_price <= lowest_ever * 1.02:
        # Check if forecast predicts an even deeper discount and uncertainty is not wildly speculative
        if predicted_30d < current_price * 0.96 and not is_high_uncertainty:
            potential_saving = round(max(0.0, current_price - predicted_30d), 2)
            return {
                "recommendation": "WAIT",
                "confidence": confidence,
                "potential_saving": potential_saving,
                "horizon": "30 Days",
                "explanation": f"Current price (₹{int(current_price):,}) is near the all-time low (₹{int(lowest_ever):,}), but models forecast a further drop to ~₹{int(predicted_30d):,} over the next 30 days (potential saving: ₹{int(potential_saving):,})."
            }
        else:
            return {
                "recommendation": "BUY",
                "confidence": "High" if (confidence in ["High", "Moderate"] and not is_high_uncertainty) else "Moderate",
                "potential_saving": 0.0,
                "horizon": "Immediate",
                "explanation": f"Excellent time to buy. At ₹{int(current_price):,}, this item is within 2% of its lowest recorded price (₹{int(lowest_ever):,}) across tracked retailers."
            }

    # 4. High Uncertainty Guard: For non-all-time-low prices, avoid speculative recommendations on high variance
    if is_high_uncertainty:
        return {
            "recommendation": "MONITOR",
            "confidence": "Low",
            "potential_saving": 0.0,
            "horizon": None,
            "explanation": f"High model uncertainty (forecast confidence band spread ₹{int(uncertainty_width):,} exceeds 25% of price). Monitor rather than acting on volatile predictions."
        }

    # 5. Rule: Significant projected price drop across all horizons (7d, 14d, 30d)
    drop_candidates = [("7 Days", predicted_7d), ("30 Days", predicted_30d)]
    if p14 is not None:
        drop_candidates.insert(1, ("14 Days", p14))

    drop_horizon, target_pred = min(drop_candidates, key=lambda x: x[1])

    if target_pred <= current_price * 0.95:
        potential_saving = round(max(0.0, current_price - target_pred), 2)
        pct_drop = round(((current_price - target_pred) / current_price) * 100)
        if pct_drop > 45:
            # Boundary guard: unrealistic collapse in retail smartphone price
            return {
                "recommendation": "MONITOR",
                "confidence": "Low",
                "potential_saving": 0.0,
                "horizon": drop_horizon,
                "explanation": f"Model projects an extreme price reduction of {pct_drop}%, which exceeds realistic retail discount boundaries. Recommended to monitor item to confirm if listing details change."
            }
        return {
            "recommendation": "WAIT",
            "confidence": confidence,
            "potential_saving": potential_saving,
            "horizon": drop_horizon,
            "explanation": f"Wait for better value. Price is forecasted to drop by ~{pct_drop}% to ₹{int(target_pred):,} over the next {drop_horizon.lower()} (potential saving: ₹{int(potential_saving):,})."
        }

    # 6. Rule: Projected immediate price increase while currently below average
    if predicted_7d >= current_price * 1.04 and current_price <= avg_90:
        return {
            "recommendation": "BUY",
            "confidence": confidence,
            "potential_saving": 0.0,
            "horizon": "Immediate",
            "explanation": f"Good opportunity to buy now. At ₹{int(current_price):,}, the item is below its 90-day average (₹{int(avg_90):,}) and price models indicate an upcoming upward adjustment toward ₹{int(predicted_7d):,}."
        }

    # 7. Rule: Near 90-day high
    if current_price >= highest_90 * 0.97 and current_price > avg_90 * 1.05:
        return {
            "recommendation": "WAIT",
            "confidence": confidence,
            "potential_saving": round(max(0.0, current_price - avg_90), 2),
            "horizon": "30 Days",
            "explanation": f"Current price (₹{int(current_price):,}) is near the 90-day peak (₹{int(highest_90):,}). Historically, this item has traded closer to ₹{int(avg_90):,}."
        }

    # 8. Rule: Stable / Average price range
    return {
        "recommendation": "MONITOR",
        "confidence": confidence,
        "potential_saving": 0.0,
        "horizon": None,
        "explanation": f"Price is stable and close to its 90-day typical average of ₹{int(avg_90):,}. Set a target alert if you are aiming for a specific price drop."
    }
