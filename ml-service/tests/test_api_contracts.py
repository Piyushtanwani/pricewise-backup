import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "cached_products" in data

def test_predict_cached():
    # Fetch first product from cache
    from main import forecast_cache
    cached_ids = list(forecast_cache.get("by_product", {}).keys())
    if not cached_ids:
        pytest.skip("No cached products available")

    success_ids = [pid for pid, item in forecast_cache.get("by_product", {}).items() if item.get("status") == "success"]
    test_id = success_ids[0] if success_ids else cached_ids[0]
    res = client.post("/predict", json={"product_id": test_id})
    assert res.status_code == 200
    data = res.json()
    assert data["product_id"] == test_id
    assert data["status"] in ["success", "insufficient_data"]
    assert data["predicted_7d"] > 0
    assert data["predicted_30d"] > 0
    assert data["recommendation"] in ["BUY", "WAIT", "MONITOR"]
    assert len(data["points"]) >= 4

def test_predict_dynamic_insufficient_data():
    res = client.post("/predict", json={
        "product_id": "temp-product-123",
        "historical_prices": [30000, 29500, 29000], # only 3 points
        "force_inference": True
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "insufficient_data"
    assert data["confidence"] == "Insufficient Data"

def test_recommend_alternatives_endpoint():
    from main import recommender
    if not recommender or not recommender.products:
        pytest.skip("Recommender not initialized")

    test_id = recommender.products[0]["id"]
    res = client.post("/recommend/alternatives", json={"product_id": test_id, "limit": 3})
    assert res.status_code == 200
    data = res.json()
    assert data["product_id"] == test_id
    assert len(data["alternatives"]) <= 3

def test_assistant_chat_endpoint():
    res = client.post("/assistant/chat", json={"message": "Best phone under 35000"})
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "assistant"
    assert "content" in data
    assert len(data["products"]) > 0
    assert "source" in data

def test_cache_invalidation_on_price_shift():
    from main import forecast_cache
    cached_ids = list(forecast_cache.get("by_product", {}).keys())
    if not cached_ids:
        pytest.skip("No cached products available")

    test_id = cached_ids[0]
    cached_item = forecast_cache["by_product"][test_id]
    original_price = cached_item["predicted_price"]

    # When a live price differs by > 2% (e.g. +20% jump), cache must invalidate and run dynamic inference
    shifted_price = original_price * 1.20
    res = client.post("/predict", json={"product_id": test_id, "current_price": shifted_price})
    assert res.status_code == 200
    data = res.json()
    # Source should NOT be ml-cache because of the price mismatch invalidation
    assert data["source"] == "ml-inference"

def test_cache_invalidation_endpoint():
    from main import forecast_cache
    # Seed a dummy cached key
    forecast_cache.setdefault("by_product", {})["dummy-test-key"] = {"dummy": True}
    res = client.post("/forecast/invalidate", json={"product_id": "dummy-test-key"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["invalidated_count"] >= 1
    assert "dummy-test-key" not in forecast_cache["by_product"]

