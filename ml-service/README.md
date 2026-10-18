# PriceWise AI/ML Production Service

Production-grade time-series price forecasting, decision intelligence (Buy / Wait / Monitor), spec-aware product recommendation, and grounded shopping assistant layer for PriceWise.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PriceWise Frontend                       │
│        (Vite + React 19 + TypeScript + TailwindCSS)         │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
        HTTP REST (JSON)               HTTP REST (JSON)
               │                              │
┌──────────────▼──────────────────────────────┴───────────────┐
│                    Express Backend                          │
│               (Port 5000 / TypeScript)                      │
│                                                             │
│  - predictionService.ts (HTTP client, bounded retries)     │
│  - assistant.ts (LLM proxy with rule fallback)              │
│  - productController.ts (content-based alternatives)        │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
        HTTP REST (JSON)               HTTP REST (JSON)
        (ML_SERVICE_URL)             (Timeout: 3500ms)
               │                              │
┌──────────────▼──────────────────────────────┴───────────────┐
│                 FastAPI ML Service                          │
│           (Port 8000 / Python 3.12 / Uvicorn)               │
│                                                             │
│  ├── /predict               (Prophet / XGBoost / Cache)     │
│  ├── /recommend/alternatives (Scikit-Learn Cosine Sim)       │
│  ├── /assistant/chat        (Groq Qwen 27B + Controlled Tools)│
│  ├── /evaluation/report     (Chronological Backtest Stats)   │
│  └── /health                (Status & Cache Diagnostics)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Provenance & Verification Audit

Audit verified against the live PostgreSQL database:
- **Total Catalogue Products:** 91
- **Historical Observations:** 21,685 price records
- **Genuine vs Synthetic Partitioning:**
  - **80 genuine products:** Derived from real Indian e-commerce scrapers (Smartprix archive) with continuous historical tracking ranging from 30 to 366 observation dates.
  - **11 synthetic seed products:** Identified via `ml-service/data_provenance.py` originating from `backend/prisma/seed.ts` (e.g., `cm71...`, `seed-phone-...`).
- **Retailer Verification:** All observations map strictly to unique `ProductStore` listings (Amazon, Flipkart, Croma, Vijay Sales). Series are never mixed across stores.
- **The 401 Records > MRP:** Verified as authentic historical price spikes during holiday stock shortages or introductory launch phases before MRP revisions. They are preserved in the historical dataset as valid ground truth.

---

## 3. Forecasting Engine & Backtest Results

### Models Implemented
1. **Naive Baseline:** Last-observed price persistence model.
2. **Damped Linear Trend:** Least-squares linear regression over trailing 45 days with horizon damping.
3. **XGBoost Regressor (`xgboost`):** Gradient boosted trees using lag features (t-1, t-7, t-14), rolling mean, rolling standard deviation, and horizon offsets.
4. **Facebook Prophet (`prophet`):** Generalized additive model with weekly/monthly seasonalities and calibrated uncertainty intervals (80% confidence upper/lower bounds).

### Chronological Backtesting (Rolling Origin)
Evaluated on **56 genuine products** having $\ge 45$ continuous days of history using rolling 30-day held-out test windows:

| Horizon | Model | MAE (₹) | RMSE (₹) | MAPE (%) | sMAPE (%) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **7-Day** | **Naive Baseline** | ₹979.98 | ₹3,430.06 | 1.23% | 1.27% |
| | **Linear Trend** | ₹2,082.98 | ₹4,500.99 | 3.23% | 3.32% |
| | **XGBoost** | ₹2,162.14 | ₹4,430.80 | 3.23% | 3.36% |
| | **Prophet** | ₹1,864.52 | ₹4,219.24 | 3.22% | 3.26% |
| **14-Day** | **Naive Baseline** | ₹1,671.82 | ₹4,184.50 | 2.17% | 2.23% |
| | **XGBoost** | ₹2,518.28 | ₹4,920.25 | 3.82% | 3.98% |
| | **Prophet** | ₹2,614.43 | ₹4,913.23 | 4.46% | 4.50% |
| **30-Day** | **Naive Baseline** | ₹3,313.70 | ₹5,618.26 | 7.11% | 7.33% |
| | **XGBoost (Best)** | **₹3,419.04** | **₹5,888.92** | **6.86%** | **7.21%** |
| | **Prophet** | ₹4,750.19 | ₹7,459.12 | 11.07% | 11.12% |

*Key finding:* On ultra-short horizons (7 days), smartphones experience flat pricing, making the naive baseline tough to beat. On 30-day horizons, XGBoost achieves the best MAPE (**6.86%**), accurately capturing macro price depreciation.

---

## 4. Decision Engine (Buy / Wait / Monitor)

The deterministic decision engine evaluates predictions with strict precedence rules:
1. **Rule 1 (Insufficient Data):** History < 14 observations $\rightarrow$ `MONITOR` (Confidence: Low).
2. **Rule 2 (Historical Lowest Price Deal):** Current price $\le 1.02 \times \text{all-time low}$ $\rightarrow$ `BUY` (Confidence: High).
3. **Rule 3 (Projected Price Rise):** 30d forecast $> 1.03 \times \text{current price}$ $\rightarrow$ `BUY` (Avoid impending hike).
4. **Rule 4 (Significant Projected Drop):** 30d forecast $< 0.97 \times \text{current price}$ $\rightarrow$ `WAIT` (Wait for savings).
5. **Rule 5 (High Uncertainty Band):** Confidence interval width $> 0.15 \times \text{current price}$ $\rightarrow$ `MONITOR` (Confidence: Moderate).
6. **Rule 6 (Price Stability):** Price variation within $\pm 3\%$ $\rightarrow$ `MONITOR` (Confidence: High).

---

## 5. Product Recommendations & Alternatives

Implemented in `ml-service/models/recommender.py`:
- Extracts structured hardware vectors from raw unstructured specs:
  - **RAM (GB):** e.g. 8GB, 12GB, 16GB
  - **Internal Storage (GB):** e.g. 128GB, 256GB, 512GB, 1TB
  - **Battery Capacity (mAh):** e.g. 5000 mAh
  - **Screen Size (inches):** e.g. 6.7"
  - **5G Connectivity:** Boolean flag
  - **Brand & Category:** One-hot / category encoding
  - **Price Band:** MinMax scaled with log-transform
- Computes cosine similarity via `sklearn.metrics.pairwise.cosine_similarity`.
- Excludes the query product itself and incompatible price categories.
- **Collaborative Filtering Status:** Formally documented as **Pending**. Database contains only 12 registered users and 23 total interaction items (wishlists/watchlists), yielding an interaction density $< 0.01\%$. Content-based filtering is used to prevent fabricated recommendations.

---

## 6. Grounded Shopping Assistant

Implemented in `ml-service/models/assistant_tool.py`:
- **LLM Engine:** Groq Cloud with `qwen/qwen3.8-27b` (parameterized via `GROQ_MODEL`).
- **Grounded Tool Architecture:**
  - `search_products(query, min_price, max_price, brand, limit)`
  - `compare_products(product_ids)`
  - `format_product_card(product)`
- **Safety & Fallback:**
  - Does not execute arbitrary SQL or external URLs.
  - Transparent attribution: replies return `source: 'groq-qwen/qwen3.8-27b'` or `source: 'rule-based-fallback'`.

---

## 7. Pipeline & Execution Guide

### Step 1: Environment Setup
```powershell
# In ml-service/
pip install -r requirements.txt
```

### Step 2: Data Extraction & Provenance Audit
```powershell
python data_provenance.py
python pipeline/extract_data.py
```

### Step 3: Train & Precompute Forecasts
```powershell
python pipeline/train_forecaster.py
```

### Step 4: Run Chronological Backtest Evaluation
```powershell
python pipeline/backtest_eval.py
```

### Step 5: Launch FastAPI ML Service
```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Step 6: Run Automated Test Suites
```powershell
# Python Tests (20 tests)
pytest tests/

# Backend Express Tests (46 tests)
cd ../backend
npm test
```
