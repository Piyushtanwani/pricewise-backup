import { execFile } from 'child_process';
import path from 'path';
import prisma from '../utils/prisma';
import { refreshProductAggregates } from './productService';
import { StockStatus } from '../generated/prisma';

export interface ScrapedStore {
  name: string;
  slug: string;
  price: number;
  productUrl: string;
  mrp?: number | null;
  stockStatus: string;
}

export interface ScrapedPriceHistory {
  date: string;
  price: number;
}

export interface ScrapedProduct {
  externalId: string;
  name: string;
  brand: string;
  category: string;
  description?: string;
  price: number;
  rating: number;
  reviewCount: number;
  imageUrl?: string | null;
  specs: string[];
  techSpecs: Record<string, string>;
  stores: ScrapedStore[];
  priceHistory: ScrapedPriceHistory[];
}

/**
 * Executes the python scraper in data-pipeline/scraper.py and returns parsed products.
 */
export const runPythonScraper = (limit: number = 5): Promise<ScrapedProduct[]> => {
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, '../../../data-pipeline/scraper.py');
    execFile(
      'python',
      [pythonScript, String(limit)],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`Scraper execution failed: ${error.message} - ${stderr}`));
        }
        try {
          const data = JSON.parse(stdout);
          resolve(data as ScrapedProduct[]);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse scraper output: ${parseErr.message}\nRaw: ${stdout.slice(0, 500)}`));
        }
      },
    );
  });
};

/**
 * Ingests an array of scraped products into PostgreSQL via Prisma.
 */
export const ingestScrapedProducts = async (products: ScrapedProduct[]) => {
  const results = [];

  for (const item of products) {
    // 1. Upsert or find Product
    let product = await prisma.product.findFirst({
      where: {
        OR: [
          { name: item.name },
          { gtin: item.externalId },
        ],
      },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: item.name,
          brand: item.brand,
          category: item.category,
          description: item.description,
          imageUrl: item.imageUrl,
          gtin: item.externalId,
          rating: item.rating || 4.2,
          reviewCount: item.reviewCount || 10,
          specs: item.specs || [],
          techSpecs: item.techSpecs || {},
          bestPrice: item.price,
        },
      });
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          description: item.description || product.description,
          imageUrl: item.imageUrl || product.imageUrl,
          specs: item.specs?.length ? item.specs : product.specs,
          techSpecs: item.techSpecs || (product.techSpecs ? (product.techSpecs as any) : {}),
        },
      });
    }

    // 2. Process Stores & Listings
    let primaryProductStoreId: string | null = null;

    for (const st of item.stores) {
      const store = await prisma.store.upsert({
        where: { slug: st.slug },
        update: { name: st.name },
        create: {
          name: st.name,
          slug: st.slug,
          url: `https://${st.slug}.com`,
        },
      });

      const listing = await prisma.productStore.upsert({
        where: {
          productId_storeId: {
            productId: product.id,
            storeId: store.id,
          },
        },
        update: {
          currentPrice: st.price,
          productUrl: st.productUrl,
          mrp: st.mrp || undefined,
          lastCheckedAt: new Date(),
        },
        create: {
          productId: product.id,
          storeId: store.id,
          currentPrice: st.price,
          productUrl: st.productUrl,
          mrp: st.mrp || undefined,
          stockStatus: StockStatus.IN_STOCK,
        },
      });

      if (!primaryProductStoreId) {
        primaryProductStoreId = listing.id;
      }
    }

    // 3. Process Price History
    let historyPointsInserted = 0;
    if (primaryProductStoreId && item.priceHistory && item.priceHistory.length > 0) {
      // Clear or append history points
      const historyData = item.priceHistory.map((ph) => ({
        productStoreId: primaryProductStoreId!,
        price: ph.price,
        currency: 'INR',
        timestamp: new Date(`${ph.date}T00:00:00.000Z`),
      }));

      // Insert in chunks or createMany
      await prisma.priceHistory.createMany({
        data: historyData,
        skipDuplicates: true,
      });
      historyPointsInserted = historyData.length;
    }

    // 4. Update Product Aggregates (bestPrice, bestStore, discount)
    await refreshProductAggregates(product.id);

    results.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      bestPrice: item.price,
      storesCount: item.stores.length,
      historyPointsCount: historyPointsInserted,
    });
  }

  return results;
};
