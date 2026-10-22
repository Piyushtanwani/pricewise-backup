import { execFile } from 'child_process';
import path from 'path';
import prisma from '../utils/prisma';
import { refreshProductAggregates } from './productService';
import { StockStatus } from '../generated/prisma';
import { parsePrice, evaluateStockStatus } from '../utils/priceNormalizer';

export interface EnrichedStore {
  name: string;
  slug: string;
  price: number;
  productUrl: string;
  mrp?: number | null;
  stockStatus: string;
}

export interface EnrichedPricePoint {
  date: string;
  price: number;
}

export interface EnrichedProductResult {
  pid?: string;
  stores: EnrichedStore[];
  priceHistory: EnrichedPricePoint[];
  error?: string;
}

/**
 * Calls scripts/productEnricher.py to fetch real multi-store prices and decoded daily price history.
 */
export const fetchProductStoresAndHistory = (productUrlOrSlug: string): Promise<EnrichedProductResult> => {
  return new Promise((resolve) => {
    const pythonScript = path.resolve(__dirname, '../../scripts/productEnricher.py');
    execFile(
      'python',
      [pythonScript, productUrlOrSlug],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(`[ENRICHER WARNING] Failed to enrich "${productUrlOrSlug}":`, stderr || error.message);
          return resolve({ stores: [], priceHistory: [], error: error.message });
        }
        try {
          const data = JSON.parse(stdout);
          resolve(data as EnrichedProductResult);
        } catch (parseErr: any) {
          console.warn(`[ENRICHER WARNING] Parse error for "${productUrlOrSlug}":`, parseErr.message);
          resolve({ stores: [], priceHistory: [], error: parseErr.message });
        }
      },
    );
  });
};

/**
 * Saves enriched stores and 180+ daily price history points for a product in Supabase.
 */
export const applyEnrichmentToProduct = async (
  productId: string,
  productUrlOrSlug: string,
): Promise<{ storesCount: number; historyCount: number }> => {
  const enriched = await fetchProductStoresAndHistory(productUrlOrSlug);
  if (!enriched || (enriched.stores.length === 0 && enriched.priceHistory.length === 0)) {
    return { storesCount: 0, historyCount: 0 };
  }

  let primaryProductStoreId: string | null = null;
  let storesSaved = 0;

  // 1. Process and upsert verified stores & listings
  for (const st of enriched.stores) {
    const cleanSlug = st.slug.toLowerCase().trim();
    const cleanName = st.name.trim();

    const store = await prisma.store.upsert({
      where: { slug: cleanSlug },
      update: { name: cleanName },
      create: {
        name: cleanName,
        slug: cleanSlug,
        url: cleanSlug === 'amazon' ? 'https://www.amazon.in' : cleanSlug === 'flipkart' ? 'https://www.flipkart.com' : cleanSlug === 'croma' ? 'https://www.croma.com' : 'https://www.smartprix.com',
      },
    });

    const listing = await prisma.productStore.upsert({
      where: {
        productId_storeId: {
          productId,
          storeId: store.id,
        },
      },
      update: {
        currentPrice: parsePrice(st.price),
        mrp: st.mrp ? parsePrice(st.mrp) : undefined,
        productUrl: st.productUrl,
        stockStatus: evaluateStockStatus(st.stockStatus).stockStatus,
        lastCheckedAt: new Date(),
      },
      create: {
        productId,
        storeId: store.id,
        currentPrice: parsePrice(st.price),
        mrp: st.mrp ? parsePrice(st.mrp) : undefined,
        productUrl: st.productUrl,
        currency: 'INR',
        stockStatus: evaluateStockStatus(st.stockStatus).stockStatus,
        lastCheckedAt: new Date(),
      },
    });

    if (!primaryProductStoreId) {
      primaryProductStoreId = listing.id;
    }
    storesSaved++;
  }

  // Fallback to first listing if stores were not populated
  if (!primaryProductStoreId) {
    const existingListing = await prisma.productStore.findFirst({ where: { productId } });
    if (existingListing) primaryProductStoreId = existingListing.id;
  }

  // 2. Ingest 180+ daily historical price records into PriceHistory
  let historySaved = 0;
  if (primaryProductStoreId && enriched.priceHistory.length > 0) {
    const rows = enriched.priceHistory.map((ph) => ({
      productStoreId: primaryProductStoreId!,
      price: Math.round(ph.price),
      currency: 'INR',
      timestamp: new Date(`${ph.date}T00:00:00.000Z`),
    }));

    const result = await prisma.priceHistory.createMany({
      data: rows,
      skipDuplicates: true,
    });
    historySaved = result.count || rows.length;
  }

  // 3. Recalculate best price, lowest store, and discount
  await refreshProductAggregates(productId);

  return { storesCount: storesSaved, historyCount: historySaved };
};
