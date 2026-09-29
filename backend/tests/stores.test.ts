import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmazonItem } from '../src/services/stores/amazon';
import { normalizeFlipkartProduct } from '../src/services/stores/flipkart';
import { toPrice } from '../src/services/stores/types';

test('toPrice parses numbers and formatted strings', () => {
  assert.equal(toPrice(29999), 29999);
  assert.equal(toPrice('₹1,29,999.00'), 129999);
  assert.equal(toPrice(0), null);
  assert.equal(toPrice('n/a'), null);
  assert.equal(toPrice(undefined), null);
});

test('normalizeAmazonItem maps a Creators API item', () => {
  const offer = normalizeAmazonItem({
    asin: 'B0CHX1W1XY',
    detailPageURL: 'https://www.amazon.in/dp/B0CHX1W1XY?tag=test-21',
    images: { primary: { medium: { url: 'https://m.media-amazon.com/m.jpg' }, large: { url: 'https://m.media-amazon.com/l.jpg' } } },
    itemInfo: {
      title: { displayValue: ' Sony WH-1000XM5 Wireless Headphones ' },
      byLineInfo: { brand: { displayValue: 'Sony' } },
      features: { displayValues: ['30 hours battery', 'Industry leading noise cancellation with Auto NC Optimizer'] },
      classifications: { productGroup: { displayValue: 'Electronics' } },
    },
    offersV2: {
      listings: [
        { isBuyBoxWinner: false, price: { money: { amount: 31000, currency: 'INR' } } },
        {
          isBuyBoxWinner: true,
          price: { money: { amount: 29990, currency: 'INR' }, savingBasis: { money: { amount: 34990 } } },
          availability: { type: 'IN_STOCK' },
        },
      ],
    },
  });
  assert.ok(offer);
  assert.equal(offer.externalId, 'B0CHX1W1XY');
  assert.equal(offer.title, 'Sony WH-1000XM5 Wireless Headphones');
  assert.equal(offer.brand, 'Sony');
  assert.equal(offer.price, 29990);
  assert.equal(offer.mrp, 34990);
  assert.equal(offer.inStock, true);
  assert.equal(offer.imageUrl, 'https://m.media-amazon.com/l.jpg');
  assert.equal(offer.category, 'Electronics');
});

test('normalizeAmazonItem handles out-of-stock and missing offers', () => {
  const oos = normalizeAmazonItem({
    asin: 'B000000001',
    itemInfo: { title: { displayValue: 'Thing' } },
    offersV2: { listings: [{ price: { money: { amount: 500 } }, availability: { type: 'OUT_OF_STOCK' } }] },
  });
  assert.equal(oos?.inStock, false);
  assert.match(oos!.productUrl, /\/dp\/B000000001$/);

  const noOffer = normalizeAmazonItem({ asin: 'B000000002', itemInfo: { title: { displayValue: 'Thing' } } });
  assert.equal(noOffer?.price, null);
  assert.equal(noOffer?.inStock, false);

  assert.equal(normalizeAmazonItem({ itemInfo: { title: { displayValue: 'No ASIN' } } }), null);
});

test('normalizeFlipkartProduct maps an Affiliate API v1 product', () => {
  const offer = normalizeFlipkartProduct({
    productBaseInfoV1: {
      productId: 'MOBH4DQFG8NKFRDY',
      title: 'Google Pixel 9 Pro (Obsidian, 128 GB)',
      imageUrls: { '200x200': 'https://img/200.jpg', '800x800': 'https://img/800.jpg', '400x400': 'https://img/400.jpg' },
      maximumRetailPrice: { amount: 109999, currency: 'INR' },
      flipkartSellingPrice: { amount: 94999, currency: 'INR' },
      flipkartSpecialPrice: { amount: 89999, currency: 'INR' },
      productUrl: 'https://dl.flipkart.com/dl/google-pixel-9-pro/p/itm?pid=MOBH4DQFG8NKFRDY&affid=test',
      productBrand: 'Google',
      inStock: true,
      categoryPath: 'Mobiles>Google Mobiles',
    },
    productShippingInfoV1: { shippingCharges: { amount: 0, currency: 'INR' } },
    categorySpecificInfoV1: { keySpecs: ['16 GB RAM', '128 GB ROM'] },
  });
  assert.ok(offer);
  assert.equal(offer.price, 89999);
  assert.equal(offer.mrp, 109999);
  assert.equal(offer.imageUrl, 'https://img/800.jpg');
  assert.equal(offer.category, 'Mobiles');
  assert.equal(offer.shippingCost, 0);
  assert.deepEqual(offer.specs, ['16 GB RAM', '128 GB ROM']);
});

test('normalizeFlipkartProduct falls back to selling price and rejects incomplete rows', () => {
  const offer = normalizeFlipkartProduct({
    productBaseInfoV1: {
      productId: 'X1',
      title: 'Item',
      productUrl: 'https://dl.flipkart.com/x',
      flipkartSellingPrice: { amount: 999 },
      flipkartSpecialPrice: { amount: 0 },
      inStock: false,
    },
  });
  assert.equal(offer?.price, 999);
  assert.equal(offer?.inStock, false);
  assert.equal(offer?.shippingCost, null);
  assert.equal(normalizeFlipkartProduct({ productBaseInfoV1: { productId: 'X2', title: 'No URL' } }), null);
});
