import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExactProductMatch,
  calculateJaccardSimilarity,
  hasVariantMismatch,
  tokenizeTitle,
} from '../src/utils/productMatcher';
import { sanitizeRetailerUrl, resolveOfferUrl } from '../src/services/serpShoppingService';

describe('Fix B: Product Title Verification (productMatcher.ts)', () => {
  it('tokenizes string correctly ignoring words <= 2 characters and punctuation', () => {
    const tokens = tokenizeTitle('Apple iPhone 15 (128 GB) - Black!');
    assert.ok(tokens.has('apple'));
    assert.ok(tokens.has('iphone'));
    assert.ok(tokens.has('128'));
    assert.ok(tokens.has('black'));
    // '15' and 'gb' have length <= 2
    assert.equal(tokens.has('15'), false);
    assert.equal(tokens.has('gb'), false);
  });

  it('calculates Jaccard similarity between identical or closely overlapping titles', () => {
    const sim = calculateJaccardSimilarity(
      'OnePlus 12 512GB Flowy Emerald',
      'OnePlus 12 Flowy Emerald 512GB',
    );
    assert.equal(sim, 1.0);
  });

  it('isExactProductMatch returns true for closely matching titles exceeding threshold', () => {
    const target = 'Apple iPhone 15 128GB Black';
    const scraped = 'Apple iPhone 15 128GB Black Smartphone';
    // target tokens: apple, iphone, 128gb, black (4)
    // scraped tokens: apple, iphone, 128gb, black, smartphone (5)
    // intersection: 4, union: 5 -> 4/5 = 0.8 >= 0.65
    assert.equal(isExactProductMatch(target, scraped, 0.65), true);
  });

  it('isExactProductMatch rejects completely divergent products', () => {
    const target = 'Apple iPhone 15 128GB Black';
    const scraped = 'Samsung Galaxy S24 Ultra 256GB Titanium Gray';
    assert.equal(isExactProductMatch(target, scraped, 0.65), false);
  });

  it('isExactProductMatch rejects phone cases and accessories with low token overlap', () => {
    const target = 'OnePlus 12 5G Smartphone Emerald Green';
    const scraped = 'Spigen Tough Armor Back Cover Case for OnePlus 12 Emerald';
    // Union contains spigen, tough, armor, back, cover, case, oneplus, emerald
    // Intersection contains only oneplus, emerald (2 tokens out of 8+ -> ~0.25)
    assert.equal(isExactProductMatch(target, scraped, 0.65), false);
  });

  it('handles empty or malformed title inputs safely', () => {
    assert.equal(isExactProductMatch('', 'Apple iPhone 15'), false);
    assert.equal(isExactProductMatch('Apple iPhone 15', ''), false);
    assert.equal(isExactProductMatch('', ''), false);
  });

  it('hasVariantMismatch flags conflicting model lines (e.g. Pro vs base)', () => {
    assert.equal(hasVariantMismatch('iPhone 15', 'iPhone 15 Pro'), true);
    assert.equal(hasVariantMismatch('Galaxy S24', 'Galaxy S24 Ultra'), true);
    assert.equal(hasVariantMismatch('Pixel 8', 'Pixel 8 Pro'), true);
    assert.equal(hasVariantMismatch('iPhone 15 Pro', 'iPhone 15 Pro Max'), true);
  });

  it('hasVariantMismatch flags conflicting storage variants', () => {
    assert.equal(hasVariantMismatch('iPhone 15 128GB', 'iPhone 15 256GB'), true);
    assert.equal(hasVariantMismatch('OnePlus 12 256GB', 'OnePlus 12 512GB'), true);
    assert.equal(hasVariantMismatch('OnePlus 12 512GB', 'OnePlus 12 512GB'), false);
  });

  it('hasVariantMismatch flags accessories mapped to phone titles', () => {
    assert.equal(hasVariantMismatch('iPhone 15', 'Silicone Case Cover for iPhone 15'), true);
  });
});

describe('Fix A: Retailer URL Sanitization (serpShoppingService.ts & urlSanitizer.ts)', () => {
  it('sanitizes Amazon URLs by strictly preserving ASIN and discarding affiliate/tracking bloat', () => {
    const rawAmazonUrl =
      'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY/ref=sr_1_1?crid=123&keywords=iphone+15&qid=1690000000&sprefix=iphone%2Caps%2C200&sr=8-1&tag=affiliate-21';
    const clean = sanitizeRetailerUrl(rawAmazonUrl, 'Amazon');
    assert.equal(clean, 'https://www.amazon.in/dp/B0CHX1W1XY');
  });

  it('sanitizes Amazon /gp/product/ ASIN URLs', () => {
    const rawAmazonGp =
      'https://www.amazon.in/gp/product/B0CHX1W1XY?tag=deal-hunter-21&ascsubtag=xyz123';
    const clean = sanitizeRetailerUrl(rawAmazonGp, 'Amazon');
    assert.equal(clean, 'https://www.amazon.in/dp/B0CHX1W1XY');
  });

  it('sanitizes Flipkart URLs by preserving base path and pid parameter while dropping tracking bloat', () => {
    const rawFlipkartUrl =
      'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LSTLEVGTAGPTB3VS24W&marketplace=FLIPKART&spotlightTagId=Bestseller&ppt=hp&ppn=homepage&ssid=12345&otracker=search';
    const clean = sanitizeRetailerUrl(rawFlipkartUrl, 'Flipkart');
    assert.equal(
      clean,
      'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W',
    );
  });

  it('preserves clean Flipkart ITM path when pid is not in query params', () => {
    const rawFlipkartItm =
      'https://www.flipkart.com/oneplus-12-flowy-emerald-512-gb/p/itm123456789?otracker=search&affid=aff123';
    const clean = sanitizeRetailerUrl(rawFlipkartItm, 'Flipkart');
    assert.equal(
      clean,
      'https://www.flipkart.com/oneplus-12-flowy-emerald-512-gb/p/itm123456789',
    );
  });

  it('sanitizes Croma URLs by keeping numeric SKU path and removing query bloat', () => {
    const rawCromaUrl =
      'https://www.croma.com/apple-iphone-15-128gb-black-/p/272600?utm_source=google&utm_medium=cpc&gclid=Cj0KCQ...';
    const clean = sanitizeRetailerUrl(rawCromaUrl, 'Croma');
    assert.equal(clean, 'https://www.croma.com/apple-iphone-15-128gb-black-/p/272600');
  });

  it('strips tracking query params from generic fallback URLs', () => {
    const rawGenericUrl =
      'https://store.brand.com/in/phones/flagship?utm_source=newsletter&utm_medium=email&utm_campaign=diwali&tag=tracker&color=black';
    const clean = sanitizeRetailerUrl(rawGenericUrl, 'Brand');
    assert.equal(clean, 'https://store.brand.com/in/phones/flagship?color=black');
  });

  it('handles invalid or empty URLs gracefully', () => {
    assert.equal(sanitizeRetailerUrl(''), '');
    assert.equal(sanitizeRetailerUrl('not-a-valid-url'), 'not-a-valid-url');
  });

  it('resolveOfferUrl unwraps Google redirect and produces clean retailer link with ASIN/PID', () => {
    const googleWrappedAmazon =
      'https://www.google.com/url?url=https%3A%2F%2Fwww.amazon.in%2FApple-iPhone-15-128-GB%2Fdp%2FB0CHX1W1XY%2Fref%3Dsr_1_1%3Ftag%3Dbadtag-21&rct=j&q=&esrc=s&sa=U';
    const resolved = resolveOfferUrl(googleWrappedAmazon, 'https://www.amazon.in/s?k=iphone+15', 'Amazon');
    assert.equal(resolved, 'https://www.amazon.in/dp/B0CHX1W1XY');
  });
});
