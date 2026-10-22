import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrice,
  evaluateStockStatus,
  normalizeStoreOffer,
  sanitizePriceForDb,
} from '../src/utils/priceNormalizer';
import { livePriceCache } from '../src/utils/cache';

test('parsePrice correctly handles numeric values', () => {
  assert.equal(parsePrice(14999), 14999);
  assert.equal(parsePrice(14999.49), 14999);
  assert.equal(parsePrice(14999.89), 15000);
  assert.equal(parsePrice(0), 0);
  assert.equal(parsePrice(-500), 0);
  assert.equal(parsePrice(NaN), 0);
  assert.equal(parsePrice(Infinity), 0);
});

test('parsePrice cleans Indian Lakh/Crore formatted strings with currency symbols and commas', () => {
  assert.equal(parsePrice('₹1,29,999.00'), 129999);
  assert.equal(parsePrice('₹ 74,999'), 74999);
  assert.equal(parsePrice('Rs. 54,999/-'), 54999);
  assert.equal(parsePrice('Rs 49999'), 49999);
  assert.equal(parsePrice('INR 1,19,900'), 119900);
  assert.equal(parsePrice('₹&nbsp;64,999'), 64999);
  assert.equal(parsePrice('&#8377; 84,999'), 84999);
});

test('parsePrice converts USD amounts using exchange rate', () => {
  assert.equal(parsePrice('$999', { defaultUsdRate: 86 }), 85914);
  assert.equal(parsePrice('$ 1,000.00', { defaultUsdRate: 86 }), 86000);
  assert.equal(parsePrice('USD 500', { defaultUsdRate: 85 }), 42500);
});

test('parsePrice handles range strings by extracting the primary/lowest price', () => {
  assert.equal(parsePrice('₹54,999 - ₹59,999'), 54999);
  assert.equal(parsePrice('Rs. 20,000 to Rs. 25,000'), 20000);
});

test('parsePrice enforces optional min and max sanity thresholds', () => {
  assert.equal(parsePrice('₹1,500', { minThreshold: 3000 }), 0); // accessory rejected
  assert.equal(parsePrice('₹45,000', { minThreshold: 3000 }), 45000);
  assert.equal(parsePrice('₹5,00,000', { maxThreshold: 200000 }), 0);
});

test('parsePrice safely handles null, undefined, and garbage input', () => {
  assert.equal(parsePrice(null), 0);
  assert.equal(parsePrice(undefined), 0);
  assert.equal(parsePrice(''), 0);
  assert.equal(parsePrice('   '), 0);
  assert.equal(parsePrice('Free'), 0);
  assert.equal(parsePrice('Contact Seller'), 0);
});

test('evaluateStockStatus evaluates booleans explicitly', () => {
  assert.deepEqual(evaluateStockStatus(true), {
    availability: 'In Stock',
    stockStatus: 'IN_STOCK',
    inStock: true,
  });

  assert.deepEqual(evaluateStockStatus(false), {
    availability: 'Out of Stock',
    stockStatus: 'OUT_OF_STOCK',
    inStock: false,
  });
});

test('evaluateStockStatus accurately identifies out-of-stock phrases across retailers', () => {
  const oosSamples = [
    'Out of Stock',
    'out_of_stock',
    'Currently unavailable',
    'Temporarily out of stock',
    'Sold Out',
    'This item has been discontinued',
    'NOTIFY ME',
    'Notify Me when available',
    'Coming soon',
    "We don't know when or if this item will be back in stock",
  ];

  for (const sample of oosSamples) {
    const res = evaluateStockStatus(sample);
    assert.equal(res.stockStatus, 'OUT_OF_STOCK', `Expected ${sample} to be OUT_OF_STOCK`);
    assert.equal(res.inStock, false);
  }
});

test('evaluateStockStatus identifies limited stock indicators', () => {
  const limitedSamples = [
    'Only 2 left in stock',
    'Few left in stock',
    'Limited stock available',
    'Order soon - 1 item remaining',
  ];

  for (const sample of limitedSamples) {
    const res = evaluateStockStatus(sample);
    assert.equal(res.stockStatus, 'LIMITED', `Expected ${sample} to be LIMITED`);
    assert.equal(res.inStock, true);
  }
});

test('evaluateStockStatus protects against false out-of-stock on A/B tested DOM or unknown strings', () => {
  // Retailer text shifts during A/B tests or international delivery descriptions
  const inStockSamples = [
    'In Stock',
    'Available from these sellers',
    'FREE Delivery by Friday',
    'Get it by tomorrow, 2 PM',
    'Ships within 24 hours',
    'Brand New Sealed Pack',
    'Special Festive Offer',
  ];

  for (const sample of inStockSamples) {
    const res = evaluateStockStatus(sample);
    assert.equal(res.stockStatus, 'IN_STOCK', `Expected "${sample}" NOT to be falsely marked OUT_OF_STOCK`);
    assert.equal(res.inStock, true);
  }
});

test('normalizeStoreOffer sanitizes raw store offer before database ingestion', () => {
  const raw = {
    storeName: 'Amazon',
    rawPrice: '₹ 79,999.00',
    rawStock: 'In Stock',
    mrp: '₹ 89,900',
    productUrl: 'https://www.amazon.in/dp/B0BDK62PDX',
  };

  const normalized = normalizeStoreOffer(raw);
  assert.equal(normalized.storeName, 'Amazon');
  assert.equal(normalized.price, 79999);
  assert.equal(normalized.mrp, 89900);
  assert.equal(normalized.availability, 'In Stock');
  assert.equal(normalized.stockStatus, 'IN_STOCK');
  assert.equal(normalized.inStock, true);
});

test('sanitizePriceForDb returns positive float or null for database ingestion', () => {
  assert.equal(sanitizePriceForDb('₹ 1,29,999'), 129999);
  assert.equal(sanitizePriceForDb(0), null);
  assert.equal(sanitizePriceForDb('Out of stock'), null);
  assert.equal(sanitizePriceForDb(null), null);
});

test('livePriceCache supports real-time caching and immediate invalidation', async () => {
  const key = 'test::iphone15';
  const data = [{ store: 'Amazon', price: 69999 }];

  await livePriceCache.set(key, data, 5);
  const cached = await livePriceCache.get(key);
  assert.deepEqual(cached, data);

  // Real-time invalidation
  await livePriceCache.del(key);
  const afterDel = await livePriceCache.get(key);
  assert.equal(afterDel, null);
});
