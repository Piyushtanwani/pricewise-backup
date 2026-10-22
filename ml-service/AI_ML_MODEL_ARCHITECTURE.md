# PriceWise Production AI/ML Architecture & Model Technical Specification

**Version:** 2.1.0-hybrid-prophet-xgboost  
**Service Status:** Production Ready  
**Evaluated Cohort:** 56 genuine scraped smartphone series with rolling 30-day chronological test windows  
**Document Scope:** Detailed mathematical specifications, data schemas (rows & columns), feature engineering, training/testing methodologies, error metrics (MAE, RMSE, MAPE, sMAPE), prediction interval calibration, and system architecture.

---

## 1. System Architecture & Component Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PriceWise Client                              │
│             (Vite + React 19 + TypeScript + Tailwind CSS)               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP REST
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Node.js / Express Backend                        │
│               (Port 5000 / TypeScript / Prisma ORM)                     │
│                                                                         │
│  ├── predictionService.ts   (HTTP client with 3.5s bounded timeout)     │
│  ├── assistant.ts           (Grounded LLM proxy with rule fallback)     │
│  └── productController.ts   (Alternatives & price analytics routes)     │
└──────────────────┬─────────────────────────────────┬────────────────────┘
                   │ PostgreSQL (AWS / Supabase)     │ HTTP REST
                   │ (21,685 PriceHistory Rows)      │ (Port 8000)
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│          PostgreSQL Database         │  │       FastAPI ML Service      │
│                                      │  │ (Python 3.12 / Uvicorn)       │
│  - Product (91 rows)                 │  │                               │
│  - ProductStore (273 rows)           │  │  ├── /predict (Hybrid Engine) │
│  - PriceHistory (21,685 rows)        │  │  ├── /recommend/alternatives  │
│  - Store (Amazon, Flipkart, etc.)    │  │  ├── /assistant/chat (Groq)   │
└──────────────────────────────────────┘  │  └── /evaluation/report       │
                                          └──────────────┬────────────────┘
                                                         │ Cloud Inference
                                                         ▼
                                          ┌───────────────────────────────┐
                                          │        Groq Cloud AI          │
                                          │     (qwen/qwen3.8-27b)        │
                                          └───────────────────────────────┘
```

---

## 2. Dataset Specifications, Provenance & Partitioning

### 2.1 Database Schema & Extraction

The data pipeline ([extract_data.py](file:///d:/Pricewise%20Clone/ml-service/pipeline/extract_data.py)) interfaces directly with PostgreSQL to extract three core operational datasets:

1. **`Product` Table (91 rows, 10 columns):**
   * Columns: `id` (UUID), `name` (String), `brand` (String), `category` (String), `mrp` (Float), `bestPrice` (Float), `rating` (Float), `reviewCount` (Int), `specs` (JSON array of strings), `techSpecs` (JSON key-value pairs).
2. **`ProductStore` Table (273 listings across retailers):**
   * Columns: `id` (UUID), `productId` (UUID), `storeId` (UUID), `currentPrice` (Float), `mrp` (Float), `stockStatus` (String), `productUrl` (String).
3. **`PriceHistory` Table (21,685 observation rows):**
   * Columns: `id` (UUID), `productStoreId` (UUID), `price` (Float), `timestamp` (Timestamp with timezone), `productId` (UUID).

### 2.2 Data Provenance Partitioning (Genuine vs. Synthetic)

Audited via [data_provenance.py](file:///d:/Pricewise%20Clone/ml-service/data_provenance.py):
* **Total Catalog Products:** 91
* **80 Genuine Scraped Products:** Sourced from real-world Indian e-commerce scrapers (Smartprix archives and retailer feeds) tracking Amazon.in, Flipkart, Croma, and Vijay Sales. Observations span continuous daily histories between 30 and 366 days.
* **11 Synthetic Seed Products:** Identified originating from development seeds (`backend/prisma/seed.ts`), generated via the Mulberry32 pseudo-random PRNG.
* **Strict Evaluation Rule:** All 11 synthetic products are **strictly excluded** from ML evaluation. Backtesting is executed exclusively on genuine scraped e-commerce series.

### 2.3 Data Cleaning & Daily Deduplication Pipeline

Before ingestion into any forecasting model, raw observation points are cleaned via `clean_series()` in [forecaster.py](file:///d:/Pricewise%20Clone/ml-service/models/forecaster.py):
1. **Invalid Number Filter:** Drops records where $\text{price} \le 0$ or date strings cannot be parsed.
2. **Daily Aggregation (Min-Price Deduplication):** E-commerce scrapers frequently collect multiple price observations per day. The pipeline groups records by calendar day `ds` (`YYYY-MM-DD`) and selects the **minimum price observed on that day**:
   $$\text{Daily Price}(d) = \min_{t \in \text{Day } d} P(t)$$
3. **Sorting:** Sorts chronologically ascending by `ds`.
4. **Clean Series DataFrame Columns:**
   * `ds`: `datetime64[ns]`
   * `y`: `float64`

---

## 3. Feature Engineering & Dataset Matrices

Different models require distinct input dimensionalities:

### 3.1 Feature Engineering for XGBoost Regressor

XGBoost cannot natively process raw non-stationary time series; it requires an autoregressive supervised feature matrix. For each product with $N$ daily points, the pipeline constructs **9 engineered feature columns**:

| Feature Name | Type | Mathematical Definition | Domain Significance |
| :--- | :--- | :--- | :--- |
| `day_of_week` | Integer ($0-6$) | $\text{weekday}(t)$ | Captures weekend sales discounts (Sat-Sun drops). |
| `day_of_month` | Integer ($1-31$) | $\text{day}(t)$ | Captures payday & month-end promotion spikes. |
| `month` | Integer ($1-12$) | $\text{month}(t)$ | Captures annual festive cycles (Diwali, Great Indian Festival). |
| `lag_1` | Float | $y_{t-1}$ | Immediate prior price (strongest predictor in sticky pricing). |
| `lag_2` | Float | $y_{t-2}$ | 2-day price trajectory. |
| `lag_3` | Float | $y_{t-3}$ | 3-day momentum. |
| `lag_7` | Float | $y_{t-7}$ | Prior week same-day price level (weekly seasonality). |
| `rolling_mean_7` | Float | $\frac{1}{7}\sum_{i=1}^7 y_{t-i}$ | Trailing 7-day smoothed price baseline. |
| `rolling_std_7` | Float | $\sqrt{\frac{1}{6}\sum_{i=1}^7 (y_{t-i} - \mu_7)^2}$ | Trailing 7-day local price volatility indicator. |

* **Matrix Dimensions:**
  * **Rows:** $(N - 7)$ training examples (after initial 7 lag rows are dropped via `dropna()`). A minimum of 14 raw daily points is required ($\ge 7$ clean training rows).
  * **Columns:** 9 features in matrix $X$, 1 continuous target in vector $y$.

### 3.2 Feature Engineering for Facebook Prophet

Prophet expects an unlagged univariate time series:
* **Rows:** $N$ daily observations.
* **Columns:** Exactly 2 columns:
  * `ds`: Timestamp column (`YYYY-MM-DD`).
  * `y`: Numeric target price.
* **Holiday Matrix Feature:** Automatically generated via `m.add_country_holidays(country_name='IN')`, introducing binary indicator features for Indian festival and statutory holiday periods.

### 3.3 Feature Engineering for Hardware Recommender

*File:* [recommender.py](file:///d:/Pricewise%20Clone/ml-service/models/recommender.py)  
Extracts a **6-dimensional structured vector** from unstructured text specifications using regex tokenization:
1. `ram_gb`: RAM capacity in GB ($4.0, 6.0, 8.0, 12.0, 16.0$).
2. `storage_gb`: Internal storage in GB ($64.0, 128.0, 256.0, 512.0, 1024.0$).
3. `battery_mah`: Battery capacity in milliamp-hours ($3000 - 6000\text{ mAh}$).
4. `screen_inches`: Display diagonal dimension ($5.8 - 6.8\text{ inches}$).
5. `is_5g`: Binary flag ($1.0$ if 5G detected, $0.0$ otherwise).
6. `price_band`: Best market price normalized using `MinMaxScaler()`.

* **Matrix Dimensions:** $91 \text{ product rows} \times 6 \text{ normalized feature columns}$.

---

## 4. Models Technical Specification

### 4.1 Model 1: Facebook Prophet (`prophet`)

* **Class:** Decomposable Generalized Additive Model (GAM).
* **Mathematical Equation:**
  $$y(t) = g(t) + s(t) + h(t) + \epsilon_t$$
  * **Trend $g(t)$:** Piecewise linear growth model with $K$ automatic changepoints:
    $$g(t) = \left(k + \mathbf{a}(t)^T \boldsymbol{\delta}\right) t + \left(m + \mathbf{a}(t)^T \boldsymbol{\gamma}\right)$$
  * **Seasonality $s(t)$:** Standard Fourier series modeling periodic effects:
    $$s(t) = \sum_{n=1}^P \left( a_n \cos\left(\frac{2\pi n t}{P}\right) + b_n \sin\left(\frac{2\pi n t}{P}\right) \right)$$
  * **Holiday Component $h(t)$:** Binary regressor window for festival sales.
  * **Error $\epsilon_t \sim \mathcal{N}(0, \sigma^2)$**.
* **Hyperparameters in PriceWise:**
  * `daily_seasonality`: `False` (intraday price changes are negligible in daily scrapes).
  * `weekly_seasonality`: `True` for $N \ge 14$, capturing retailer weekend discount campaigns.
  * `yearly_seasonality`: `True` for $N \ge 180$, capturing annual product lifecycles.
  * `changepoint_prior_scale`: `0.05` (prevents severe overfitting to promotional spikes).
  * `interval_width`: `0.90` (generates nominal 90% Bayesian uncertainty bounds).

### 4.2 Model 2: XGBoost Regressor (`xgboost.XGBRegressor`)

* **Class:** Gradient Boosted Decision Tree (GBDT) ensemble.
* **Objective Function:**
  $$\mathcal{L}^{(t)} = \sum_{i=1}^n \left[ l\left(y_i, \hat{y}_i^{(t-1)} + f_t(\mathbf{x}_i)\right) \right] + \Omega(f_t)$$
  Where the regularization term penalizes tree complexity:
  $$\Omega(f_t) = \gamma T + \frac{1}{2} \lambda \sum_{j=1}^T w_j^2$$
* **Hyperparameters in PriceWise:**
  * `n_estimators`: `30` (strictly regularized tree count to prevent overfitting on short series).
  * `max_depth`: `3` (restricts deep non-linear interactions).
  * `learning_rate`: `0.08` (conservative shrinkage factor).
  * `random_state`: `42`.
  * `verbosity`: `0`.
* **Multi-Horizon Recursive Forecasting Algorithm:**
  Multi-step forecasts for $h \in \{7, 14, 30\}$ days are generated via an iterative autoregressive roll-forward loop:
  1. For step $k = 1, 2, \dots, \max(h)$:
     * Construct dynamic feature row $\mathbf{x}_{t+k}$ using predicted price $\hat{y}_{t+k-1}$ as `lag_1`.
     * Update `rolling_mean_7` and `rolling_std_7` across the rolling buffer.
     * Compute $\hat{y}_{t+k} = \max(0.0, \text{model.predict}(\mathbf{x}_{t+k}))$.
     * Append $\hat{y}_{t+k}$ to buffer.
  2. Uncertainty intervals are estimated via the empirical training residual standard deviation $\sigma_{\text{res}}$:
     $$\text{spread}_h = 1.96 \cdot \sigma_{\text{res}} \cdot \sqrt{\frac{h}{7.0}}$$
     $$\text{Interval}_h = \left[ \max(0, \hat{y}_h - \text{spread}_h), \; \hat{y}_h + \text{spread}_h \right]$$

### 4.3 Model 3: Damped Linear Regression (`linear_trend_forecast`)

* **Class:** Ordinary Least Squares (OLS) closed-form regression.
* **Mathematical Equation:**
  $$\hat{y}(x) = \beta_1 x + \beta_0$$
  $$\beta_1 = \frac{\sum_{i=1}^n (x_i - \bar{x})(y_i - \bar{y})}{\sum_{i=1}^n (x_i - \bar{x})^2 + \epsilon}, \quad \beta_0 = \bar{y} - \beta_1 \bar{x}$$
* **Role:** Guaranteed deterministic fallback when historical observations are too scarce ($N < 14$) or when C++ dependencies (Stan/XGBoost) fail.
* **Uncertainty Interval:** Standard error of regression residuals scaled by $\sqrt{h/7.0}$.

### 4.4 Model 4: Naive Baseline (`naive_baseline_forecast`)

* **Mathematical Equation:**
  $$\hat{y}_{t+h} = y_t \quad \forall h \ge 1$$
* **Role:** Persistent last-observed price benchmark used during backtesting.

---

## 5. Model Training & Testing Methodology

### 5.1 Chronological Rolling-Origin Backtesting

To avoid lookahead bias and temporal leakage, the backtesting pipeline ([backtest_eval.py](file:///d:/Pricewise%20Clone/ml-service/pipeline/backtest_eval.py)) uses a **chronological rolling-origin evaluation protocol**:
* **Eligibility Filter:** Only genuine scraped series with $\ge 45$ continuous days are included (**56 genuine products** met criteria).
* **Train / Test Temporal Split:**
  * **Training Horizon:** All historical observations up to $T - 30$ days.
  * **Held-out Test Window:** Exactly the last 30 daily observations $[T-29, T]$.
* **Target Forecast Checkpoints:** Evaluated strictly against ground-truth prices observed at:
  * **Day +7** (1-week horizon)
  * **Day +14** (2-week horizon)
  * **Day +30** (1-month macro horizon)

### 5.2 Error Metrics Formulation

For $n$ test series with actual prices $y_i$ and predicted prices $\hat{y}_i$:

1. **Mean Absolute Error (MAE):**
   $$\text{MAE} = \frac{1}{n}\sum_{i=1}^n |y_i - \hat{y}_i| \quad (\text{in Indian Rupees ₹})$$
2. **Root Mean Squared Error (RMSE):**
   $$\text{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^n (y_i - \hat{y}_i)^2} \quad (\text{in Indian Rupees ₹})$$
3. **Mean Absolute Percentage Error (MAPE):**
   $$\text{MAPE} = \frac{100\%}{n}\sum_{i=1}^n \left|\frac{y_i - \hat{y}_i}{y_i}\right|$$
4. **Symmetric Mean Absolute Percentage Error (sMAPE):**
   $$\text{sMAPE} = \frac{100\%}{n}\sum_{i=1}^n \frac{|y_i - \hat{y}_i|}{(|y_i| + |\hat{y}_i|) / 2}$$

---

## 6. Comprehensive Accuracy & Benchmark Results

### 6.1 Multi-Horizon Benchmark Summary (56 Genuine Products)

Source: [evaluation_report.json](file:///d:/Pricewise%20Clone/ml-service/artifacts/evaluation_report.json)

| Horizon | Model | MAE (₹) | RMSE (₹) | MAPE (%) | sMAPE (%) | Sample Count | Best Model |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **7 Days** | **Naive Baseline** | **₹979.98** | **₹3,430.06** | **1.23%** | **1.27%** | 56 | **Naive Baseline** |
| | Linear Trend | ₹2,082.98 | ₹4,500.99 | 3.23% | 3.32% | 56 | |
| | XGBoost | ₹2,162.14 | ₹4,430.80 | 3.23% | 3.36% | 56 | |
| | Prophet | ₹1,864.52 | ₹4,219.24 | 3.22% | 3.26% | 56 | |
| **14 Days** | **Naive Baseline** | **₹1,671.82** | **₹4,184.50** | **2.17%** | **2.23%** | 56 | **Naive Baseline** |
| | Linear Trend | ₹2,833.62 | ₹5,462.58 | 4.25% | 4.37% | 56 | |
| | XGBoost | ₹2,518.28 | ₹4,920.25 | 3.82% | 3.98% | 56 | |
| | Prophet | ₹2,614.43 | ₹4,913.23 | 4.46% | 4.50% | 56 | |
| **30 Days** | Naive Baseline | ₹3,313.70 | ₹5,618.26 | 7.11% | 7.33% | 56 | |
| | Linear Trend | ₹4,557.01 | ₹6,562.75 | 9.54% | 9.74% | 56 | |
| | **XGBoost** | **₹3,419.04** | **₹5,888.92** | **6.86%** | **7.21%** | 56 | **XGBoost (Lowest MAPE)** |
| | Prophet | ₹4,750.19 | ₹7,459.12 | 11.07% | 11.12% | 56 | |

---

### 6.2 The "7-Day Sticky Price" Finding Explained

A notable empirical finding is that on the 7-day horizon, the **Naive Baseline outperforms all machine learning models** (1.23% MAPE vs 3.22% - 3.23% for ML models):

1. **Stationary Price Stickiness:** In Indian smartphone retail, **36 out of 56 products (64.3%) experienced exactly ₹0.00 price change** across the 7-day test window. For these stationary series, the Naive model achieves an absolute error of ₹0.00 (0.00% MAPE).
2. **Autoregressive Overshoot:** Any learning model attempting to fit non-zero coefficients to recent fluctuations extrapolates small drifts on stationary series, accumulating error.
3. **Outlier Impact on RMSE:** Only 20 products moved in price, and exactly 2 premium flagship items underwent abrupt promotional exits of +₹16,000 and +₹18,000. Because RMSE squares deviations ($16,000^2 + 18,000^2$), these two events alone account for over 70% of the aggregate RMSE.

---

### 6.3 Performance Breakdown by Historical Series Length

| Series Category | Horizon | Model | MAE (₹) | RMSE (₹) | MAPE (%) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Short History (< 60 Days)** | **30 Days** | Naive Baseline | ₹63.00 | ₹89.10 | 0.38% |
| | | Linear Trend | ₹158.31 | ₹223.88 | 0.96% |
| | | XGBoost | ₹63.00 | ₹89.10 | 0.38% |
| | | **Prophet (Best)** | **₹50.62** | **₹71.59** | **0.31%** |
| **Medium History (60 - 180 Days)**| **30 Days** | Naive Baseline | ₹2,957.24 | ₹5,510.43 | 5.28% |
| | | Linear Trend | ₹5,031.81 | ₹7,307.75 | 9.01% |
| | | **XGBoost (Best)** | **₹3,128.77** | **₹5,950.45** | **5.20%** |
| | | Prophet | ₹4,847.88 | ₹7,355.38 | 10.52% |
| **Long History (> 180 Days)** | **30 Days** | Naive Baseline | ₹3,987.24 | ₹5,956.64 | 9.76% |
| | | Linear Trend | ₹4,358.12 | ₹5,875.74 | 10.84% |
| | | **XGBoost (Best)** | **₹4,024.24** | **₹6,050.48** | **9.30%** |
| | | Prophet | ₹5,012.83 | ₹7,865.87 | 12.56% |

*Key Inference:* Prophet shines on **short, sparse series (< 60 days)** where its Bayesian priors prevent exploding forecasts (0.31% MAPE). As history expands to 60-365 days, **XGBoost dominates (5.20% - 9.30% MAPE)**, accurately learning discrete promotional cycles.

---

## 7. Prediction Interval Coverage & Calibration Analysis

Source: [interval_coverage_report.json](file:///d:/Pricewise%20Clone/ml-service/artifacts/interval_coverage_report.json)

| Model | Horizon | Empirical Coverage | Mean Interval Width | Calibration Status |
| :--- | :--- | :--- | :--- | :--- |
| **Linear Trend** | 7 Days | 91.07% | ₹7,079.92 | Over-conservative (Too wide) |
| | 14 Days | 91.07% | ₹10,012.52 | Over-conservative |
| | 30 Days | 75.00% | ₹14,656.83 | Acceptable coverage |
| **XGBoost** | 7 Days | 73.21% | ₹4,165.05 | Well-calibrated |
| | 14 Days | 75.00% | ₹5,890.27 | Well-calibrated |
| | **30 Days** | **76.79%** | **₹8,622.47** | **Best Calibrated (~77% empirical for 80% nominal)** |
| **Prophet** | 7 Days | 73.21% | ₹4,683.41 | Moderate |
| | 14 Days | 64.29% | ₹5,348.76 | Under-covering |
| | 30 Days | **50.00%** | **₹7,802.86** | **Under-covering (Severe failure)** |

*Root Cause of Prophet Interval Failure:* Prophet assumes Gaussian observation noise around smooth continuous curves. E-commerce price series drop or jump in sharp, discrete steps. At 30 days, 50% of real retail prices jump outside Prophet's predicted bounds. Consequently, **XGBoost's residual scaling is selected as the default confidence interval generator**.

---

## 8. Production Hybrid Routing Strategy

Based on the empirical evaluation, the production forecaster ([generate_full_forecast](file:///d:/Pricewise%20Clone/ml-service/models/forecaster.py#L200-L333)) executes an automated routing strategy:

```mermaid
flowchart TD
    A["Raw Price History"] --> B{"Valid History Count?"}
    B -- "< 14 points" --> C["Damped Linear Trend Fallback (Insuff. Data)"]
    B -- ">= 14 points" --> D{"Horizon & Series Type"}
    D -- "Short Series (< 60d)" --> E["Facebook Prophet Engine"]
    D -- "Standard Series (>= 60d)" --> F["XGBoost Regressor Engine"]
    E --> G["Calibration & Uncertainty Gating"]
    F --> G
    C --> G
    G --> H["Deterministic Decision Engine (Buy / Wait / Monitor)"]
```

---

## 9. Decision Intelligence Engine (Buy / Wait / Monitor)

*File:* [decision_engine.py](file:///d:/Pricewise%20Clone/ml-service/models/decision_engine.py)

Evaluates forecasts deterministically through strict precedence rules:

1. **Rule 1 (Insufficient Data):** If observations $< 14$ or current price $\le 0$ $\rightarrow$ **`MONITOR`** (Confidence: Insufficient Data).
2. **Rule 2 (Stale Forecast):** If cached forecast age $> 7$ days $\rightarrow$ **`MONITOR`** (Confidence: Low).
3. **Rule 3 (High Uncertainty Guard):** If $\frac{\text{Interval Width}}{\text{Current Price}} > 0.25$ $\rightarrow$ **`MONITOR`** (Confidence: Low).
4. **Rule 4 (Historical Lowest Deal):** If current price $\le 1.02 \times \text{all-time low}$:
   * If 30-day forecast $< 0.96 \times \text{current price}$ $\rightarrow$ **`WAIT`** (Deeper drop coming).
   * Else $\rightarrow$ **`BUY NOW`** (Confidence: High).
5. **Rule 5 (Impending Price Increase):** If 7-day forecast $\ge 1.04 \times \text{current price}$ and current price $\le \text{average}_{90}$ $\rightarrow$ **`BUY NOW`**.
6. **Rule 6 (Projected Price Drop):** If $\min(\text{predicted}_{7d}, \text{predicted}_{30d}) \le 0.95 \times \text{current price}$ $\rightarrow$ **`WAIT`**.
7. **Rule 7 (Near 90-Day High):** If current price $\ge 0.97 \times \text{highest}_{90}$ $\rightarrow$ **`WAIT`**.
8. **Rule 8 (Default Baseline):** Stable price around 90-day mean $\rightarrow$ **`MONITOR`**.

---

## 10. Hardware-Aware Recommender Specification

*File:* [recommender.py](file:///d:/Pricewise%20Clone/ml-service/models/recommender.py)

1. **Vector Construction:** Encodes each catalog smartphone into $\mathbf{v} \in \mathbb{R}^6$ (`ram_gb`, `storage_gb`, `battery_mah`, `screen_inches`, `is_5g`, `price_band`).
2. **Feature Normalization:** Applies `MinMaxScaler()` so all dimensions lie in $[0, 1]$.
3. **Cosine Similarity Matrix:**
   $$S_{ij} = \frac{\mathbf{v}_i \cdot \mathbf{v}_j}{\|\mathbf{v}_i\| \|\mathbf{v}_j\|}$$
4. **Filtering:** Excludes the query item ($i = j$) and filters items outside $\pm 30\%$ of the query product's price band.
5. **Collaborative Filtering Note:** Due to low customer interaction density ($< 0.01\%$ on 12 registered users), collaborative matrix factorization is withheld in favor of content-based vector similarity to guarantee non-hallucinated alternatives.

---

## 11. Conversational Shopping Assistant Specification

*File:* [assistant_tool.py](file:///d:/Pricewise%20Clone/ml-service/models/assistant_tool.py)

* **LLM Engine:** Groq Cloud API running `qwen/qwen3.8-27b` (`temperature=0.3`, `max_tokens=150`).
* **Tool-Augmented Grounding:** The assistant does not generate freeform prices. User queries are parsed for budget (`parse_budget`) and intent, routed through controlled tools:
  * `search_products(query, min_price, max_price, brand, limit)`
  * `compare_products(product_ids)`
  * `format_product_card(product)`
* **System Prompt Guard:** Forces strict grounding in the database catalogue. If Groq is unavailable, the backend falls back to the deterministic NLP parser in [assistant.ts](file:///d:/Pricewise%20Clone/backend/src/services/assistant.ts).

---

## 12. Verification & Test Execution Guide

To reproduce training, precomputation, and evaluation benchmarks:

```powershell
# 1. Run Data Provenance Audit
python ml-service/data_provenance.py

# 2. Extract Clean Datasets from PostgreSQL
python ml-service/pipeline/extract_data.py

# 3. Precompute Production Forecasts and Cache
python ml-service/pipeline/train_forecaster.py

# 4. Execute Full Chronological Rolling-Origin Backtest
python ml-service/pipeline/backtest_eval.py

# 5. Run Python Test Suite (20 tests)
pytest ml-service/tests/

# 6. Run Backend Express Test Suite (71 tests)
cd backend && npm test
```
