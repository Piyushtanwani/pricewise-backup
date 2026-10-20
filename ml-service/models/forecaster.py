import os
import math
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta, timezone

MODEL_VERSION = "v2.1.0-hybrid-prophet-xgboost"

def clean_series(history_points: List[Dict[str, Any]]) -> pd.DataFrame:
    """Converts history points into a clean, sorted, deduplicated daily DataFrame."""
    if not history_points:
        return pd.DataFrame(columns=['ds', 'y'])

    records = []
    for p in history_points:
        raw_date = p.get('date') or p.get('timestamp')
        if not raw_date:
            continue
        # Truncate to YYYY-MM-DD
        ds_str = str(raw_date)[:10]
        price = float(p.get('price', 0))
        if price > 0:
            records.append({'ds': ds_str, 'y': price})

    if not records:
        return pd.DataFrame(columns=['ds', 'y'])

    df = pd.DataFrame(records)
    # Deduplicate by date: take the minimum price if multiple entries exist on the same day
    df = df.groupby('ds', as_index=False)['y'].min()
    df['ds'] = pd.to_datetime(df['ds'])
    df = df.sort_values('ds').reset_index(drop=True)
    return df

def naive_baseline_forecast(df: pd.DataFrame, horizons: List[int] = [7, 14, 30]) -> Dict[int, float]:
    """Last observed price repeated across all horizons."""
    last_price = float(df['y'].iloc[-1])
    return {h: last_price for h in horizons}

def seasonal_rolling_forecast(df: pd.DataFrame, horizons: List[int] = [7, 14, 30]) -> Dict[int, float]:
    """7-day rolling mean baseline."""
    window = min(len(df), 7)
    rolling_val = float(df['y'].iloc[-window:].mean())
    return {h: round(rolling_val, 2) for h in horizons}

def linear_trend_forecast(df: pd.DataFrame, horizons: List[int] = [7, 14, 30]) -> Tuple[Dict[int, float], Dict[int, Tuple[float, float]]]:
    """Linear regression forecast with standard error confidence bounds."""
    n = len(df)
    x = np.arange(n)
    y = df['y'].values

    # Fit slope & intercept
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    slope = np.sum((x - x_mean) * (y - y_mean)) / (np.sum((x - x_mean)**2) + 1e-9)
    intercept = y_mean - slope * x_mean

    # Residual standard deviation
    residuals = y - (slope * x + intercept)
    std_err = float(np.std(residuals)) if len(residuals) > 2 else float(np.std(y)) * 0.05
    std_err = max(std_err, y_mean * 0.02) # At least 2% uncertainty

    predictions = {}
    intervals = {}

    for h in horizons:
        future_x = n - 1 + h
        pred = max(0.0, float(slope * future_x + intercept))
        # Uncertainty grows with sqrt of horizon
        spread = 1.96 * std_err * math.sqrt(h / 7.0)
        predictions[h] = round(pred, 2)
        intervals[h] = (round(max(0.0, pred - spread), 2), round(pred + spread, 2))

    return predictions, intervals

def fit_predict_xgboost(df: pd.DataFrame, horizons: List[int] = [7, 14, 30]) -> Tuple[Dict[int, float], Dict[int, Tuple[float, float]]]:
    """XGBoost autoregressive forecaster with lag and calendar features."""
    import xgboost as xgb

    if len(df) < 14:
        return linear_trend_forecast(df, horizons)

    df_feat = df.copy()
    df_feat['day_of_week'] = df_feat['ds'].dt.dayofweek
    df_feat['day_of_month'] = df_feat['ds'].dt.day
    df_feat['month'] = df_feat['ds'].dt.month

    # Generate lags
    for lag in [1, 2, 3, 7]:
        df_feat[f'lag_{lag}'] = df_feat['y'].shift(lag)

    # Generate rolling means
    df_feat['rolling_mean_7'] = df_feat['y'].shift(1).rolling(7, min_periods=1).mean()
    df_feat['rolling_std_7'] = df_feat['y'].shift(1).rolling(7, min_periods=1).std().fillna(0)

    clean_df = df_feat.dropna().reset_index(drop=True)
    if len(clean_df) < 7:
        return linear_trend_forecast(df, horizons)

    feature_cols = ['day_of_week', 'day_of_month', 'month', 'lag_1', 'lag_2', 'lag_3', 'lag_7', 'rolling_mean_7', 'rolling_std_7']
    X = clean_df[feature_cols]
    y = clean_df['y']

    model = xgb.XGBRegressor(
        n_estimators=30,
        max_depth=3,
        learning_rate=0.08,
        verbosity=0,
        random_state=42
    )
    model.fit(X, y)

    # Recursive iterative forecasting
    cur_series = list(df['y'].values)
    last_date = df['ds'].iloc[-1]
    step_preds = {}

    residuals = y - model.predict(X)
    residual_std = float(np.std(residuals)) if len(residuals) > 0 else float(np.std(y)) * 0.05
    residual_std = max(residual_std, float(df['y'].iloc[-1]) * 0.02)

    for step in range(1, max(horizons) + 1):
        cur_date = last_date + timedelta(days=step)
        tail_7 = cur_series[-7:] if len(cur_series) >= 7 else cur_series
        feat = {
            'day_of_week': cur_date.weekday(),
            'day_of_month': cur_date.day,
            'month': cur_date.month,
            'lag_1': cur_series[-1],
            'lag_2': cur_series[-2] if len(cur_series) >= 2 else cur_series[-1],
            'lag_3': cur_series[-3] if len(cur_series) >= 3 else cur_series[-1],
            'lag_7': cur_series[-7] if len(cur_series) >= 7 else cur_series[0],
            'rolling_mean_7': float(np.mean(tail_7)),
            'rolling_std_7': float(np.std(tail_7)) if len(tail_7) > 1 else 0.0,
        }
        feat_df = pd.DataFrame([feat])[feature_cols]
        pred_val = float(model.predict(feat_df)[0])
        pred_val = max(0.0, pred_val)
        cur_series.append(pred_val)

        if step in horizons:
            step_preds[step] = round(pred_val, 2)

    intervals = {}
    for h in horizons:
        val = step_preds.get(h, float(df['y'].iloc[-1]))
        spread = 1.96 * residual_std * math.sqrt(h / 7.0)
        intervals[h] = (round(max(0.0, val - spread), 2), round(val + spread, 2))

    return step_preds, intervals

def fit_predict_prophet(df: pd.DataFrame, horizons: List[int] = [7, 14, 30]) -> Tuple[Dict[int, float], Dict[int, Tuple[float, float]]]:
    """Facebook Prophet forecaster with holiday calendar and changepoint priors."""
    from prophet import Prophet
    import logging
    logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
    logging.getLogger('prophet').setLevel(logging.WARNING)

    if len(df) < 14:
        return linear_trend_forecast(df, horizons)

    # Prophet requires 'ds' and 'y'
    pdf = df[['ds', 'y']].copy()
    m = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True if len(df) >= 14 else False,
        yearly_seasonality=True if len(df) >= 180 else False,
        changepoint_prior_scale=0.05,
        interval_width=0.90
    )
    # Add Indian major festival sales as country holidays or custom events
    m.add_country_holidays(country_name='IN')

    try:
        m.fit(pdf)
        max_h = max(horizons)
        future = m.make_future_dataframe(periods=max_h, freq='D')
        forecast = m.predict(future)

        tail_fc = forecast.tail(max_h).reset_index(drop=True)
        predictions = {}
        intervals = {}

        for h in horizons:
            idx = h - 1
            row = tail_fc.iloc[idx]
            yhat = max(0.0, float(row['yhat']))
            yhat_lower = max(0.0, float(row['yhat_lower']))
            yhat_upper = max(0.0, float(row['yhat_upper']))

            predictions[h] = round(yhat, 2)
            intervals[h] = (round(yhat_lower, 2), round(yhat_upper, 2))

        return predictions, intervals
    except Exception:
        # Fallback to XGBoost or linear trend if Stan fails
        return fit_predict_xgboost(df, horizons)

def generate_full_forecast(
    product_id: str,
    history_points: List[Dict[str, Any]],
    current_price: Optional[float] = None,
    mrp: Optional[float] = None,
    model_choice: str = "prophet"
) -> Dict[str, Any]:
    """
    Main entry point for forecasting a product.
    Returns multi-horizon forecasts, trend, uncertainty intervals, and metadata.
    """
    df = clean_series(history_points)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Edge Case: Completely empty history
    if len(df) == 0:
        base = current_price or 10000.0
        return {
            "product_id": product_id,
            "status": "insufficient_data",
            "model_version": MODEL_VERSION,
            "forecast_timestamp": now_iso,
            "observation_count": 0,
            "unique_dates": 0,
            "predicted_price": base,
            "predicted_7d": base,
            "predicted_14d": base,
            "predicted_30d": base,
            "trend": "STABLE",
            "confidence": "Insufficient Data",
            "potential_saving": 0.0,
            "points": [
                {"date": "Current", "price": base, "predicted": base, "upper": base, "lower": base},
                {"date": "7 Days", "price": None, "predicted": base, "upper": base, "lower": base},
                {"date": "14 Days", "price": None, "predicted": base, "upper": base, "lower": base},
                {"date": "30 Days", "price": None, "predicted": base, "upper": base, "lower": base},
            ]
        }

    last_obs_price = float(df['y'].iloc[-1])
    effective_current = current_price if (current_price and current_price > 0) else last_obs_price

    # Case: Insufficient history (< 14 points)
    if len(df) < 14:
        preds, intervals = linear_trend_forecast(df, [7, 14, 30])
        p7 = preds[7]
        p14 = preds[14]
        p30 = preds[30]
        trend = "STABLE"
        if p30 < effective_current * 0.96:
            trend = "DROPPING"
        elif p30 > effective_current * 1.04:
            trend = "RISING"

        return {
            "product_id": product_id,
            "status": "insufficient_data",
            "model_version": f"{MODEL_VERSION}-linear-fallback",
            "forecast_timestamp": now_iso,
            "observation_count": len(history_points),
            "unique_dates": len(df),
            "predicted_price": p30,
            "predicted_7d": p7,
            "predicted_14d": p14,
            "predicted_30d": p30,
            "trend": trend,
            "confidence": "Insufficient Data",
            "potential_saving": 0.0,
            "points": [
                {"date": "Current", "price": effective_current, "predicted": effective_current, "upper": effective_current, "lower": effective_current},
                {"date": "7 Days", "price": None, "predicted": p7, "upper": intervals[7][1], "lower": intervals[7][0]},
                {"date": "14 Days", "price": None, "predicted": p14, "upper": intervals[14][1], "lower": intervals[14][0]},
                {"date": "30 Days", "price": None, "predicted": p30, "upper": intervals[30][1], "lower": intervals[30][0]},
            ]
        }

    # Standard Case: Sufficient history (>= 14 daily observations)
    if model_choice.lower() == "xgboost":
        preds, intervals = fit_predict_xgboost(df, [7, 14, 30])
        selected_model = f"{MODEL_VERSION}-xgboost"
    else:
        try:
            preds, intervals = fit_predict_prophet(df, [7, 14, 30])
            selected_model = f"{MODEL_VERSION}-prophet"
        except Exception:
            preds, intervals = fit_predict_xgboost(df, [7, 14, 30])
            selected_model = f"{MODEL_VERSION}-xgboost"

    p7 = preds[7]
    p14 = preds[14]
    p30 = preds[30]

    # Compute trend
    pct_change_30d = (p30 - effective_current) / effective_current
    if pct_change_30d < -0.03:
        trend = "DROPPING"
    elif pct_change_30d > 0.03:
        trend = "RISING"
    else:
        trend = "STABLE"

    # Calibration confidence based on data quantity and interval spread
    interval_spread_ratio = (intervals[30][1] - intervals[30][0]) / max(effective_current, 1.0)
    if len(df) >= 60 and interval_spread_ratio < 0.25:
        confidence = "High"
    elif len(df) >= 30:
        confidence = "Moderate"
    else:
        confidence = "Low"

    potential_saving = max(0.0, round(effective_current - min(p7, p14, p30), 2))

    return {
        "product_id": product_id,
        "status": "success",
        "model_version": selected_model,
        "forecast_timestamp": now_iso,
        "observation_count": len(history_points),
        "unique_dates": len(df),
        "predicted_price": p30,
        "predicted_7d": p7,
        "predicted_14d": p14,
        "predicted_30d": p30,
        "trend": trend,
        "confidence": confidence,
        "potential_saving": potential_saving,
        "points": [
            {"date": "Current", "price": effective_current, "predicted": effective_current, "upper": effective_current, "lower": effective_current},
            {"date": "7 Days", "price": None, "predicted": p7, "upper": intervals[7][1], "lower": intervals[7][0]},
            {"date": "14 Days", "price": None, "predicted": p14, "upper": intervals[14][1], "lower": intervals[14][0]},
            {"date": "30 Days", "price": None, "predicted": p30, "upper": intervals[30][1], "lower": intervals[30][0]},
        ]
    }
