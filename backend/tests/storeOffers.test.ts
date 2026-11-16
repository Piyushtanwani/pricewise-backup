import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanOfferDescription,
  isGenuineOfferText,
  classifyOffer,
  normalizeOffersList,
  normalizeCanonicalStoreSlug,
  extractAmazonOffersFromHtml,
  extractFlipkartOffersFromHtml,
  extractCromaOffersFromHtml,
  extractGenericRetailerOffersFromHtml,
  getLiveOffersForProduct,
} from '../src/services/storeOfferService';
import { livePriceCache } from '../src/utils/cache';

test('normalizeCanonicalStoreSlug maps platform names & slugs consistently', () => {
  assert.equal(normalizeCanonicalStoreSlug('Amazon.in'), 'amazon');
  assert.equal(normalizeCanonicalStoreSlug('flipkart'), 'flipkart');
  assert.equal(normalizeCanonicalStoreSlug('Croma Retail'), 'croma');
  assert.equal(normalizeCanonicalStoreSlug('Vijay Sales'), 'vijay_sales');
  assert.equal(normalizeCanonicalStoreSlug('vijay-sales'), 'vijay_sales');
  assert.equal(normalizeCanonicalStoreSlug('Samsung Shop'), 'samsung_shop');
});

test('cleanOfferDescription & isGenuineOfferText filter junk and preserve real bank/card/festival offers', () => {
  const bankRaw = 'Bank Offer: Upto ₹4,000.00 discount on HDFC Bank Credit Cards | T&C';
  const cleaned = cleanOfferDescription(bankRaw);
  assert.equal(cleaned, 'Upto ₹4,000.00 discount on HDFC Bank Credit Cards');
  assert.equal(isGenuineOfferText(cleaned), true);

  assert.equal(isGenuineOfferText('Free delivery by tomorrow for Prime members'), false);
  assert.equal(isGenuineOfferText('1 Year Manufacturer Warranty on device'), false);
  assert.equal(isGenuineOfferText('Add to Cart and Buy Now'), false);
  assert.equal(isGenuineOfferText('Get 5% cashback on Amazon Pay ICICI Credit Card'), true);
});

test('classifyOffer assigns proper categories and bank labels', () => {
  const hdfc = classifyOffer('Flat ₹4,000 Instant Discount on HDFC Credit Card EMI');
  assert.equal(hdfc.type, 'BANK');
  assert.equal(hdfc.bank, 'HDFC Bank');
  assert.equal(hdfc.title, 'HDFC Bank Credit Card');

  const cashback = classifyOffer('5% Unlimited Cashback on Flipkart Axis Bank Credit Card');
  assert.equal(cashback.type, 'CASHBACK');
  assert.equal(cashback.bank, 'Flipkart Axis Bank');

  const festival = classifyOffer('Special Price: Extra ₹3,000 off during Big Billion Festival Sale');
  assert.equal(festival.type, 'FESTIVAL');

  const emi = classifyOffer('No Cost EMI starting from ₹3,200/month on Bajaj Finserv');
  assert.equal(emi.type, 'EMI');
});

test('extractAmazonOffersFromHtml parses bank, cashback, and EMI offers and guards against Captcha & mismatch', () => {
  const amazonHtml = `
    <html>
      <head><title>Apple iPhone 15 (128 GB) - Black</title></head>
      <body>
        <span id="productTitle">Apple iPhone 15 (128 GB) - Black</span>
        <div id="vsx-offers-holder">
          <div class="vsx-offers-desktop-lv__item">
            <span class="a-truncate-full">Bank Offer: Upto ₹4,000.00 discount on HDFC Bank Credit Cards. T&Cs apply</span>
          </div>
          <div class="vsx-offers-desktop-lv__item">
            <span class="a-truncate-full">5% Cashback on Amazon Pay ICICI Bank Credit Card for Prime members</span>
          </div>
          <div class="vsx-offers-desktop-lv__item">
            <span class="a-truncate-full">No Cost EMI available on select ICICI &amp; SBI Credit Cards starting ₹2,999/month</span>
          </div>
          <li>Free delivery tomorrow</li>
        </div>
        <div id="desktop_buybox"></div>
      </body>
    </html>
  `;

  const res = extractAmazonOffersFromHtml(amazonHtml, 'Apple iPhone 15', { storage: '128 GB' });
  assert.equal(res.status, 'ok');
  assert.equal(res.offers.length, 3);
  assert.equal(res.offers[0].bank, 'HDFC Bank');
  assert.ok(res.offers.some((o) => o.type === 'CASHBACK' && o.bank === 'Amazon Pay ICICI'));
  assert.ok(res.offers.some((o) => o.type === 'EMI'));

  // Variant mismatch (256 GB vs target 128 GB)
  const wrongVariant = extractAmazonOffersFromHtml(amazonHtml, 'Apple iPhone 15', { storage: '256 GB' });
  assert.equal(wrongVariant.status, 'mismatch');
  assert.equal(wrongVariant.offers.length, 0);

  // Captcha block check
  const captchaHtml = '<html><body><form action="/errors/validateCaptcha">Robot Check</form></body></html>';
  const blocked = extractAmazonOffersFromHtml(captchaHtml, 'Apple iPhone 15', { storage: '128 GB' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.offers.length, 0);
});

test('extractFlipkartOffersFromHtml extracts embedded SSR JSON and DOM Available offers safely', () => {
  const flipkartHtml = `
    <html>
      <head><title>Apple iPhone 15 (Black, 128 GB) Online at Best Price</title></head>
      <body>
        <h1>Apple iPhone 15 (Black, 128 GB)</h1>
        <script>
          window.__INITIAL_STATE__ = {
            "offerSummaries": [
              {"title":"Bank Offer","text":"5% Unlimited Cashback on Flipkart Axis Bank Credit Card"},
              {"title":"Bank Offer","text":"₹3,000 Off On SBI Credit Card Transactions"}
            ]
          };
        </script>
        <div>Available offers</div>
        <ul>
          <li>Special Price Get extra ₹2,000 off (price inclusive of festival discount) T&C</li>
          <li>1 Year Warranty for Phone and 6 Months Warranty for In-Box Accessories</li>
        </ul>
      </body>
    </html>
  `;

  const res = extractFlipkartOffersFromHtml(flipkartHtml, 'Apple iPhone 15', { storage: '128 GB' });
  assert.equal(res.status, 'ok');
  assert.equal(res.offers.length, 3);
  assert.ok(res.offers.some((o) => o.bank === 'Flipkart Axis Bank' && o.type === 'CASHBACK'));
  assert.ok(res.offers.some((o) => o.bank === 'SBI' && o.type === 'BANK'));
  assert.ok(res.offers.some((o) => o.type === 'FESTIVAL'));
});

test('extractCromaOffersFromHtml & extractGenericRetailerOffersFromHtml parse __NEXT_DATA__ and reject mismatch', () => {
  const cromaHtml = `
    <html>
      <head><title>Samsung Galaxy S24 5G (8GB RAM, 256GB)</title></head>
      <body>
        <h1>Samsung Galaxy S24 5G (8GB RAM, 256GB)</h1>
        <script id="__NEXT_DATA__" type="application/json">
          {
            "props": {
              "pageProps": {
                "bankOffers": [
                  { "offerDescription": "Flat ₹5,000 Instant Discount on HDFC Credit Card EMI" },
                  { "promoDescription": "No Cost EMI for up to 9 months on ICICI Bank Credit Cards" }
                ]
              }
            }
          }
        </script>
      </body>
    </html>
  `;

  const cromaRes = extractCromaOffersFromHtml(cromaHtml, 'Samsung Galaxy S24 5G', { ram: '8 GB', storage: '256 GB' });
  assert.equal(cromaRes.status, 'ok');
  assert.equal(cromaRes.offers.length, 2);
  assert.equal(cromaRes.offers[0].bank, 'HDFC Bank');

  const vijayHtml = `
    <html>
      <head><title>Samsung Galaxy S24 5G (256 GB)</title></head>
      <body>
        <h1>Samsung Galaxy S24 5G (256 GB)</h1>
        <div class="bank-offers">
          <li>Up to ₹4,500 Instant Discount on Axis Bank &amp; SBI Credit Cards</li>
        </div>
      </body>
    </html>
  `;
  const vijayRes = extractGenericRetailerOffersFromHtml(vijayHtml, 'Vijay Sales', 'Samsung Galaxy S24 5G', { storage: '256 GB' });
  assert.equal(vijayRes.status, 'ok');
  assert.equal(vijayRes.offers.length, 1);
  assert.equal(vijayRes.offers[0].bank, 'SBI');

  // Ensure different product model in title rejects offers
  const wrongModel = extractGenericRetailerOffersFromHtml(vijayHtml, 'Vijay Sales', 'Samsung Galaxy S24 Ultra', { storage: '256 GB' });
  assert.equal(wrongModel.status, 'mismatch');
  assert.equal(wrongModel.offers.length, 0);
});

test('getLiveOffersForProduct caches strictly per productId and deduplicates offers', async () => {
  const prodA = { id: 'test-prod-offers-1', name: 'OnePlus 12 (256 GB)', brand: 'OnePlus' };
  const prodB = { id: 'test-prod-offers-2', name: 'Apple iPhone 15 (128 GB)', brand: 'Apple' };

  await livePriceCache.del(`live_offers::${prodA.id}`);
  await livePriceCache.del(`live_offers::${prodB.id}`);

  // Seed cache for prodA only and verify prodA reads its own cached offers without leaking to prodB
  const seededPayload = {
    productId: prodA.id,
    productName: prodA.name,
    offersByStore: {
      amazon: {
        storeId: 's1',
        store: 'Amazon',
        storeSlug: 'amazon',
        productUrl: 'https://www.amazon.in/dp/B0CS5ZZ46P',
        offers: normalizeOffersList(['Flat ₹3,000 Instant Discount on ICICI Bank Credit Card']),
        source: 'live_scraped' as const,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800_000).toISOString(),
      },
    },
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };
  await livePriceCache.set(`live_offers::${prodA.id}`, seededPayload, 60);

  const resA = await getLiveOffersForProduct(prodA, [], { storage: '256 GB' });
  assert.equal(resA.fromCache, true);
  assert.equal(resA.productId, prodA.id);
  assert.equal(resA.offersByStore.amazon.offers.length, 1);
  assert.equal(resA.offersByStore.amazon.offers[0].bank, 'ICICI Bank');
  assert.equal(resA.offersByStore.amazon.source, 'cache');

  // Verify cache key for prodB does not collide with prodA
  const cachedB = await livePriceCache.get(`live_offers::${prodB.id}`);
  assert.equal(cachedB, null);

  await livePriceCache.del(`live_offers::${prodA.id}`);
});
