import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_THRESHOLD, titleSimilarity, titleTokens } from '../src/services/matching';

test('titleTokens joins sizes and drops the brand and stop words', () => {
  assert.deepEqual([...titleTokens('Apple iPhone 16 Pro (256 GB) with Charger', 'Apple')], ['iphone', '16', 'pro', '256gb', 'charger']);
});

test('matches a long store title to the catalogue name', () => {
  const score = titleSimilarity(
    'Apple iPhone 16 Pro Max (256 GB) - Natural Titanium | 6.9-inch display',
    'iPhone 16 Pro Max 256GB Natural Titanium',
    'Apple',
  );
  assert.ok(score >= MATCH_THRESHOLD, `score ${score}`);
});

test('rejects different storage, model numbers and variants', () => {
  assert.equal(titleSimilarity('iPhone 16 Pro Max 256GB', 'iPhone 16 Pro Max 512GB', 'Apple'), 0);
  assert.equal(titleSimilarity('Sony WH-1000XM5 Headphones', 'Sony WH-1000XM4 Headphones', 'Sony'), 0);
  assert.equal(titleSimilarity('iPhone 16 Pro 256GB', 'iPhone 16 Pro Max 256GB', 'Apple'), 0);
});
