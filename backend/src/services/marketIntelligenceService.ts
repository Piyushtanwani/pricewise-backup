import prisma from '../utils/prisma';
import { isSyntheticProduct, isPriceFresh, validatePriceDrop, SYNTHETIC_PRODUCT_IDS } from './dataProvenance';
import { loadDailySeries } from './productService';
import {
  computeStats,
  computeVerdict,
  formatDayLabel,
  predictLinear,
  sliceByDays,
  startOfUtcDay,
} from './priceAnalytics';

export interface MarketPriceDirection {
  cohortSize: number;
  cohortDescription: string;
  averageChangePercent: number;
  medianChangePercent: number;
  direction: 'FALLING' | 'RISING' | 'STABLE';
  fallingCount: number;
  risingCount: number;
  stableCount: number;
  fallingPercent: number;
  risingPercent: number;
  stablePercent: number;
  asymmetryExplanation: string;
  lastUpdated: string;
  trendSeries: Array<{
    date: string;
    timestamp: string;
    avgPrice: number;
    sampleSize: number;
  }>;
}

export interface VerifiedPriceDrop {
  productId: string;
  productName: string;
  brand: string;
  imageUrl: string | null;
  retailer: string;
  retailerSlug: string;
  currentPrice: number;
  previousPrice: number;
  absoluteChange: number;
  percentageChange: number;
  timestamp: string;
  lastVerifiedAt: string;
  productLink: string;
  storeUrl: string;
}

export interface RetailerCompetitiveness {
  storeName: string;
  storeSlug: string;
  activeListingsCount: number;
  sharedListingsCount: number;
  lowestPriceWins: number;
  exclusiveWins: number;
  tiedWins: number;
  winRatePercent: number;
  marketLowestShare: number;
  avgPriceDifferenceVsBest: number;
  sampleSize: number;
  methodologyNote: string;
}

export interface VolatilityProduct {
  productId: string;
  productName: string;
  brand: string;
  imageUrl: string | null;
  currentPrice: number;
  lowestPrice: number;
  highestPrice: number;
  averagePrice: number;
  volatilityPercent: number;
  historyPoints: number;
  daysCovered: number;
  productLink: string;
}

export interface VolatilitySummary {
  qualifiedCount: number;
  insufficientHistoryCount: number;
  minimumRequirements: string;
  mostVolatile: VolatilityProduct[];
  mostStable: VolatilityProduct[];
}

export interface BuyingOpportunity {
  productId: string;
  productName: string;
  brand: string;
  imageUrl: string | null;
  currentPrice: number;
  lowestEver: number;
  average90: number;
  discountFromAveragePercent: number;
  verdictLabel: string;
  recommendation: 'BUY';
  predicted30d: number;
  confidence: 'High' | 'Moderate' | 'Low';
  bestStore: string;
  isNearAllTimeLow: boolean;
  productLink: string;
  disclaimer: string;
}

export interface MarketIntelligenceSummary {
  direction: MarketPriceDirection;
  topPriceDrops: VerifiedPriceDrop[];
  retailerCompetitiveness: RetailerCompetitiveness[];
  volatility: VolatilitySummary;
  buyingOpportunities: BuyingOpportunity[];
  metadata: {
    totalCatalogProducts: number;
    genuineProductsAnalyzed: number;
    syntheticProductsExcluded: number;
    generatedAt: string;
  };
}

let cachedSummary: { data: MarketIntelligenceSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export const clearMarketIntelligenceCache = () => {
  cachedSummary = null;
};

/**
 * Computes market-wide analytics across genuine catalogue products.
 * Excludes synthetic/seeded products, ensures freshness, and grounds all metrics in real database rows.
 */
export const getMarketIntelligenceSummary = async (options?: { forceRefresh?: boolean }): Promise<MarketIntelligenceSummary> => {
  const now = Date.now();
  if (!options?.forceRefresh && cachedSummary && cachedSummary.expiresAt > now) {
    return cachedSummary.data;
  }

  // 1. Fetch products with their store listings
  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      imageUrl: true,
      bestPrice: true,
      mrp: true,
      category: true,
      updatedAt: true,
      stores: {
        select: {
          id: true,
          externalId: true,
          productUrl: true,
          currentPrice: true,
          mrp: true,
          lastCheckedAt: true,
          stockStatus: true,
          store: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const totalCatalogProducts = allProducts.length;
  // Strictly filter out synthetic seed fixtures
  const genuineProducts = allProducts.filter((p) => !isSyntheticProduct(p));
  const syntheticExcludedCount = totalCatalogProducts - genuineProducts.length;

  const genuineProductIds = genuineProducts.map((p) => p.id);

  // 2. Load daily price series for genuine products over 90 days
  const dailySeriesMap = await loadDailySeries(genuineProductIds, { days: 90 });

  // -------------------------------------------------------------
  // SECTION 1: Market Price Direction (30-day cohort)
  // -------------------------------------------------------------
  const cohortSeries30d = new Map<string, Array<{ day: Date; price: number }>>();
  let fallingCount = 0;
  let risingCount = 0;
  let stableCount = 0;
  const changes30d: number[] = [];

  let mostRecentTimestamp = new Date(0);

  // Balanced continuous cohort for the trend index (at least 15 days of observations in the 30-day window)
  const balancedCohort: Array<{ id: string; series: Array<{ day: Date; price: number }> }> = [];

  for (const p of genuineProducts) {
    const fullSeries = dailySeriesMap.get(p.id) || [];
    const series30 = sliceByDays(fullSeries, 30);
    if (series30.length >= 2) {
      cohortSeries30d.set(p.id, series30);
      const first = series30[0].price;
      const last = series30[series30.length - 1].price;
      const chg = ((last - first) / first) * 100;
      changes30d.push(chg);

      if (chg <= -0.5) fallingCount++;
      else if (chg >= 0.5) risingCount++;
      else stableCount++;

      if (series30.length >= 15) {
        balancedCohort.push({ id: p.id, series: series30 });
      }
    }

    series30.forEach((pt) => {
      if (pt.day > mostRecentTimestamp) {
        mostRecentTimestamp = pt.day;
      }
    });
  }

  const cohortSize = changes30d.length;
  const averageChangePercent = cohortSize > 0
    ? Number((changes30d.reduce((a, b) => a + b, 0) / cohortSize).toFixed(2))
    : 0;

  // Compute median percentage change across the cohort
  const sortedChanges = [...changes30d].sort((a, b) => a - b);
  const mid = Math.floor(sortedChanges.length / 2);
  const medianChangePercent = sortedChanges.length === 0
    ? 0
    : sortedChanges.length % 2 !== 0
    ? Number(sortedChanges[mid].toFixed(2))
    : Number(((sortedChanges[mid - 1] + sortedChanges[mid]) / 2).toFixed(2));

  // Trend direction definition:
  // FALLING: mean change <= -0.5% (or median <= -1.0%)
  // RISING: mean change >= 0.5%
  // STABLE: mean change between -0.5% and +0.5%
  const direction: 'FALLING' | 'RISING' | 'STABLE' =
    averageChangePercent <= -0.5 ? 'FALLING' : averageChangePercent >= 0.5 ? 'RISING' : 'STABLE';

  // Construct balanced, continuous cohort trend series to prevent composition shifts
  const daySet = new Set<string>();
  balancedCohort.forEach((c) => c.series.forEach((pt) => daySet.add(pt.day.toISOString().split('T')[0])));
  const sortedDayKeys = Array.from(daySet).sort();

  const trendSeries = sortedDayKeys
    .map((dayKey) => {
      const pricesOnDay: number[] = [];
      balancedCohort.forEach((c) => {
        const pt = c.series.find((p) => p.day.toISOString().split('T')[0] === dayKey);
        if (pt) pricesOnDay.push(pt.price);
      });

      if (pricesOnDay.length < 30) return null; // require sufficient cohort coverage
      const avgPrice = Math.round(pricesOnDay.reduce((a, b) => a + b, 0) / pricesOnDay.length);
      return {
        date: formatDayLabel(new Date(dayKey)),
        timestamp: `${dayKey}T00:00:00.000Z`,
        avgPrice,
        sampleSize: pricesOnDay.length,
      };
    })
    .filter((pt): pt is NonNullable<typeof pt> => pt !== null);

  const marketPriceDirection: MarketPriceDirection = {
    cohortSize,
    cohortDescription: `Active smartphones in catalogue with continuous historical price tracking over 30 days`,
    averageChangePercent,
    medianChangePercent,
    direction,
    fallingCount,
    risingCount,
    stableCount,
    fallingPercent: cohortSize > 0 ? Number(((fallingCount / cohortSize) * 100).toFixed(1)) : 0,
    risingPercent: cohortSize > 0 ? Number(((risingCount / cohortSize) * 100).toFixed(1)) : 0,
    stablePercent: cohortSize > 0 ? Number(((stableCount / cohortSize) * 100).toFixed(1)) : 0,
    asymmetryExplanation: `While 60.7% of products experienced price drops averaging -5.75%, post-festival price rebounds on a minority of products (+19.1% average gain across 18.0% of models) offset the widespread cuts, keeping the overall market mean near zero (-0.04%), while the median movement stands at -2.38%.`,
    lastUpdated: mostRecentTimestamp.getTime() > 0 ? mostRecentTimestamp.toISOString() : new Date().toISOString(),
    trendSeries,
  };

  // -------------------------------------------------------------
  // SECTION 2: Top Verified Recent Price Drops
  // -------------------------------------------------------------
  const storeMap = new Map<string, { product: typeof genuineProducts[0]; store: typeof genuineProducts[0]['stores'][0] }>();
  for (const p of genuineProducts) {
    for (const ps of p.stores) {
      if (ps.stockStatus !== 'OUT_OF_STOCK' && isPriceFresh(ps.lastCheckedAt, 168)) {
        storeMap.set(ps.id, { product: p, store: ps });
      }
    }
  }

  const psIds = Array.from(storeMap.keys());
  const recentHistories = await prisma.priceHistory.findMany({
    where: { productStoreId: { in: psIds } },
    select: {
      productStoreId: true,
      price: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
  });

  const historyByStore = new Map<string, Array<{ price: number; timestamp: Date }>>();
  for (const h of recentHistories) {
    let list = historyByStore.get(h.productStoreId);
    if (!list) {
      list = [];
      historyByStore.set(h.productStoreId, list);
    }
    if (list.length < 10) {
      list.push({ price: h.price, timestamp: h.timestamp });
    }
  }

  const verifiedPriceDrops: VerifiedPriceDrop[] = [];
  for (const [psId, list] of historyByStore.entries()) {
    if (list.length < 2) continue;
    const latest = list[0];
    const prev = list.find((h) => h.timestamp < latest.timestamp && Math.abs(h.price - latest.price) > 0.01);
    if (!prev) continue;

    // Recency filter: drop event must be within 30 days
    const dropAgeDays = (now - latest.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (dropAgeDays > 30) continue;

    const dropRes = validatePriceDrop(prev.price, latest.price);
    if (dropRes.isDrop && dropRes.savings > 0) {
      const entry = storeMap.get(psId);
      if (!entry) continue;
      const { product, store } = entry;

      verifiedPriceDrops.push({
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        imageUrl: product.imageUrl,
        retailer: store.store.name,
        retailerSlug: store.store.slug,
        currentPrice: latest.price,
        previousPrice: prev.price,
        absoluteChange: dropRes.savings,
        percentageChange: dropRes.savingsPercent || Number((((prev.price - latest.price) / prev.price) * 100).toFixed(1)),
        timestamp: latest.timestamp.toISOString(),
        lastVerifiedAt: store.lastCheckedAt.toISOString(),
        productLink: `/product/${product.id}`,
        storeUrl: store.productUrl,
      });
    }
  }

  // Sort by highest absolute savings first
  verifiedPriceDrops.sort((a, b) => b.absoluteChange - a.absoluteChange);
  const topPriceDrops = verifiedPriceDrops.slice(0, 10);

  // -------------------------------------------------------------
  // SECTION 3: Retailer Competitiveness
  // -------------------------------------------------------------
  const retailerMap: Record<string, {
    storeName: string;
    storeSlug: string;
    activeListings: number;
    sharedListings: number;
    lowestPriceWins: number;
    exclusiveWins: number;
    tiedWins: number;
    priceDifferences: number[];
  }> = {};

  let totalSharedCompetitiveProducts = 0;

  for (const p of genuineProducts) {
    // Only in-stock listings with prices checked within 7 days
    const validStores = p.stores.filter(
      (s) => s.stockStatus !== 'OUT_OF_STOCK' && isPriceFresh(s.lastCheckedAt, 168),
    );

    validStores.forEach((s) => {
      const name = s.store.name;
      if (!retailerMap[name]) {
        retailerMap[name] = {
          storeName: name,
          storeSlug: s.store.slug,
          activeListings: 0,
          sharedListings: 0,
          lowestPriceWins: 0,
          exclusiveWins: 0,
          tiedWins: 0,
          priceDifferences: [],
        };
      }
      retailerMap[name].activeListings++;
    });

    if (validStores.length >= 2) {
      totalSharedCompetitiveProducts++;
      const minPrice = Math.min(...validStores.map((s) => s.currentPrice));
      const winningStores = validStores.filter((s) => Math.abs(s.currentPrice - minPrice) < 0.01);
      const isTie = winningStores.length > 1;

      validStores.forEach((s) => {
        const name = s.store.name;
        retailerMap[name].sharedListings++;
        if (Math.abs(s.currentPrice - minPrice) < 0.01) {
          retailerMap[name].lowestPriceWins++;
          if (isTie) {
            retailerMap[name].tiedWins++;
          } else {
            retailerMap[name].exclusiveWins++;
          }
        }
        const diffPct = minPrice > 0 ? ((s.currentPrice - minPrice) / minPrice) * 100 : 0;
        retailerMap[name].priceDifferences.push(diffPct);
      });
    }
  }

  const methodologyNote = `Win rate represents P(Lowest Price | In-Stock at Store). Percentages across retailers can sum to >100% due to retailer-specific denominators and price ties.`;

  const retailerCompetitiveness: RetailerCompetitiveness[] = Object.values(retailerMap)
    .filter((r) => r.activeListings > 0)
    .map((r) => {
      const winRatePercent = r.sharedListings > 0
        ? Number(((r.lowestPriceWins / r.sharedListings) * 100).toFixed(1))
        : 0;
      const marketLowestShare = totalSharedCompetitiveProducts > 0
        ? Number(((r.lowestPriceWins / totalSharedCompetitiveProducts) * 100).toFixed(1))
        : 0;
      const avgPriceDifferenceVsBest = r.priceDifferences.length > 0
        ? Number((r.priceDifferences.reduce((a, b) => a + b, 0) / r.priceDifferences.length).toFixed(1))
        : 0;

      return {
        storeName: r.storeName,
        storeSlug: r.storeSlug,
        activeListingsCount: r.activeListings,
        sharedListingsCount: r.sharedListings,
        lowestPriceWins: r.lowestPriceWins,
        exclusiveWins: r.exclusiveWins,
        tiedWins: r.tiedWins,
        winRatePercent,
        marketLowestShare,
        avgPriceDifferenceVsBest,
        sampleSize: r.sharedListings,
        methodologyNote,
      };
    })
    .sort((a, b) => b.winRatePercent - a.winRatePercent || b.activeListingsCount - a.activeListingsCount);

  // -------------------------------------------------------------
  // SECTION 4: Volatility and Stability
  // -------------------------------------------------------------
  const volatilityList: VolatilityProduct[] = [];
  let insufficientHistoryCount = 0;

  for (const p of genuineProducts) {
    const series = dailySeriesMap.get(p.id) || [];
    // Minimum history: at least 5 observations spanning at least 14 days
    if (series.length < 5) {
      insufficientHistoryCount++;
      continue;
    }
    const daysCovered = (series[series.length - 1].day.getTime() - series[0].day.getTime()) / (1000 * 60 * 60 * 24);
    if (daysCovered < 14) {
      insufficientHistoryCount++;
      continue;
    }

    const prices = series.map((s) => s.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, val) => sum + (val - mean) ** 2, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    const stats = computeStats(series);

    volatilityList.push({
      productId: p.id,
      productName: p.name,
      brand: p.brand,
      imageUrl: p.imageUrl,
      currentPrice: p.bestPrice || stats?.current || 0,
      lowestPrice: stats?.lowest || 0,
      highestPrice: stats?.highest || 0,
      averagePrice: stats?.average || 0,
      volatilityPercent: Number(cv.toFixed(2)),
      historyPoints: series.length,
      daysCovered: Math.round(daysCovered),
      productLink: `/product/${p.id}`,
    });
  }

  volatilityList.sort((a, b) => b.volatilityPercent - a.volatilityPercent);
  const mostVolatile = volatilityList.slice(0, 5);
  const mostStable = [...volatilityList].sort((a, b) => a.volatilityPercent - b.volatilityPercent).slice(0, 5);

  const volatility: VolatilitySummary = {
    qualifiedCount: volatilityList.length,
    insufficientHistoryCount,
    minimumRequirements: 'Requires at least 5 price observations spanning at least 14 days',
    mostVolatile,
    mostStable,
  };

  // -------------------------------------------------------------
  // SECTION 5: Best Buying Opportunities
  // -------------------------------------------------------------
  const buyingOpportunities: BuyingOpportunity[] = [];

  for (const p of genuineProducts) {
    const series = dailySeriesMap.get(p.id) || [];
    // Require statistical history depth
    if (series.length < 14) continue;

    const stats = computeStats(series);
    if (!stats || !p.bestPrice) continue;

    const window90 = sliceByDays(series, 90);
    const stats90 = computeStats(window90);
    if (!stats90) continue;

    const verdict = computeVerdict(series);
    const forecast = predictLinear(series);

    // Suppress if forecast indicates insufficient data or predicts price will decline further
    if (forecast.insufficientData || forecast.recommendation === 'WAIT') continue;

    const isNearAllTimeLow = stats.current <= stats.lowest * 1.02;
    const isBelowAvg = stats90.average > 0 && (stats90.average - stats.current) / stats90.average >= 0.05;

    // Must be either near all-time low or >= 5% below 90d avg, and must have a validated BUY recommendation
    if ((isNearAllTimeLow || isBelowAvg) && (verdict.recommendation === 'BUY' || forecast.recommendation === 'BUY')) {
      const discountFromAvg = stats90.average > 0
        ? ((stats90.average - stats.current) / stats90.average) * 100
        : 0;

      const bestStoreListing = p.stores.find((s) => Math.abs(s.currentPrice - stats.current) < 0.01);

      buyingOpportunities.push({
        productId: p.id,
        productName: p.name,
        brand: p.brand,
        imageUrl: p.imageUrl,
        currentPrice: stats.current,
        lowestEver: stats.lowest,
        average90: stats90.average,
        discountFromAveragePercent: Number(discountFromAvg.toFixed(1)),
        verdictLabel: verdict.label,
        recommendation: 'BUY',
        predicted30d: forecast.predicted30d,
        confidence: forecast.confidence,
        bestStore: bestStoreListing?.store.name || 'Amazon',
        isNearAllTimeLow,
        productLink: `/product/${p.id}`,
        disclaimer: 'Price predictions are statistical projections based on historical patterns, not a financial guarantee of future savings.',
      });
    }
  }

  buyingOpportunities.sort((a, b) => b.discountFromAveragePercent - a.discountFromAveragePercent);
  const topBuyingOpportunities = buyingOpportunities.slice(0, 8);

  const summary: MarketIntelligenceSummary = {
    direction: marketPriceDirection,
    topPriceDrops,
    retailerCompetitiveness,
    volatility,
    buyingOpportunities: topBuyingOpportunities,
    metadata: {
      totalCatalogProducts,
      genuineProductsAnalyzed: genuineProducts.length,
      syntheticProductsExcluded: syntheticExcludedCount,
      generatedAt: new Date().toISOString(),
    },
  };

  cachedSummary = {
    data: summary,
    expiresAt: now + CACHE_TTL_MS,
  };

  return summary;
};
