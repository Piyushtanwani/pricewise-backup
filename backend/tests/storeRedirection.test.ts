import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCanonicalProductUrl,
  isFlipkartVariantMismatch,
  cleanDestinationUrl,
  getFallbackStoreSearch,
} from '../src/services/storeRedirectService';

test('validateCanonicalProductUrl approves valid Amazon canonical product page with ASIN', () => {
  const url = 'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY?th=1';
  const product = { name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Amazon', product);
  assert.equal(result.isValid, true);
  assert.equal(result.canonicalId, 'B0CHX1W1XY');
  assert.equal(result.canonicalUrl, 'https://www.amazon.in/dp/B0CHX1W1XY');
  assert.equal(result.isFallback, false);
});

test('validateCanonicalProductUrl rejects Amazon URL when generation/model conflicts with target product', () => {
  const url = 'https://www.amazon.in/Apple-iPhone-13-128GB/dp/B09G9FPGTN';
  const product = { name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Amazon', product);
  assert.equal(result.isValid, false);
  assert.ok(result.reason?.includes('mismatch'));
  assert.equal(result.isFallback, true);
  assert.ok(result.fallbackUrl.includes('amazon.in/s?k='));
});

test('validateCanonicalProductUrl rejects accessory landing pages (phone cases, covers, screen protectors)', () => {
  const url = 'https://www.amazon.in/Spigen-back-cover-case-for-iPhone-15/dp/B0C895K7W9';
  const product = { name: 'Apple iPhone 15', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Amazon', product);
  assert.equal(result.isValid, false);
  assert.ok(result.reason?.includes('accessory'));
  assert.equal(result.isFallback, true);
});

test('validateCanonicalProductUrl approves valid Flipkart canonical product page with ITM ID', () => {
  const url = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4';
  const product = { name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Flipkart', product);
  assert.equal(result.isValid, true);
  assert.equal(result.canonicalId, 'itm6ac6485515ae4');
  assert.equal(result.isFallback, false);
});

test('validateCanonicalProductUrl rejects Flipkart URL when storage variant conflicts', () => {
  const url = 'https://www.flipkart.com/apple-iphone-15-black-256-gb/p/itm6ac6485515ae4';
  const product = { name: 'Apple iPhone 15 (512 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Flipkart', product);
  assert.equal(result.isValid, false);
  assert.ok(result.reason?.includes('storage variant'));
  assert.equal(result.isFallback, true);
  assert.ok(result.fallbackUrl.includes('flipkart.com/search'));
});

test('validateCanonicalProductUrl approves valid Croma product page with numeric SKU', () => {
  const url = 'https://www.croma.com/apple-iphone-15-128gb-black/p/300652';
  const product = { name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Croma', product);
  assert.equal(result.isValid, true);
  assert.equal(result.canonicalId, '300652');
  assert.equal(result.isFallback, false);
});

test('validateCanonicalProductUrl rejects broken or placeholder Croma URLs (q=null or /p/null)', () => {
  const url = 'https://www.croma.com/searchB?q=null&text=null';
  const product = { name: 'OnePlus 12', brand: 'OnePlus' };

  const result = validateCanonicalProductUrl(url, 'Croma', product);
  assert.equal(result.isValid, false);
  assert.equal(result.isFallback, true);
  assert.ok(result.fallbackUrl.includes('croma.com/searchB?q=OnePlus%2012'));
});

test('validateCanonicalProductUrl rejects mismatched Vijay Sales appliance URLs', () => {
  const url = 'https://www.vijaysales.com/c/refrigerators';
  const product = { name: 'Samsung Galaxy S24 Ultra', brand: 'Samsung' };

  const result = validateCanonicalProductUrl(url, 'Vijay Sales', product);
  assert.equal(result.isValid, false);
  assert.equal(result.isFallback, true);
  assert.ok(result.fallbackUrl.includes('vijaysales.com/c/smartphones'));
});

test('isFlipkartVariantMismatch detects conflicting storage capacities', () => {
  assert.equal(
    isFlipkartVariantMismatch('https://www.flipkart.com/phone-blue-128-gb/p/itm123', 'Phone 256 GB'),
    true,
  );
  assert.equal(
    isFlipkartVariantMismatch('https://www.flipkart.com/phone-blue-256-gb/p/itm123', 'Phone 256 GB'),
    false,
  );
});

test('cleanDestinationUrl unwraps affiliate redirect links and cleans placeholder queries', () => {
  const wrapped = 'https://affiliate.example.com?dl=https%3A%2F%2Fwww.flipkart.com%2Fitem%2Fp%2Fitm123';
  const cleaned = cleanDestinationUrl(wrapped);
  assert.equal(cleaned, 'https://www.flipkart.com/item/p/itm123');

  const brokenCroma = 'https://www.croma.com/searchB?q=null';
  const cromaCleaned = cleanDestinationUrl(brokenCroma, 'OnePlus 12');
  assert.ok(cromaCleaned.includes('searchB?q=OnePlus%2012'));
});

test('getFallbackStoreSearch generates correct store search URLs', () => {
  const fk = getFallbackStoreSearch('Flipkart', 'iPhone 15');
  assert.ok(fk.startsWith('https://www.flipkart.com/search?q=iPhone%2015'));

  const croma = getFallbackStoreSearch('Croma', 'iPhone 15');
  assert.ok(croma.startsWith('https://www.croma.com/searchB?q=iPhone%2015'));

  const amz = getFallbackStoreSearch('Amazon', 'iPhone 15');
  assert.ok(amz.startsWith('https://www.amazon.in/s?k=iPhone%2015'));
});
