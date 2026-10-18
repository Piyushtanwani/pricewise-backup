import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/utils/prisma';

async function analyze() {
  console.log('=== PRICING & HISTORICAL DATA DEEP AUDIT ===\n');

  // 1. Total products & distinct products with historical prices
  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      mrp: true,
      bestPrice: true,
      stores: {
        select: {
          id: true,
          storeId: true,
          store: { select: { name: true, slug: true } },
          currentPrice: true,
          _count: { select: { priceHistory: true } },
        },
      },
    },
  });

  const totalProducts = allProducts.length;
  const productsWithHistory = allProducts.filter((p) =>
    p.stores.some((s) => s._count.priceHistory > 0)
  );
  const productsWithoutHistory = allProducts.filter(
    (p) => !p.stores.some((s) => s._count.priceHistory > 0)
  );

  console.log(`Q1: How many distinct products have historical prices?`);
  console.log(`- Total products in database: ${totalProducts}`);
  console.log(`- Products WITH historical prices: ${productsWithHistory.length} (${((productsWithHistory.length / totalProducts) * 100).toFixed(1)}%)`);
  console.log(`- Products WITHOUT historical prices: ${productsWithoutHistory.length}\n`);

  // 2. Fetch full price history details to answer Q2 - Q6
  const allHistoryRows = await prisma.priceHistory.findMany({
    select: {
      id: true,
      productStoreId: true,
      price: true,
      timestamp: true,
      productStore: {
        select: {
          productId: true,
          store: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { timestamp: 'asc' },
  });

  console.log(`Total PriceHistory rows in DB: ${allHistoryRows.length}`);

  // Group by Product ID
  const historyByProduct = new Map<string, typeof allHistoryRows>();
  for (const row of allHistoryRows) {
    const pid = row.productStore.productId;
    if (!historyByProduct.has(pid)) {
      historyByProduct.set(pid, []);
    }
    historyByProduct.get(pid)!.push(row);
  }

  // Q2: How many unique dates does each product have?
  const uniqueDatesPerProduct: number[] = [];
  const totalRowsPerProduct: number[] = [];

  for (const [pid, rows] of historyByProduct.entries()) {
    const uniqueDates = new Set(
      rows.map((r) => r.timestamp.toISOString().split('T')[0])
    );
    uniqueDatesPerProduct.push(uniqueDates.size);
    totalRowsPerProduct.push(rows.length);
  }

  uniqueDatesPerProduct.sort((a, b) => a - b);
  const minUniqueDates = uniqueDatesPerProduct[0] || 0;
  const maxUniqueDates = uniqueDatesPerProduct[uniqueDatesPerProduct.length - 1] || 0;
  const avgUniqueDates = (
    uniqueDatesPerProduct.reduce((a, b) => a + b, 0) / (uniqueDatesPerProduct.length || 1)
  ).toFixed(1);

  // Group counts of unique dates
  const dateCountsMap = new Map<number, number>();
  for (const count of uniqueDatesPerProduct) {
    dateCountsMap.set(count, (dateCountsMap.get(count) || 0) + 1);
  }

  console.log(`\nQ2: How many unique dates does each product have?`);
  console.log(`- Min unique dates per product: ${minUniqueDates}`);
  console.log(`- Max unique dates per product: ${maxUniqueDates}`);
  console.log(`- Average unique dates per product: ${avgUniqueDates}`);
  console.log(`- Distribution of unique dates across products:`);
  for (const [count, numProds] of Array.from(dateCountsMap.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  * ${numProds} products have exactly ${count} unique dates`);
  }

  // Q3: Are observations daily, or are there large gaps?
  let totalIntervals = 0;
  let exact1DayIntervals = 0;
  let gaps2to7Days = 0;
  let gapsOver7Days = 0;
  let subDailyIntervals = 0;
  const allGapsInHours: number[] = [];

  for (const [pid, rows] of historyByProduct.entries()) {
    // Group rows by store first (to measure single timeline gaps)
    const storeMap = new Map<string, typeof rows>();
    for (const r of rows) {
      const s = r.productStore.store.slug;
      if (!storeMap.has(s)) storeMap.set(s, []);
      storeMap.get(s)!.push(r);
    }

    for (const [storeSlug, storeRows] of storeMap.entries()) {
      storeRows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      for (let i = 1; i < storeRows.length; i++) {
        const diffMs = storeRows[i].timestamp.getTime() - storeRows[i - 1].timestamp.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        totalIntervals++;
        allGapsInHours.push(diffHours);

        if (diffHours >= 23 && diffHours <= 25) {
          exact1DayIntervals++;
        } else if (diffHours < 23) {
          subDailyIntervals++;
        } else if (diffHours > 25 && diffHours <= 24 * 7) {
          gaps2to7Days++;
        } else {
          gapsOver7Days++;
        }
      }
    }
  }

  console.log(`\nQ3: Are observations daily, or are there large gaps?`);
  console.log(`- Total consecutive time intervals analyzed: ${totalIntervals}`);
  console.log(`- Exactly daily (~24 hrs): ${exact1DayIntervals} (${((exact1DayIntervals / (totalIntervals || 1)) * 100).toFixed(1)}%)`);
  console.log(`- Sub-daily (<23 hrs): ${subDailyIntervals} (${((subDailyIntervals / (totalIntervals || 1)) * 100).toFixed(1)}%)`);
  console.log(`- 2 to 7 days gaps: ${gaps2to7Days} (${((gaps2to7Days / (totalIntervals || 1)) * 100).toFixed(1)}%)`);
  console.log(`- Large gaps (> 7 days): ${gapsOver7Days} (${((gapsOver7Days / (totalIntervals || 1)) * 100).toFixed(1)}%)`);

  // Q4: Are prices from different retailers mixed together?
  // Check schema and data:
  // Is PriceHistory linked to ProductStore (one store per record)?
  // Do products have history for multiple stores?
  let prodsWithMultiStoreHistory = 0;
  let prodsWithSingleStoreHistory = 0;
  const storeDistribution = new Map<string, number>();

  for (const [pid, rows] of historyByProduct.entries()) {
    const stores = new Set(rows.map((r) => r.productStore.store.name));
    if (stores.size > 1) {
      prodsWithMultiStoreHistory++;
    } else {
      prodsWithSingleStoreHistory++;
    }
    for (const s of stores) {
      storeDistribution.set(s, (storeDistribution.get(s) || 0) + 1);
    }
  }

  console.log(`\nQ4: Are prices from different retailers mixed together?`);
  console.log(`- Schema separation: PriceHistory is strictly linked to ProductStore (one store per row).`);
  console.log(`- Products with history tracked across MULTIPLE separate stores: ${prodsWithMultiStoreHistory}`);
  console.log(`- Products with history tracked for only a SINGLE store: ${prodsWithSingleStoreHistory}`);
  console.log(`- Store presence in history records:`);
  for (const [st, count] of storeDistribution.entries()) {
    console.log(`  * ${st}: present in history of ${count} products`);
  }

  // Q5: Are there duplicate timestamps or incorrect price records?
  let duplicateTimestampCount = 0;
  let negativeOrZeroPrices = 0;
  let pricesAboveMrp = 0;
  let extremeVolatilityCount = 0; // > 300% jump in 1 day

  for (const [pid, rows] of historyByProduct.entries()) {
    const seenByStoreAndTs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const key = `${r.productStoreId}::${r.timestamp.toISOString()}`;
      if (seenByStoreAndTs.has(key)) {
        duplicateTimestampCount++;
      } else {
        seenByStoreAndTs.add(key);
      }

      if (r.price <= 0) negativeOrZeroPrices++;

      // Check against product MRP
      const prod = allProducts.find((p) => p.id === pid);
      if (prod?.mrp && r.price > prod.mrp * 1.05) {
        pricesAboveMrp++;
      }
    }
  }

  console.log(`\nQ5: Are there duplicate timestamps or incorrect price records?`);
  console.log(`- Duplicate (store + timestamp) pairs: ${duplicateTimestampCount}`);
  console.log(`- Zero or negative price records: ${negativeOrZeroPrices}`);
  console.log(`- Prices exceeding product MRP: ${pricesAboveMrp}`);

  // Q6: Are historical prices genuine observations rather than generated data?
  // Let's inspect timestamp patterns and price step patterns:
  let seededMulberryPatternCount = 0;
  let smartprixScrapedPatternCount = 0;

  // In seed.ts, timestamps are exactly `new Date(today.getTime() - daysAgo * DAY_MS)` with identical time of day.
  const timeOfDayMap = new Map<string, number>();
  for (const r of allHistoryRows.slice(0, 500)) {
    const timeStr = r.timestamp.toISOString().split('T')[1];
    timeOfDayMap.set(timeStr, (timeOfDayMap.get(timeStr) || 0) + 1);
  }

  console.log(`\nQ6: Are historical prices genuine observations rather than generated data?`);
  console.log(`- Sample time-of-day frequencies:`, Array.from(timeOfDayMap.entries()).slice(0, 5));
  console.log(`- In seed.ts, timestamps are created with: new Date(today.getTime() - daysAgo * DAY_MS) using mulberry32 deterministic noise.`);
}

analyze()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
