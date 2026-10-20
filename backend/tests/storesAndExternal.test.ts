import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAllowedStore, getLiveSerpStorePrices } from '../src/services/serpShoppingService';

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

test('getLiveSerpStorePrices returns empty array cleanly when no key is configured or product is empty', async () => {
  const resultEmpty = await getLiveSerpStorePrices('');
  assert.deepEqual(resultEmpty, []);

  // When productName is given but if serpApiKey is missing, returns empty array without crashing
  const result = await getLiveSerpStorePrices('NonExistentTestPhone12345');
  assert.ok(Array.isArray(result));
});
