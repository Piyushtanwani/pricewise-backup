import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DailyPoint,
  buildInsights,
  computeStats,
  computeTrend,
  computeVerdict,
  downsample,
  predictLinear,
  sliceByDays,
  sparkline,
  trailingAverage,
  withCurrentPrice,
} from '../src/services/priceAnalytics';

const DAY = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 0, 1);
const series = (prices: number[]): DailyPoint[] => prices.map((price, i) => ({ day: new Date(start + i * DAY), price }));
const linear = (days: number, from: number, to: number) =>
  series(Array.from({ length: days }, (_, i) => from + ((to - from) * i) / (days - 1)));

test('computeStats returns rounded min/max/avg/current', () => {
  assert.deepEqual(computeStats(series([100, 300, 200])), { lowest: 100, highest: 300, average: 200, current: 200 });
  assert.equal(computeStats([]), null);
});

test('sliceByDays keeps the trailing window inclusive of the last day', () => {
  const s = series([1, 2, 3, 4, 5]);
  assert.deepEqual(sliceByDays(s, 2).map((p) => p.price), [4, 5]);
  assert.equal(sliceByDays(s, null).length, 5);
});

test('computeTrend detects direction with a 2% dead band', () => {
  assert.equal(computeTrend(linear(40, 1000, 900)), 'down');
  assert.equal(computeTrend(linear(40, 1000, 1100)), 'up');
  assert.equal(computeTrend(linear(40, 1000, 1010)), 'stable');
  assert.equal(computeTrend(series([500])), 'stable');
});

test('trailingAverage uses a growing then fixed window', () => {
  assert.deepEqual(trailingAverage(series([10, 20, 30, 40]), 2), [10, 15, 25, 35]);
});

test('downsample keeps first and last and respects the cap', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  const out = downsample(items, 7);
  assert.equal(out.length, 7);
  assert.equal(out[0], 0);
  assert.equal(out[6], 99);
  assert.deepEqual(downsample([1, 2], 7), [1, 2]);
});

test('sparkline returns 7 points ending at the current price', () => {
  const points = sparkline(linear(120, 2000, 1000));
  assert.equal(points.length, 7);
  assert.equal(points[6], 1000);
});

test('withCurrentPrice replaces today or appends it', () => {
  const now = new Date(start + 2 * DAY + 5 * 60 * 60 * 1000);
  assert.deepEqual(withCurrentPrice(series([1, 2, 3]), 9, now).map((p) => p.price), [1, 2, 9]);
  assert.deepEqual(withCurrentPrice(series([1, 2]), 9, now).map((p) => p.price), [1, 2, 9]);
  assert.equal(withCurrentPrice(series([1]), null, now).length, 1);
});

test('computeVerdict labels deals, falling prices, rising prices and thin history', () => {
  // A sudden drop to 15%+ below the 90-day average
  assert.equal(computeVerdict(series([...Array(89).fill(1300), 1000])).label, 'Excellent deal');
  assert.equal(computeVerdict(series([...Array(89).fill(1000), 960])).label, 'Good time to buy');
  // A steady fall is expected to continue, so the verdict agrees with the WAIT forecast
  const falling = computeVerdict(linear(90, 1300, 1000));
  assert.equal(falling.recommendation, 'WAIT');
  assert.equal(falling.recommendation, predictLinear(linear(90, 1300, 1000)).recommendation);
  // Above average and rising: do not tell users to buy at a high
  assert.equal(computeVerdict(series([...Array(80).fill(1000), ...Array(10).fill(1150)])).recommendation, 'MONITOR');
  const thin = computeVerdict(series([1, 2, 3]));
  assert.equal(thin.confidence, 'Low');
  assert.equal(thin.color, 'blue');
});

test('buildInsights mentions the 30-day drop', () => {
  const texts = buildInsights(linear(120, 1200, 1000)).map((i) => i.text);
  assert.ok(texts.some((t) => /dropped \d+% in the last 30 days/.test(t)), texts.join(' | '));
});

test('predictLinear extrapolates a trend and flags insufficient data', () => {
  const falling = predictLinear(linear(60, 1600, 1000));
  assert.equal(falling.insufficientData, false);
  assert.ok(falling.predicted30d < 1000);
  assert.equal(falling.recommendation, 'WAIT');
  assert.equal(falling.points.length, 4);
  assert.equal(falling.points[0].price, 1000);
  for (const p of falling.points.slice(1)) {
    assert.equal(p.price, null);
    assert.ok(p.lower <= p.predicted && p.predicted <= p.upper);
  }
  // Clamped to at most a 50% move
  assert.ok(predictLinear(linear(60, 10000, 100)).predicted30d >= 50);

  const short = predictLinear(series([1, 2, 3]));
  assert.equal(short.insufficientData, true);
  assert.equal(short.recommendation, 'MONITOR');
});
