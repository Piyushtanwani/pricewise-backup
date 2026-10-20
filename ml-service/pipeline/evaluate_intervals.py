import os
import sys
import json
import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models.forecaster import clean_series, linear_trend_forecast, fit_predict_xgboost, fit_predict_prophet, naive_baseline_forecast

def evaluate():
    artifacts_dir = os.path.join(os.path.dirname(__file__), '../artifacts')
    ts_path = os.path.join(artifacts_dir, 'timeseries_dataset.json')
    manifest_path = os.path.join(os.path.dirname(__file__), '../provenance_manifest.json')

    with open(ts_path, 'r', encoding='utf-8') as f:
        ts_data = json.load(f)
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    genuine_ids = [p['product_id'] for p in manifest['products'] if p['provenance'] == 'genuine_scraped']

    models = ['linear_trend', 'xgboost', 'prophet']
    horizons = [7, 14, 30]

    # Metrics container
    interval_stats = {
        m: {
            h: {'covered': [], 'width': [], 'y_true': [], 'lower': [], 'upper': [], 'pred': []}
            for h in horizons
        }
        for m in models
    }

    evaluated_count = 0

    for pid in genuine_ids:
        raw = ts_data['by_product'].get(pid, [])
        df = clean_series(raw)
        if len(df) < 45:
            continue
        evaluated_count += 1

        train_df = df.iloc[:-30].copy()
        test_df = df.iloc[-30:].copy()

        acts = {
            7: float(test_df['y'].iloc[6]),
            14: float(test_df['y'].iloc[13]),
            30: float(test_df['y'].iloc[29])
        }

        lin_p, lin_int = linear_trend_forecast(train_df, horizons)
        xgb_p, xgb_int = fit_predict_xgboost(train_df, horizons)
        pro_p, pro_int = fit_predict_prophet(train_df, horizons)

        pack = {
            'linear_trend': (lin_p, lin_int),
            'xgboost': (xgb_p, xgb_int),
            'prophet': (pro_p, pro_int)
        }

        for m in models:
            preds, intervals = pack[m]
            for h in horizons:
                yt = acts[h]
                low, high = intervals[h]
                is_cov = 1 if (low <= yt <= high) else 0
                w = high - low
                interval_stats[m][h]['covered'].append(is_cov)
                interval_stats[m][h]['width'].append(w)
                interval_stats[m][h]['y_true'].append(yt)
                interval_stats[m][h]['lower'].append(low)
                interval_stats[m][h]['upper'].append(high)
                interval_stats[m][h]['pred'].append(preds[h])

    summary = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "sample_size": evaluated_count,
        "results": {}
    }

    print(f"Evaluated interval coverage across {evaluated_count} genuine series:")
    for m in models:
        summary["results"][m] = {}
        print(f"\n--- Model: {m} ---")
        for h in horizons:
            cov = float(np.mean(interval_stats[m][h]['covered']) * 100)
            avg_w = float(np.mean(interval_stats[m][h]['width']))
            summary["results"][m][f"{h}d"] = {
                "coverage_pct": round(cov, 2),
                "mean_width_inr": round(avg_w, 2),
                "calibrated_80_supported": bool(cov >= 75.0)
            }
            print(f"Horizon {h}d: Empirical Coverage = {cov:.1f}%, Mean Width = Rs {avg_w:.2f}")

    out_file = os.path.join(artifacts_dir, 'interval_coverage_report.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print(f"\nSaved coverage results to {out_file}")

if __name__ == '__main__':
    evaluate()
