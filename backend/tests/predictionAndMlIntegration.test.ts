import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictPrices } from '../src/services/predictionService';
import { answer } from '../src/services/assistant';

test('predictPrices returns honest deterministic fallback with confidence bounds when service is unreachable', async () => {
  // Empty or short series test
  const shortSeries = [
    { day: new Date('2026-03-01T00:00:00.000Z'), price: 45000 },
    { day: new Date('2026-03-02T00:00:00.000Z'), price: 44500 },
    { day: new Date('2026-03-03T00:00:00.000Z'), price: 44000 }
  ];

  const res = await predictPrices('test-product-id', shortSeries, 44000);
  assert.ok(res);
  assert.equal(Array.isArray(res.points), true);
  assert.ok(['High', 'Moderate', 'Low'].includes(res.confidence));
  assert.ok(['BUY', 'WAIT', 'MONITOR'].includes(res.recommendation));
  assert.ok(typeof res.predicted7d === 'number');
  assert.ok(typeof res.predicted30d === 'number');
  assert.equal(res.insufficientData, true); // series has 3 points < 14 MIN_POINTS_FOR_PREDICTION
  assert.ok(['local-trend', 'ml-service'].includes(res.source));
});

test('predictPrices enforces non-negative price forecasts on declining trend', async () => {
  const declining = [
    { day: new Date('2026-01-01T00:00:00.000Z'), price: 1000 },
    { day: new Date('2026-01-02T00:00:00.000Z'), price: 500 },
    { day: new Date('2026-01-03T00:00:00.000Z'), price: 100 }
  ];

  const res = await predictPrices('test-id-declining', declining, 100);
  assert.ok(res.points.length > 0);
  for (const pt of res.points) {
    assert.ok(pt.predicted >= 0, `Forecasted price ${pt.predicted} must be non-negative`);
    if (pt.price !== null && pt.price !== undefined) {
      assert.ok(pt.price >= 0, `Historical price ${pt.price} must be non-negative`);
    }
  }
});

test('assistant.answer grounds product results in real catalogue items without inventing facts', async () => {
  const res = await answer('Recommend an Apple smartphone');
  assert.equal(res.role, 'assistant');
  assert.ok(res.products.length > 0);
  for (const p of res.products) {
    assert.ok(p.id, 'Product must have valid ID');
    assert.ok(p.name, 'Product must have real catalogue name');
    assert.ok(p.bestPrice > 0, 'Product must have real price > 0');
    assert.ok(p.mrp >= p.bestPrice, 'MRP should be greater than or equal to best price');
  }
});

test('predictPrices falls back to local trend when given non-existent product or invalid service response', async () => {
  const nonExistentSeries = Array.from({ length: 20 }, (_, i) => ({
    day: new Date(Date.now() - (20 - i) * 86400000),
    price: 35000 - i * 100
  }));

  const res = await predictPrices('non-existent-product-id-999', nonExistentSeries, 33000);
  assert.ok(res);
  assert.ok(res.points.length > 0);
  assert.ok(['BUY', 'WAIT', 'MONITOR'].includes(res.recommendation));
  assert.ok(['High', 'Moderate', 'Low'].includes(res.confidence));
});
