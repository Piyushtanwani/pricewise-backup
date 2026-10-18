import os
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Union
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from models.forecaster import generate_full_forecast, MODEL_VERSION
from models.decision_engine import evaluate_decision
from models.recommender import ContentBasedRecommender
from models.assistant_tool import ShoppingAssistantEngine

# Paths to artifacts
BASE_DIR = os.path.dirname(__file__)
ARTIFACTS_DIR = os.path.join(BASE_DIR, 'artifacts')
CATALOG_PATH = os.path.join(ARTIFACTS_DIR, 'catalog_dataset.json')
FORECAST_CACHE_PATH = os.path.join(ARTIFACTS_DIR, 'forecast_cache.json')
EVAL_REPORT_PATH = os.path.join(ARTIFACTS_DIR, 'evaluation_report.json')

# In-memory singletons
forecast_cache: Dict[str, Any] = {}
recommender: Optional[ContentBasedRecommender] = None
assistant: Optional[ShoppingAssistantEngine] = None

def init_app_state():
    global forecast_cache, recommender, assistant

    # 1. Load forecast cache if present
    if os.path.exists(FORECAST_CACHE_PATH):
        try:
            with open(FORECAST_CACHE_PATH, 'r', encoding='utf-8') as f:
                forecast_cache = json.load(f)
            print(f"[ML Service] Loaded forecast cache ({len(forecast_cache.get('by_product', {}))} products).")
        except Exception as e:
            print(f"[ML Service] Warning: Failed to load forecast cache: {e}")

    # 2. Initialize recommender
    if os.path.exists(CATALOG_PATH):
        try:
            recommender = ContentBasedRecommender(CATALOG_PATH)
            print("[ML Service] Initialized ContentBasedRecommender.")
        except Exception as e:
            print(f"[ML Service] Warning: Failed to load recommender: {e}")

    # 3. Initialize assistant engine
    if os.path.exists(CATALOG_PATH):
        try:
            assistant = ShoppingAssistantEngine(CATALOG_PATH, recommender)
            print("[ML Service] Initialized ShoppingAssistantEngine.")
        except Exception as e:
            print(f"[ML Service] Warning: Failed to load assistant engine: {e}")

# Call init directly for tests or workers
init_app_state()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_app_state()
    yield

app = FastAPI(
    title="PriceWise Production ML Service",
    description="Enterprise-grade price forecasting, decision intelligence, recommendation and grounded shopping assistant engine.",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Pydantic Request & Response Models ----------------
class PredictionRequest(BaseModel):
    product_id: str
    historical_prices: Optional[List[Union[float, Dict[str, Any]]]] = Field(default_factory=list)
    current_price: Optional[float] = None
    mrp: Optional[float] = None
    store_id: Optional[str] = None
    force_inference: bool = False

class ForecastPoint(BaseModel):
    date: str
    price: Optional[float] = None
    predicted: float
    upper: float
    lower: float

class PredictionResponse(BaseModel):
    product_id: str
    status: str
    model_version: str
    forecast_timestamp: str
    observation_count: int
    unique_dates: int
    predicted_price: float
    predicted_7d: float
    predicted_14d: float
    predicted_30d: float
    trend: str
    recommendation: str
    confidence: str
    potential_saving: float
    explanation: Optional[str] = None
    points: List[ForecastPoint]
    source: str

class AlternativesRequest(BaseModel):
    product_id: str
    limit: int = 4

class InvalidateCacheRequest(BaseModel):
    product_id: Optional[str] = None
    store_id: Optional[str] = None
    clear_all: bool = False

class AssistantChatRequest(BaseModel):
    message: str
    user_context: Optional[Dict[str, Any]] = None

# ---------------- API Endpoints ----------------

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "PriceWise Production ML Service",
        "version": MODEL_VERSION,
        "cached_products": len(forecast_cache.get("by_product", {})),
        "recommender_ready": recommender is not None,
        "assistant_ready": assistant is not None
    }

@app.post("/predict", response_model=PredictionResponse)
def predict_price(req: PredictionRequest):
    # 1. Fast Cache Hit Path (Sub-millisecond latency for precomputed models)
    if not req.force_inference and not req.historical_prices:
        cached = None
        if req.store_id and req.store_id in forecast_cache.get("by_product_store", {}):
            cached = forecast_cache["by_product_store"][req.store_id]
        elif req.product_id in forecast_cache.get("by_product", {}):
            cached = forecast_cache["by_product"][req.product_id]

        if cached:
            # Invalidation Check 1: Model version mismatch
            if cached.get("model_version") != MODEL_VERSION:
                cached = None
            # Invalidation Check 2: Live price mismatch (> 2% difference from cached price)
            elif req.current_price and cached.get("predicted_price", 0) > 0:
                diff_pct = abs(req.current_price - cached["predicted_price"]) / cached["predicted_price"]
                if diff_pct > 0.02:
                    cached = None
            # Invalidation Check 3: Stale timestamp (> 7 days old)
            elif cached.get("forecast_timestamp"):
                try:
                    ts = datetime.fromisoformat(cached["forecast_timestamp"].replace("Z", "+00:00"))
                    if (datetime.now(timezone.utc) - ts).days > 7:
                        cached = None
                except Exception:
                    pass

        if cached:
            return {**cached, "source": "ml-cache"}

    # 2. Dynamic Inference Path (When custom historical prices are supplied)
    norm_points: List[Dict[str, Any]] = []
    base_date = datetime.now(timezone.utc)
    raw_list = req.historical_prices or []
    n = len(raw_list)

    for idx, item in enumerate(raw_list):
        if isinstance(item, (int, float)):
            dt = base_date - timedelta(days=(n - 1 - idx))
            norm_points.append({"price": float(item), "date": dt.strftime('%Y-%m-%d')})
        elif isinstance(item, dict):
            norm_points.append(item)

    fc = generate_full_forecast(
        product_id=req.product_id,
        history_points=norm_points,
        current_price=req.current_price,
        mrp=req.mrp,
        model_choice="prophet"
    )

    prices = [p['price'] for p in norm_points if p.get('price')]
    curr = req.current_price or (prices[-1] if prices else 10000.0)
    stats = {
        "lowestEver": min(prices) if prices else curr,
        "lowest90": min(prices[-90:]) if len(prices) >= 90 else (min(prices) if prices else curr),
        "highest90": max(prices[-90:]) if len(prices) >= 90 else (max(prices) if prices else curr),
        "average90": sum(prices[-90:]) / len(prices[-90:]) if len(prices) >= 90 else (sum(prices) / len(prices) if prices else curr),
    }

    # Calculate uncertainty width at 30 days
    uncertainty_width = None
    pt_30 = next((p for p in fc.get('points', []) if p.get('date') == '30 Days'), None)
    if pt_30 and pt_30.get('upper') and pt_30.get('lower'):
        uncertainty_width = max(0.0, pt_30['upper'] - pt_30['lower'])

    decision = evaluate_decision(
        current_price=curr,
        predicted_7d=fc['predicted_7d'],
        predicted_30d=fc['predicted_30d'],
        stats=stats,
        confidence=fc['confidence'],
        observation_count=len(norm_points),
        uncertainty_width=uncertainty_width
    )

    return {
        **fc,
        "recommendation": decision["recommendation"],
        "confidence": decision["confidence"],
        "potential_saving": decision["potential_saving"],
        "explanation": decision["explanation"],
        "source": "ml-inference"
    }

@app.post("/forecast/invalidate")
def invalidate_cache(req: InvalidateCacheRequest):
    count = 0
    if req.clear_all:
        count = len(forecast_cache.get("by_product", {})) + len(forecast_cache.get("by_product_store", {}))
        forecast_cache["by_product"] = {}
        forecast_cache["by_product_store"] = {}
        return {"status": "ok", "invalidated_count": count, "message": "All forecast caches cleared"}

    if req.product_id and req.product_id in forecast_cache.get("by_product", {}):
        del forecast_cache["by_product"][req.product_id]
        count += 1
    if req.store_id and req.store_id in forecast_cache.get("by_product_store", {}):
        del forecast_cache["by_product_store"][req.store_id]
        count += 1

    return {"status": "ok", "invalidated_count": count}

@app.post("/recommend/alternatives")
def recommend_alternatives(req: AlternativesRequest):
    if not recommender:
        raise HTTPException(status_code=503, detail="Recommender model is not initialized.")

    alts = recommender.find_alternatives(req.product_id, limit=req.limit)
    return {
        "product_id": req.product_id,
        "count": len(alts),
        "alternatives": alts
    }

@app.post("/assistant/chat")
def assistant_chat(req: AssistantChatRequest):
    if not assistant:
        raise HTTPException(status_code=503, detail="Assistant engine is not initialized.")

    return assistant.reply(req.message)

@app.get("/evaluation/report")
def get_evaluation_report():
    if not os.path.exists(EVAL_REPORT_PATH):
        raise HTTPException(status_code=404, detail="Evaluation report not found. Run pipeline/backtest_eval.py first.")

    with open(EVAL_REPORT_PATH, 'r', encoding='utf-8') as f:
        report = json.load(f)

    return report
