import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCategory, detectIntent, parseBudget } from '../src/services/assistant';

test('parseBudget understands Indian price formats', () => {
  assert.equal(parseBudget('Best laptop under ₹70K'), 70000);
  assert.equal(parseBudget('Which laptop should I buy under ₹1,00,000?'), 100000);
  assert.equal(parseBudget('phones below 1.5 lakh'), 150000);
  assert.equal(parseBudget('headphones within rs 25000'), 25000);
  assert.equal(parseBudget('something around 30k'), 30000);
  assert.equal(parseBudget('iPhone 16 Pro Max'), null);
  assert.equal(parseBudget('Best value headphones'), null);
});

test('detectCategory prefers catalogue names', () => {
  const known = ['Headphones', 'Laptops', 'Mobiles', 'Televisions'];
  assert.equal(detectCategory('Best laptop under 70K', known), 'Laptops');
  assert.equal(detectCategory('Best value headphones', known), 'Headphones');
  assert.equal(detectCategory('a good phone for my dad', known), 'Mobiles');
  assert.equal(detectCategory('55 inch tv deals', known), 'Televisions');
  assert.equal(detectCategory('Should I buy now?', known), null);
});

test('detectIntent', () => {
  assert.equal(detectIntent('Should I buy now?'), 'buy_now');
  assert.equal(detectIntent('Find cheaper alternatives'), 'alternatives');
  assert.equal(detectIntent('Compare these products'), 'compare');
  assert.equal(detectIntent('Best laptop under ₹70K'), 'recommend');
});
