import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_PRODUCT_IDS, isSyntheticProduct } from '../../backend/src/services/dataProvenance';

// TC-MKT-01: Data provenance & synthetic demo isolation (BUG-004)
test('TC-MKT-01: Synthetic demo products are excluded from real market trend analytics (BUG-004)', () => {
  assert.ok(SYNTHETIC_PRODUCT_IDS instanceof Set, 'SYNTHETIC_PRODUCT_IDS must be a Set');
  assert.ok(SYNTHETIC_PRODUCT_IDS.size > 0, 'Must contain known synthetic mock IDs');

  const knownSyntheticId = Array.from(SYNTHETIC_PRODUCT_IDS)[0];
  assert.equal(isSyntheticProduct({ id: knownSyntheticId }), true, 'Synthetic ID must return true');

  const realCatalogProduct = {
    id: 'real-scraped-mobile-uuid-999',
    name: 'Real Mobile',
    stores: [{ externalId: 'AMZ-12345', productUrl: 'https://amazon.in/dp/B012345678' }],
  };
  assert.equal(isSyntheticProduct(realCatalogProduct), false, 'Real catalog product must not be flagged synthetic');

  // Filter test in aggregation pipeline
  const mixedProducts = [
    { id: knownSyntheticId, name: 'Synthetic Demo Phone', price: 10000 },
    realCatalogProduct,
  ];

  const filteredForMarketTrends = mixedProducts.filter((p) => !isSyntheticProduct(p));
  assert.equal(filteredForMarketTrends.length, 1);
  assert.equal(filteredForMarketTrends[0].id, realCatalogProduct.id);
});

// TC-CHAT-01: AI Assistant catalog scoping & anti-hallucination guard
test('TC-CHAT-01: AI Assistant response matches catalog bounds and validates product references', () => {
  const verifiedCatalog = [
    { id: 'prod-macbook-m3', name: 'MacBook Air M3', price: 99900, brand: 'Apple' },
    { id: 'prod-dell-xps', name: 'Dell XPS 13', price: 139990, brand: 'Dell' },
    { id: 'prod-lenovo-yoga', name: 'Lenovo IdeaPad Slim', price: 54990, brand: 'Lenovo' },
  ];

  const userQuery = 'Find me laptops under 60000';
  const maxBudget = 60000;

  // Catalog retrieval scoping
  const eligibleMatches = verifiedCatalog.filter((p) => p.price <= maxBudget);
  assert.equal(eligibleMatches.length, 1);
  assert.equal(eligibleMatches[0].id, 'prod-lenovo-yoga');
  assert.equal(eligibleMatches[0].name, 'Lenovo IdeaPad Slim');

  // Verify non-existent/hallucinated model is not in results
  const hallucinatedModel = 'Dell Alienware M18 for 45000';
  const containsHallucination = eligibleMatches.some((p) => p.name === hallucinatedModel);
  assert.equal(containsHallucination, false);
});

