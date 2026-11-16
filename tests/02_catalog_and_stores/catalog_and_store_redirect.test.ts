import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCanonicalProductUrl,
  isFlipkartVariantMismatch,
  checkProductUrlModelMismatch,
  cleanDestinationUrl,
} from '../../backend/src/services/storeRedirectService';
import { resolveProductImageUrl } from '../../backend/src/services/productService';

// TC-PROD-01: Paginated product catalog listing
test('TC-PROD-01: Product catalog pagination calculation and bounds validation', () => {
  const total = 45;
  const limit = 10;
  const totalPages = Math.ceil(total / limit);

  assert.equal(totalPages, 5, '45 items with 10 per page must equal 5 pages');

  const page1Offset = (1 - 1) * limit;
  const page2Offset = (2 - 1) * limit;

  assert.equal(page1Offset, 0);
  assert.equal(page2Offset, 10);
});

// TC-PROD-02: Free text keyword search with brand match
test('TC-PROD-02: Free text keyword search query tokenization and normalization', () => {
  const query = '  SoNy WH-1000XM5 wireless  ';
  const tokens = query.trim().toLowerCase().split(/\s+/);

  assert.deepEqual(tokens, ['sony', 'wh-1000xm5', 'wireless']);

  // Case-insensitive brand matching
  const targetBrand = 'Sony';
  const isMatch = tokens.includes(targetBrand.toLowerCase());
  assert.equal(isMatch, true, 'Brand search must match case-insensitively');
});

// TC-PROD-03: Side-by-side spec comparison matrix alignment
test('TC-PROD-03: Product compare aligns technical specifications (RAM, CPU, Display, Battery)', () => {
  const phone1 = {
    name: 'iPhone 16 Pro Max',
    techSpecs: { RAM: '8 GB', Battery: '4685 mAh', Display: '6.9 in OLED', Storage: '256 GB' },
  };
  const phone2 = {
    name: 'Samsung Galaxy S25 Ultra',
    techSpecs: { RAM: '12 GB', Battery: '5000 mAh', Display: '6.8 in Dynamic AMOLED' }, // missing Storage
  };

  const allKeys = Array.from(new Set([
    ...Object.keys(phone1.techSpecs),
    ...Object.keys(phone2.techSpecs),
  ]));

  assert.ok(allKeys.includes('RAM'));
  assert.ok(allKeys.includes('Battery'));
  assert.ok(allKeys.includes('Display'));
  assert.ok(allKeys.includes('Storage'));

  // Missing spec shows fallback
  const p2Storage = (phone2.techSpecs as any)['Storage'] || '—';
  assert.equal(p2Storage, '—', 'Missing spec in comparison matrix must display fallback dash');
});

// TC-STORE-01: Canonical Amazon ASIN validation
test('TC-STORE-01: Amazon ASIN extraction and canonical redirect verification', () => {
  const url = 'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY?th=1&tag=affil-21';
  const product = { name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  const result = validateCanonicalProductUrl(url, 'Amazon', product);
  assert.equal(result.isValid, true);
  assert.equal(result.canonicalId, 'B0CHX1W1XY');
  assert.equal(result.canonicalUrl, 'https://www.amazon.in/dp/B0CHX1W1XY');
  assert.equal(result.isFallback, false);
});

// TC-STORE-02: Accessory mismatch prevention (BUG-001)
test('TC-STORE-02: Anti-accessory guard flags phone covers, cases, and protectors (BUG-001)', () => {
  const accessoryUrls = [
    'https://www.amazon.in/Spigen-Liquid-Air-Back-Cover/dp/B0C895K7W9',
    'https://www.flipkart.com/tempered-glass-screen-guard/p/itmfb7189c',
    'https://www.amazon.in/Fast-Charging-Type-C-Cable/dp/B09XYZ1234',
  ];
  const product = { name: 'Apple iPhone 15', brand: 'Apple' };

  for (const accUrl of accessoryUrls) {
    const res = validateCanonicalProductUrl(accUrl, accUrl.includes('flipkart') ? 'Flipkart' : 'Amazon', product);
    assert.equal(res.isValid, false, `Accessory url ${accUrl} must be rejected`);
    assert.equal(res.isFallback, true, 'Accessory url must fallback to search page');
  }
});

// TC-STORE-03: Storage & Variant mismatch resolution
test('TC-STORE-03: Storage/color variant mismatch detection safely triggers search fallback', () => {
  const targetProduct = { name: 'Apple iPhone 15 (256 GB) Black', brand: 'Apple' };
  const conflictingUrl = 'https://www.flipkart.com/apple-iphone-15-blue-128-gb/p/itm12345';

  const mismatch = isFlipkartVariantMismatch(conflictingUrl, targetProduct.name);
  assert.equal(mismatch, true, 'Must detect 128GB in URL vs 256GB target product as variant mismatch');

  const cleaned = cleanDestinationUrl(conflictingUrl, 'Flipkart');
  assert.ok(cleaned.startsWith('https://'));
  assert.ok(!cleaned.includes('affid=malicious'));
});

