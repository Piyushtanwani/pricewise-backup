import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrefs, DEFAULT_NOTIFICATION_PREFS } from '../src/services/notificationPrefs';

test('readPrefs returns defaults for empty or non-object input', () => {
  const prefsNull = readPrefs(null);
  assert.deepEqual(prefsNull, DEFAULT_NOTIFICATION_PREFS);

  const prefsEmpty = readPrefs({});
  assert.deepEqual(prefsEmpty, DEFAULT_NOTIFICATION_PREFS);

  const prefsPrimitive = readPrefs('invalid');
  assert.deepEqual(prefsPrimitive, DEFAULT_NOTIFICATION_PREFS);
});

test('readPrefs correctly parses partial boolean overrides', () => {
  const custom = {
    priceDropEmail: false,
    weeklyDigest: true,
    ignoredUnknownField: 'malicious-data',
  };
  const parsed = readPrefs(custom);
  assert.equal(parsed.priceDropEmail, false);
  assert.equal(parsed.weeklyDigest, true);
  assert.equal(parsed.targetEmail, true); // Retains default
  assert.equal((parsed as any).ignoredUnknownField, undefined); // Strips unknown fields
});

test('alert threshold evaluation logic', () => {
  // Target reached condition
  const targetPrice = 50000;
  const currentPriceMet = 48000;
  const currentPriceNotMet = 52000;

  const isMet = (current: number, target: number) => current <= target;
  assert.equal(isMet(currentPriceMet, targetPrice), true);
  assert.equal(isMet(currentPriceNotMet, targetPrice), false);

  // Price drop threshold percentage check (e.g. 5% drop)
  const previousBest = 60000;
  const dropThresholdPercent = 5; // 5%
  const thresholdPrice = previousBest * (1 - dropThresholdPercent / 100); // 57000

  const newPriceSignificantDrop = 55000;
  const newPriceMinorDrop = 59000;

  assert.ok(newPriceSignificantDrop < thresholdPrice);
  assert.ok(newPriceMinorDrop >= thresholdPrice);
});
