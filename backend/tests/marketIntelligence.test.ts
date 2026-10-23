import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMarketIntelligenceSummary,
  clearMarketIntelligenceCache,
} from '../src/services/marketIntelligenceService';
import { SYNTHETIC_PRODUCT_IDS, isPriceFresh, validatePriceDrop } from '../src/services/dataProvenance';

test('Market Intelligence: Aggregation and synthetic data exclusion', async () => {
  clearMarketIntelligenceCache();
  const summary = await getMarketIntelligenceSummary({ forceRefresh: true });

  assert.ok(summary, 'Summary should be returned');
  assert.ok(summary.metadata, 'Metadata should be present');
  assert.equal(typeof summary.metadata.totalCatalogProducts, 'number');
  assert.ok(summary.metadata.totalCatalogProducts >= 80, 'Catalog should have at least 80 products');
  assert.ok(summary.metadata.genuineProductsAnalyzed >= 70, 'Should analyze at least 70 genuine products');
  assert.ok(typeof summary.metadata.syntheticProductsExcluded === 'number', 'Should report synthetic products excluded count');

  // Verify none of the excluded synthetic product IDs appear anywhere in the results
  const allResultProductIds = new Set<string>([
    ...summary.topPriceDrops.map((d) => d.productId),
    ...summary.volatility.mostVolatile.map((v) => v.productId),
    ...summary.volatility.mostStable.map((v) => v.productId),
    ...summary.buyingOpportunities.map((b) => b.productId),
  ]);

  for (const syntheticId of SYNTHETIC_PRODUCT_IDS) {
    assert.equal(
      allResultProductIds.has(syntheticId),
      false,
      `Synthetic product ${syntheticId} must never appear in market analytics`,
    );
  }
});

test('Market Intelligence: Market price direction and cohort calculations', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { direction } = summary;

  assert.ok(direction, 'Market direction should be present');
  assert.ok(direction.cohortSize > 0, 'Cohort size should be greater than zero');
  assert.ok(
    ['FALLING', 'RISING', 'STABLE'].includes(direction.direction),
    `Direction must be one of FALLING, RISING, STABLE (got ${direction.direction})`,
  );

  assert.equal(
    direction.fallingCount + direction.risingCount + direction.stableCount,
    direction.cohortSize,
    'Falling, rising, and stable counts must sum to total cohort size',
  );

  const totalPct = direction.fallingPercent + direction.risingPercent + direction.stablePercent;
  assert.ok(
    Math.abs(totalPct - 100) <= 0.5,
    `Percentages should sum to approximately 100% (got ${totalPct})`,
  );

  assert.ok(Array.isArray(direction.trendSeries), 'Trend series must be an array');
  assert.ok(direction.trendSeries.length > 0, 'Trend series must have data points');

  for (const pt of direction.trendSeries) {
    assert.ok(pt.date, 'Point must have date string');
    assert.ok(pt.timestamp, 'Point must have ISO timestamp');
    assert.ok(pt.avgPrice > 0, 'Point average price must be positive');
    assert.ok(pt.sampleSize > 0, 'Point sample size must be positive');
  }
});

test('Market Intelligence: Verified price-drop detection and integrity', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { topPriceDrops } = summary;

  assert.ok(Array.isArray(topPriceDrops), 'topPriceDrops must be an array');
  assert.ok(topPriceDrops.length > 0, 'Should detect verified price drops from database history');

  for (const drop of topPriceDrops) {
    assert.ok(drop.productId, 'Drop must have productId');
    assert.ok(drop.productName, 'Drop must have productName');
    assert.ok(drop.retailer, 'Drop must have retailer name');
    assert.ok(drop.currentPrice > 0, 'Current price must be positive');
    assert.ok(drop.previousPrice > drop.currentPrice, 'Previous price must strictly exceed current price');
    assert.ok(drop.absoluteChange > 0, 'Absolute savings must be positive');
    assert.equal(
      drop.absoluteChange,
      drop.previousPrice - drop.currentPrice,
      'Absolute change must equal previousPrice - currentPrice',
    );
    assert.ok(drop.percentageChange > 0, 'Percentage change must be positive');
    assert.ok(drop.timestamp, 'Drop must include observation timestamp');
    assert.ok(drop.productLink.startsWith('/product/'), 'Product link must route to /product/:id');

    // Cross-validate with validatePriceDrop utility
    const validation = validatePriceDrop(drop.previousPrice, drop.currentPrice);
    assert.equal(validation.isDrop, true, 'Drop validation must confirm drop');
    assert.equal(validation.savings, drop.absoluteChange, 'Savings must match drop validation');
  }
});

test('Market Intelligence: Retailer competitiveness with fresh in-stock products', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { retailerCompetitiveness } = summary;

  assert.ok(Array.isArray(retailerCompetitiveness), 'retailerCompetitiveness must be an array');
  assert.ok(retailerCompetitiveness.length >= 2, 'Should evaluate multiple verified stores');

  for (const store of retailerCompetitiveness) {
    assert.ok(store.storeName, 'Store must have name');
    assert.ok(store.activeListingsCount > 0, 'Store must have active in-stock listings');
    assert.ok(store.winRatePercent >= 0 && store.winRatePercent <= 100, 'Win rate must be between 0% and 100%');
    assert.ok(store.lowestPriceWins <= store.sharedListingsCount, 'Wins cannot exceed shared listings');
    assert.ok(store.avgPriceDifferenceVsBest >= 0, 'Difference vs best price cannot be negative');
  }

  // Verify prominent verified retailers are present
  const storeNames = retailerCompetitiveness.map((s) => s.storeName.toLowerCase());
  assert.ok(storeNames.some((n) => n.includes('amazon')), 'Amazon should be evaluated');
  assert.ok(storeNames.some((n) => n.includes('flipkart') || n.includes('croma')), 'Flipkart or Croma should be evaluated');
});

test('Market Intelligence: Volatility, stability, and minimum history enforcement', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { volatility } = summary;

  assert.ok(volatility.qualifiedCount > 0, 'Should have products qualifying for volatility analysis');
  assert.ok(volatility.insufficientHistoryCount >= 0, 'Should track products with insufficient history');
  assert.ok(volatility.minimumRequirements.includes('5'), 'Should document minimum requirements');

  assert.ok(volatility.mostVolatile.length > 0, 'Should list most volatile products');
  assert.ok(volatility.mostStable.length > 0, 'Should list most stable products');

  // Verify all qualified products satisfy minimum requirements
  for (const item of [...volatility.mostVolatile, ...volatility.mostStable]) {
    assert.ok(item.historyPoints >= 5, `Product ${item.productName} must have at least 5 history points`);
    assert.ok(item.daysCovered >= 14, `Product ${item.productName} must span at least 14 days`);
    assert.ok(item.volatilityPercent >= 0, 'Volatility CV must be non-negative');
    assert.ok(item.currentPrice > 0, 'Current price must be positive');
    assert.ok(item.productLink.startsWith('/product/'), 'Product link must point to /product/:id');
  }

  // Verify ordering: mostVolatile should have higher or equal volatility than mostStable
  const topVolatileCv = volatility.mostVolatile[0].volatilityPercent;
  const topStableCv = volatility.mostStable[0].volatilityPercent;
  assert.ok(
    topVolatileCv >= topStableCv,
    `Top volatile CV (${topVolatileCv}%) should be >= top stable CV (${topStableCv}%)`,
  );
});

test('Market Intelligence: Best buying opportunities logic', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { buyingOpportunities } = summary;

  assert.ok(Array.isArray(buyingOpportunities), 'buyingOpportunities must be an array');
  assert.ok(buyingOpportunities.length > 0, 'Should identify genuine buying opportunities');

  for (const opp of buyingOpportunities) {
    assert.equal(opp.recommendation, 'BUY', 'Recommendation must be BUY');
    assert.ok(opp.currentPrice > 0, 'Current price must be positive');
    assert.ok(opp.average90 > 0, '90-day average price must be positive');
    assert.ok(opp.predicted30d > 0, '30-day predicted price must be positive');
    assert.ok(opp.productLink.startsWith('/product/'), 'Must link to /product/:id');

    // Either near historical low (within 2%) or >= 5% below 90d average
    const isNearLow = opp.currentPrice <= opp.lowestEver * 1.02;
    const isBelowAvg = opp.discountFromAveragePercent >= 5;
    assert.ok(
      isNearLow || isBelowAvg,
      `Opportunity ${opp.productName} must be near low or below 90d average`,
    );
    assert.ok(opp.disclaimer.includes('statistical projections'), 'Must contain statistical projection disclaimer');
  }
});

test('Market Intelligence: Retailer competitiveness ties, exclusive wins, and sample sizes', async () => {
  const summary = await getMarketIntelligenceSummary();
  const { retailerCompetitiveness } = summary;

  for (const r of retailerCompetitiveness) {
    assert.equal(
      r.exclusiveWins + r.tiedWins,
      r.lowestPriceWins,
      `${r.storeName}: exclusiveWins (${r.exclusiveWins}) + tiedWins (${r.tiedWins}) must equal lowestPriceWins (${r.lowestPriceWins})`,
    );
    assert.equal(
      r.sampleSize,
      r.sharedListingsCount,
      `${r.storeName}: sampleSize must match sharedListingsCount`,
    );
    assert.ok(r.methodologyNote.length > 0, 'Must include clear methodology note');
  }

  // Cross-retailer check: Verify that ties exist and explain why win rates sum to >100%
  const totalTiedWins = retailerCompetitiveness.reduce((sum, r) => sum + r.tiedWins, 0);
  assert.ok(totalTiedWins > 0, 'Catalog should detect price ties across retailers');
  const sumOfWinRates = retailerCompetitiveness.reduce((sum, r) => sum + r.winRatePercent, 0);
  assert.ok(sumOfWinRates > 100, `Sum of win rates (${sumOfWinRates}%) exceeds 100% due to retailer-specific denominators and ties`);
});

test('Market Intelligence: Price drop validation rejects bad scrapes, identical prices, and invalid numbers', () => {
  // Test identical prices (no drop)
  const noDropSamePrice = validatePriceDrop(50000, 50000);
  assert.equal(noDropSamePrice.isDrop, false);
  assert.equal(noDropSamePrice.savings, 0);

  // Test price increase (not a drop)
  const priceIncrease = validatePriceDrop(40000, 45000);
  assert.equal(priceIncrease.isDrop, false);
  assert.equal(priceIncrease.savings, 0);

  // Test bad scrapes: negative or zero prices
  assert.equal(validatePriceDrop(50000, 0).isDrop, false);
  assert.equal(validatePriceDrop(50000, -1000).isDrop, false);
  assert.equal(validatePriceDrop(-50000, 40000).isDrop, false);
  assert.equal(validatePriceDrop(NaN, 40000).isDrop, false);
  assert.equal(validatePriceDrop(50000, NaN).isDrop, false);
  assert.equal(validatePriceDrop(undefined, 40000).isDrop, false);
  assert.equal(validatePriceDrop(null, 40000).isDrop, false);

  // Test valid price drop
  const validDrop = validatePriceDrop(119900, 99900);
  assert.equal(validDrop.isDrop, true);
  assert.equal(validDrop.savings, 20000);
  assert.equal(validDrop.savingsPercent, 17);
});

test('Market Intelligence: Cache forceRefresh parameter works correctly', async () => {
  const first = await getMarketIntelligenceSummary({ forceRefresh: false });
  const second = await getMarketIntelligenceSummary({ forceRefresh: false });
  assert.equal(first.metadata.generatedAt, second.metadata.generatedAt, 'Cached calls should return identical generatedAt timestamp');

  // Force refresh
  const refreshed = await getMarketIntelligenceSummary({ forceRefresh: true });
  assert.ok(refreshed, 'Refreshed summary should be returned');
});

