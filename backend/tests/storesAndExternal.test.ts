import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAllowedStore, getLiveSerpStorePrices, parseStockStatus, resolveOfferUrl } from '../src/services/serpShoppingService';

test('matchAllowedStore permits only verified stores: Amazon, Flipkart, Croma, Vijay Sales, Brand', () => {
  // Amazon
  const amazon = matchAllowedStore('Amazon.in', 'Apple', 'iPhone 15');
  assert.ok(amazon);
  assert.equal(amazon?.key, 'amazon');
  assert.equal(amazon?.displayName, 'Amazon');
  assert.ok(amazon?.directUrl.includes('amazon.in'));

  // Flipkart
  const flipkart = matchAllowedStore('Flipkart', 'Samsung', 'Galaxy S24');
  assert.ok(flipkart);
  assert.equal(flipkart?.key, 'flipkart');
  assert.equal(flipkart?.displayName, 'Flipkart');

  // Croma
  const croma = matchAllowedStore('Croma Retail', 'OnePlus', 'OnePlus 12');
  assert.ok(croma);
  assert.equal(croma?.key, 'croma');
  assert.equal(croma?.displayName, 'Croma');

  // Vijay Sales
  const vijay = matchAllowedStore('Vijay Sales India', 'Apple', 'iPhone 16');
  assert.ok(vijay);
  assert.equal(vijay?.key, 'vijay_sales');

  // Official Brand Store
  const appleStore = matchAllowedStore('Apple Official', 'Apple', 'iPhone 16 Pro');
  assert.ok(appleStore);
  assert.equal(appleStore?.key, 'brand');
  assert.equal(appleStore?.displayName, 'Apple Store');

  const samsungStore = matchAllowedStore('Samsung Shop', 'Samsung', 'Galaxy S24 Ultra');
  assert.ok(samsungStore);
  assert.equal(samsungStore?.key, 'brand');
  assert.equal(samsungStore?.displayName, 'Samsung Shop');
});

test('matchAllowedStore strictly rejects unverified third-party stores', () => {
  assert.equal(matchAllowedStore('FoneZone India', 'Apple', 'iPhone 15'), null);
  assert.equal(matchAllowedStore('Cashify Refurbished', 'Apple', 'iPhone 15'), null);
  assert.equal(matchAllowedStore('Budli Store', 'Samsung', 'Galaxy S23'), null);
  assert.equal(matchAllowedStore('RandomStore.xyz', 'OnePlus', 'Nord CE'), null);
  assert.equal(matchAllowedStore('', 'Apple', 'iPhone 15'), null);
});

test('parseStockStatus accurately identifies stock status from various attributes', () => {
  assert.deepEqual(parseStockStatus({ availability: 'Out of stock' }), { availability: 'Out of Stock', stockStatus: 'OUT_OF_STOCK' });
  assert.deepEqual(parseStockStatus({ delivery: 'Currently unavailable from seller' }), { availability: 'Out of Stock', stockStatus: 'OUT_OF_STOCK' });
  assert.deepEqual(parseStockStatus({ tag: 'Sold out' }), { availability: 'Out of Stock', stockStatus: 'OUT_OF_STOCK' });
  assert.deepEqual(parseStockStatus({ in_stock: false }), { availability: 'Out of Stock', stockStatus: 'OUT_OF_STOCK' });

  assert.deepEqual(parseStockStatus({ delivery: 'Only 2 left in stock - order soon' }), { availability: 'Limited Stock', stockStatus: 'LIMITED' });
  assert.deepEqual(parseStockStatus({ snippet: 'Limited stock available' }), { availability: 'Limited Stock', stockStatus: 'LIMITED' });

  assert.deepEqual(parseStockStatus({ delivery: 'Free delivery by Friday' }), { availability: 'In Stock', stockStatus: 'IN_STOCK' });
  assert.deepEqual(parseStockStatus({}), { availability: 'In Stock', stockStatus: 'IN_STOCK' });
});

test('resolveOfferUrl cleans up redirects and preserves direct links', () => {
  const fallback = 'https://www.amazon.in/s?k=test';
  assert.equal(resolveOfferUrl(undefined, fallback), fallback);
  assert.equal(resolveOfferUrl('', fallback), fallback);
  assert.equal(resolveOfferUrl('https://www.amazon.in/dp/B0BDK62PDX', fallback), 'https://www.amazon.in/dp/B0BDK62PDX');
  assert.equal(
    resolveOfferUrl('https://www.google.com/url?q=https://www.flipkart.com/item/123&sa=U', fallback),
    'https://www.flipkart.com/item/123'
  );
});

test('getLiveSerpStorePrices returns empty array cleanly when no key is configured or product is empty', async () => {
  const resultEmpty = await getLiveSerpStorePrices('');
  assert.deepEqual(resultEmpty, []);

  // When productName is given but if serpApiKey is missing, returns empty array without crashing
  const result = await getLiveSerpStorePrices('NonExistentTestPhone12345');
  assert.ok(Array.isArray(result));
});
