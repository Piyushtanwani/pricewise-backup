import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryInt, queryNumber, queryString, queryList } from '../src/utils/validate';
import { parseRange } from '../src/services/priceAnalytics';

test('queryString trims and sanitizes input', () => {
  assert.equal(queryString('  iPhone 15 Pro  '), 'iPhone 15 Pro');
  assert.equal(queryString(''), undefined);
  assert.equal(queryString(undefined), undefined);
  assert.equal(queryString(['first', 'second']), 'first');
});

test('queryInt parses integers and enforces bounds', () => {
  assert.equal(queryInt('42', 1), 42);
  assert.equal(queryInt(undefined, 10), 10);
  assert.throws(() => queryInt('invalid', 5), /Expected an integer/);

  // Enforce min and max
  assert.equal(queryInt('0', 1, { min: 1, max: 100 }), 1);
  assert.equal(queryInt('500', 1, { min: 1, max: 100 }), 100);
  assert.equal(queryInt('50', 1, { min: 1, max: 100 }), 50);
});

test('queryNumber parses floats and numeric strings', () => {
  assert.equal(queryNumber('19999.99'), 19999.99);
  assert.equal(queryNumber('-50'), -50);
  assert.equal(queryNumber(undefined), undefined);
  assert.throws(() => queryNumber('not-a-number'), /Expected a number/);
});

test('queryList normalizes array or comma-separated query parameters', () => {
  assert.deepEqual(queryList(['Apple', 'Samsung']), ['Apple', 'Samsung']);
  assert.deepEqual(queryList('Apple, Samsung'), ['Apple', 'Samsung']);
  assert.deepEqual(queryList(''), []);
  assert.deepEqual(queryList(undefined), []);
});

test('parseRange maps valid range keys and defaults to 3M', () => {
  assert.equal(parseRange('7D'), '7D');
  assert.equal(parseRange('30D'), '30D');
  assert.equal(parseRange('3M'), '3M');
  assert.equal(parseRange('6M'), '6M');
  assert.equal(parseRange('1Y'), '1Y');
  assert.equal(parseRange('All'), 'All');
  assert.equal(parseRange('invalid_range'), '3M'); // default is 3M
  assert.equal(parseRange(undefined), '3M');
});
