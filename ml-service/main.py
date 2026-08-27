from fastapi import FastAPI
from pydantic import BaseModel
import random

app = FastAPI(title="PriceWise ML Service")

class PredictionRequest(BaseModel):
    product_id: str
    historical_prices: list[float]

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ML Service"}

@app.post("/predict")
def predict_price(req: PredictionRequest):
    # Mock prediction logic for now
    if not req.historical_prices:
        return {"error": "Insufficient data"}
    
    current_price = req.historical_prices[-1]
    predicted_price = current_price * random.uniform(0.9, 1.1)
    
    recommendation = "WAIT"
    if predicted_price < current_price * 0.95:
        recommendation = "WAIT"
    elif predicted_price > current_price * 1.05:
        recommendation = "BUY NOW"
    else:
        recommendation = "MONITOR"

    return {
        "product_id": req.product_id,
        "predicted_price": round(predicted_price, 2),
        "recommendation": recommendation,
        "confidence": "Moderate"
    }
