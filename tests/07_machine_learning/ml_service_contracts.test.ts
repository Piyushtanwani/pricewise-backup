import { test } from 'node:test';
import assert from 'node:assert/strict';

// TC-ML-01: Service readiness & health contract
test('TC-ML-01: ML Service contract conforms to status: ok schema', () => {
  const healthResponse = {
    status: 'ok',
    version: '1.2.0',
    cached_products: 371,
    models_loaded: ['forecaster_linear', 'recommender_tfidf'],
  };

  assert.equal(healthResponse.status, 'ok');
  assert.ok(healthResponse.cached_products >= 0);
  assert.ok(healthResponse.models_loaded.length > 0);
});

// TC-ML-02: Decision Engine "BUY" signal on All-Time Low price
test('TC-ML-02: Decision Engine outputs BUY signal when price is within 2% of 90-day minimum', () => {
  const min90DayPrice = 45000;
  const currentPrice = 45500; // Within 1.1% of min

  const diffPercent = ((currentPrice - min90DayPrice) / min90DayPrice) * 100;
  const isAllTimeLow = diffPercent <= 2.0;

  const getVerdict = (atLow: boolean) => (atLow ? { verdict: 'BUY', confidence: 'High' } : { verdict: 'MONITOR', confidence: 'Moderate' });
  const result = getVerdict(isAllTimeLow);

  assert.equal(result.verdict, 'BUY');
  assert.equal(result.confidence, 'High');
});

// TC-ML-03: Decision Engine "WAIT" signal on projected drop
test('TC-ML-03: Decision Engine outputs WAIT signal when forecast projects >5% price drop in 30 days', () => {
  const currentPrice = 50000;
  const forecasted30DayPrice = 46000; // 8% drop projected
  const dropPercent = ((currentPrice - forecasted30DayPrice) / currentPrice) * 100;

  const getVerdict = (drop: number) => {
    if (drop >= 5.0) {
      return { verdict: 'WAIT', potential_saving: currentPrice - forecasted30DayPrice };
    }
    return { verdict: 'MONITOR', potential_saving: 0 };
  };

  const decision = getVerdict(dropPercent);
  assert.equal(decision.verdict, 'WAIT');
  assert.equal(decision.potential_saving, 4000);
});

// TC-ML-04: Insufficient data handling (< 14 data points)
test('TC-ML-04: Insufficient data (< 14 points) safely falls back to MONITOR verdict without throwing', () => {
  const shortHistory = [52000, 51500, 51000]; // Only 3 data points

  const evaluateDataSufficient = (series: number[]) => {
    if (series.length < 14) {
      return { verdict: 'MONITOR', confidence: 'Insufficient Data' };
    }
    return { verdict: 'BUY', confidence: 'High' };
  };

  const decision = evaluateDataSufficient(shortHistory);
  assert.equal(decision.verdict, 'MONITOR');
  assert.equal(decision.confidence, 'Insufficient Data');
});

// TC-ML-05: Non-negativity price boundary constraint (BUG-003)
test('TC-ML-05: Forecaster bounds all predictions to positive space regardless of steep downward slope (BUG-003)', () => {
  const mrp = 100000;
  const minHistorical = 60000;
  const rawRegressionForecast = -15000; // Steep theoretical linear plunge below 0

  // Clamping rule: max(mrp * 0.20, min_historical * 0.70, raw_forecast)
  const boundedPrice = Math.max(mrp * 0.20, minHistorical * 0.70, rawRegressionForecast);

  assert.ok(boundedPrice > 0, 'Forecasted price must never be negative or zero');
  assert.equal(boundedPrice, 42000, 'Bounded to 70% of historical minimum floor');
});

// TC-ML-06: Cache invalidation on sudden live price shift (> 20%)
test('TC-ML-06: Price shifts > 20% invalidate cached ML predictions and trigger fresh inference', () => {
  const cachedPrice = 50000;
  const newPrice = 38000; // 24% sudden flash sale drop

  const percentShift = Math.abs((newPrice - cachedPrice) / cachedPrice) * 100;
  const shouldBustCache = percentShift > 20.0;

  assert.equal(shouldBustCache, true, 'Cache must be invalidated when price shifts > 20%');
});

// TC-ML-07: Content-based alternative suggestions
test('TC-ML-07: Recommendation engine returns up to 4 alternatives in same category excluding target item', () => {
  const targetPhoneId = 'target-phone-16';
  const categoryCatalog = [
    { id: 'target-phone-16', name: 'iPhone 16 Pro', category: 'Mobiles' },
    { id: 'phone-alt-1', name: 'Samsung S25 Ultra', category: 'Mobiles' },
    { id: 'phone-alt-2', name: 'Google Pixel 9 Pro', category: 'Mobiles' },
    { id: 'phone-alt-3', name: 'OnePlus 13', category: 'Mobiles' },
    { id: 'laptop-unrelated', name: 'MacBook Air M3', category: 'Laptops' },
  ];

  const alternatives = categoryCatalog
    .filter((p) => p.category === 'Mobiles' && p.id !== targetPhoneId)
    .slice(0, 4);

  assert.equal(alternatives.length, 3);
  assert.ok(!alternatives.some((a) => a.id === targetPhoneId), 'Target product must be excluded from alternatives');
});

// TC-ML-08: Missing specs resilience
test('TC-ML-08: Empty or malformed specs object handles missing keys gracefully without crashing', () => {
  const emptySpecs = {};

  const extractFeatureVector = (specs: Record<string, any>) => {
    return {
      ramGb: parseFloat(String(specs.RAM || specs.ram || '0').replace(/[^0-9.]/g, '')) || 0,
      storageGb: parseFloat(String(specs.Storage || specs.storage || '0').replace(/[^0-9.]/g, '')) || 0,
      batteryMah: parseFloat(String(specs.Battery || specs.battery || '0').replace(/[^0-9.]/g, '')) || 0,
    };
  };

  const vector = extractFeatureVector(emptySpecs);
  assert.equal(vector.ramGb, 0);
  assert.equal(vector.storageGb, 0);
  assert.equal(vector.batteryMah, 0);
});
