import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/utils/prisma';
import { applyEnrichmentToProduct } from '../src/services/productEnricherService';

async function main() {
  console.log('--- PriceWise: Supabase Multi-Store & Price History Enricher ---');

  const cliLimit = process.argv[2] ? parseInt(process.argv[2], 10) : 20;

  // Find products that have <= 2 price history entries or <= 1 store listing
  const candidates = await prisma.product.findMany({
    include: {
      stores: {
        include: {
          _count: {
            select: { priceHistory: true },
          },
        },
      },
    },
    take: cliLimit,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`[FOUND] ${candidates.length} products to check for enrichment (limit: ${cliLimit})...\n`);

  let enrichedCount = 0;
  let totalHistoryAdded = 0;
  let totalStoresAdded = 0;

  for (const product of candidates) {
    const totalHistory = product.stores.reduce((sum, s) => sum + s._count.priceHistory, 0);
    const storeCount = product.stores.length;

    // Determine target URL for Smartprix
    let targetUrl: string | null = null;
    for (const s of product.stores) {
      if (s.productUrl && s.productUrl.includes('/mobiles/')) {
        targetUrl = s.productUrl;
        break;
      }
    }

    if (!targetUrl) {
      console.log(`[SKIP] No Smartprix mobile URL found for: ${product.name}`);
      continue;
    }

    console.log(`[ENRICHING] ${product.name} (Current: ${storeCount} stores, ${totalHistory} history pts)...`);

    try {
      const res = await applyEnrichmentToProduct(product.id, targetUrl);
      if (res.storesCount > 0 || res.historyCount > 0) {
        console.log(`  ✓ Success: Added/Updated ${res.storesCount} stores and ${res.historyCount} price history points!`);
        enrichedCount++;
        totalHistoryAdded += res.historyCount;
        totalStoresAdded += res.storesCount;
      } else {
        console.log(`  ℹ No additional stores or history returned.`);
      }
    } catch (err: any) {
      console.warn(`  ⚠ Error enriching ${product.name}:`, err.message);
    }

    // Small courteous pause between product calls
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log('\n========================================');
  console.log(`[COMPLETED] Enriched ${enrichedCount} products!`);
  console.log(`Total new store listings processed: ${totalStoresAdded}`);
  console.log(`Total price history points added: ${totalHistoryAdded}`);
  console.log('========================================');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
