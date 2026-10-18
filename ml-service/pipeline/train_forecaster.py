import os
import sys
import json
from datetime import datetime, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models.forecaster import generate_full_forecast, MODEL_VERSION
from models.decision_engine import evaluate_decision

def precompute_all_forecasts():
    artifacts_dir = os.path.join(os.path.dirname(__file__), '../artifacts')
    catalog_path = os.path.join(artifacts_dir, 'catalog_dataset.json')
    ts_path = os.path.join(artifacts_dir, 'timeseries_dataset.json')

    with open(catalog_path, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    with open(ts_path, 'r', encoding='utf-8') as f:
        ts_data = json.load(f)

    products = catalog.get('products', [])
    product_stores = catalog.get('product_stores', [])
    by_product = ts_data.get('by_product', {})
    by_product_store = ts_data.get('by_product_store', {})

    print(f"Precomputing production forecasts for {len(products)} products...", flush=True)

    cache = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model_version": MODEL_VERSION,
        "ttl_hours": 24,
        "by_product": {},
        "by_product_store": {}
    }

    # 1. Product Level Forecasts
    for p in products:
        p_id = p['id']
        history = by_product.get(p_id, [])
        curr_price = p.get('bestPrice')
        mrp = p.get('mrp')

        # Run forecaster
        fc = generate_full_forecast(p_id, history, current_price=curr_price, mrp=mrp, model_choice="prophet")

        # Compute historical stats
        prices = [h['price'] for h in history if h.get('price')]
        stats = {
            "lowestEver": min(prices) if prices else curr_price,
            "lowest90": min(prices[-90:]) if len(prices) >= 90 else (min(prices) if prices else curr_price),
            "highest90": max(prices[-90:]) if len(prices) >= 90 else (max(prices) if prices else mrp or curr_price),
            "average90": sum(prices[-90:]) / len(prices[-90:]) if len(prices) >= 90 else (sum(prices) / len(prices) if prices else curr_price),
        }

        # Run Decision Engine
        decision = evaluate_decision(
            current_price=curr_price or (prices[-1] if prices else 10000),
            predicted_7d=fc['predicted_7d'],
            predicted_30d=fc['predicted_30d'],
            stats=stats,
            confidence=fc['confidence'],
            observation_count=len(history)
        )

        fc["recommendation"] = decision["recommendation"]
        fc["confidence"] = decision["confidence"]
        fc["potential_saving"] = decision["potential_saving"]
        fc["explanation"] = decision["explanation"]
        fc["decision_horizon"] = decision["horizon"]

        cache["by_product"][p_id] = fc

    # 2. ProductStore (Retailer Specific) Forecasts
    for ps in product_stores:
        ps_id = ps['id']
        history = by_product_store.get(ps_id, [])
        if not history:
            continue

        curr_price = ps.get('currentPrice')
        mrp = ps.get('mrp')

        fc = generate_full_forecast(ps_id, history, current_price=curr_price, mrp=mrp, model_choice="xgboost")

        prices = [h['price'] for h in history if h.get('price')]
        stats = {
            "lowestEver": min(prices) if prices else curr_price,
            "lowest90": min(prices[-90:]) if len(prices) >= 90 else (min(prices) if prices else curr_price),
            "highest90": max(prices[-90:]) if len(prices) >= 90 else (max(prices) if prices else mrp or curr_price),
            "average90": sum(prices[-90:]) / len(prices[-90:]) if len(prices) >= 90 else (sum(prices) / len(prices) if prices else curr_price),
        }

        decision = evaluate_decision(
            current_price=curr_price or (prices[-1] if prices else 10000),
            predicted_7d=fc['predicted_7d'],
            predicted_30d=fc['predicted_30d'],
            stats=stats,
            confidence=fc['confidence'],
            observation_count=len(history)
        )

        fc["recommendation"] = decision["recommendation"]
        fc["confidence"] = decision["confidence"]
        fc["potential_saving"] = decision["potential_saving"]
        fc["explanation"] = decision["explanation"]
        fc["store_name"] = ps.get("storeName")
        fc["store_slug"] = ps.get("storeSlug")

        cache["by_product_store"][ps_id] = fc

    cache_path = os.path.join(artifacts_dir, 'forecast_cache.json')
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2)

    print(f"Precomputed {len(cache['by_product'])} product forecasts and {len(cache['by_product_store'])} store forecasts.", flush=True)
    print(f"Saved to: {cache_path}", flush=True)

if __name__ == '__main__':
    precompute_all_forecasts()
