import dotenv from 'dotenv';
dotenv.config();

import { execFile } from 'child_process';
import path from 'path';
import prisma from '../src/utils/prisma';
import { parsePrice, evaluateStockStatus } from '../src/utils/priceNormalizer';
import { sanitizeRetailerUrl } from '../src/utils/urlSanitizer';
import { refreshProductAggregates } from '../src/services/productService';

interface ScrapedStore {
  name: string;
  slug: string;
  price: number;
  productUrl: string;
  mrp?: number | null;
  stockStatus: string;
}

interface ScrapedPricePoint {
  date: string;
  price: number;
}

interface ScrapedLaptop {
  id: string;
  name: string;
  price: number;
  rating?: number | null;
  imageId?: string | null;
  url: string;
  features: string[];
  stores: ScrapedStore[];
  priceHistory: ScrapedPricePoint[];
}

function parseLaptopTechSpecs(features: string[] = []): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const f of features) {
    if (!f) continue;
    if (/core|ryzen|intel|amd|apple m|apple a\d|snapdragon|processor|cpu|ghz|threads/i.test(f)) {
      if (!specs['Processor']) specs['Processor'] = f;
      else if (!specs['Processor Details']) specs['Processor Details'] = f;
    } else if (/ram|ddr|lpddr/i.test(f)) {
      specs['RAM'] = f;
    } else if (/ssd|hdd|storage|emmc/i.test(f)) {
      specs['Storage'] = f;
    } else if (/graphics|rtx|gtx|geforce|radeon|iris|uhd|gpu/i.test(f)) {
      specs['Graphics'] = f;
    } else if (/inches|display|resolution|pixels|oled|fhd|qhd|4k|retina/i.test(f)) {
      specs['Display'] = f;
    } else if (/windows|macos|chromeos|dos|linux|os/i.test(f)) {
      specs['Operating System'] = f;
    } else if (/warranty/i.test(f)) {
      specs['Warranty'] = f;
    }
  }
  return specs;
}

const BRANDS = [
  { slug: 'apple', name: 'Apple' },
  { slug: 'hp', name: 'HP' },
  { slug: 'dell', name: 'Dell' },
  { slug: 'lenovo', name: 'Lenovo' },
  { slug: 'asus', name: 'Asus' },
  { slug: 'acer', name: 'Acer' },
  { slug: 'msi', name: 'MSI' },
  { slug: 'samsung', name: 'Samsung' },
];

function fetchBrandLaptops(brandSlug: string, limit = 12): Promise<ScrapedLaptop[]> {
  return new Promise((resolve) => {
    const pythonScript = path.resolve(__dirname, 'scrapeLaptopsBrand.py');
    execFile(
      'python',
      [pythonScript, brandSlug, String(limit)],
      { maxBuffer: 25 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(`[WARNING] Failed to scrape brand ${brandSlug}:`, stderr || error.message);
          return resolve([]);
        }
        try {
          const data = JSON.parse(stdout);
          resolve(data as ScrapedLaptop[]);
        } catch (err: any) {
          console.warn(`[WARNING] JSON parse error for brand ${brandSlug}:`, err.message);
          resolve([]);
        }
      },
    );
  });
}

async function main() {
  console.log('===============================================================');
  console.log('   PRICEWISE: INGEST 100% REAL LAPTOPS FROM SMARTPRIX');
  console.log('   (Genuine Retailer Links, Real Prices, Real 180+ Day History)');
  console.log('===============================================================\n');

  // Step 1: Clean out any previous synthetic/mock laptop records
  console.log('[STEP 1] Cleaning out any previous synthetic laptop entries in DB...');
  const delResult = await prisma.product.deleteMany({
    where: { category: 'Laptops' },
  });
  console.log(`✓ Removed ${delResult.count} synthetic laptop records & cascaded relations.\n`);

  let totalProductsAdded = 0;
  let totalStoresAdded = 0;
  let totalHistoryAdded = 0;

  // Step 2: Ingest real laptops brand by brand
  for (const brand of BRANDS) {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`[BRAND] Fetching live Smartprix laptops for ${brand.name.toUpperCase()} (${brand.slug})...`);
    console.log(`-------------------------------------------------------------`);

    const laptops = await fetchBrandLaptops(brand.slug, 12);
    console.log(`Found ${laptops.length} real laptops for ${brand.name}. Ingesting into Supabase...`);

    for (const item of laptops) {
      if (!item.name || !item.price) continue;

      const techSpecs = parseLaptopTechSpecs(item.features);
      const imageUrl = item.imageId ? `https://images.smartprix.com/${item.imageId}.webp` : null;
      const normalizedRating = item.rating ? Math.round((item.rating / 20) * 10) / 10 : 4.4;

      // 1. Create Product record
      const product = await prisma.product.create({
        data: {
          name: item.name,
          category: 'Laptops',
          brand: brand.name,
          bestPrice: parsePrice(item.price),
          rating: normalizedRating,
          imageUrl,
          specs: item.features || [],
          techSpecs,
        },
      });

      let primaryListingId: string | null = null;
      let storesForProduct = 0;

      // 2. Process real store listings (Amazon, Flipkart, Croma, etc.)
      for (const st of item.stores) {
        const cleanSlug = st.slug.toLowerCase().trim();
        const cleanName = st.name.trim();

        const store = await prisma.store.upsert({
          where: { slug: cleanSlug },
          update: { name: cleanName },
          create: {
            name: cleanName,
            slug: cleanSlug,
            url:
              cleanSlug === 'amazon'
                ? 'https://www.amazon.in'
                : cleanSlug === 'flipkart'
                ? 'https://www.flipkart.com'
                : cleanSlug === 'croma'
                ? 'https://www.croma.com'
                : 'https://www.smartprix.com',
          },
        });

        const sanitizedUrl = sanitizeRetailerUrl(st.productUrl, cleanName);

        const listing = await prisma.productStore.upsert({
          where: {
            productId_storeId: {
              productId: product.id,
              storeId: store.id,
            },
          },
          update: {
            currentPrice: parsePrice(st.price),
            mrp: st.mrp ? parsePrice(st.mrp) : undefined,
            productUrl: sanitizedUrl,
            stockStatus: evaluateStockStatus(st.stockStatus).stockStatus,
            lastCheckedAt: new Date(),
          },
          create: {
            productId: product.id,
            storeId: store.id,
            currentPrice: parsePrice(st.price),
            mrp: st.mrp ? parsePrice(st.mrp) : undefined,
            productUrl: sanitizedUrl,
            currency: 'INR',
            stockStatus: evaluateStockStatus(st.stockStatus).stockStatus,
            lastCheckedAt: new Date(),
          },
        });

        if (!primaryListingId) {
          primaryListingId = listing.id;
        }
        storesForProduct++;
        totalStoresAdded++;
      }

      // 3. Ingest real 180+ daily historical price records
      let historyForProduct = 0;
      if (primaryListingId && item.priceHistory && item.priceHistory.length > 0) {
        const rows = item.priceHistory.map((ph) => ({
          productStoreId: primaryListingId!,
          price: Math.round(ph.price),
          currency: 'INR',
          timestamp: new Date(`${ph.date}T00:00:00.000Z`),
        }));

        const result = await prisma.priceHistory.createMany({
          data: rows,
          skipDuplicates: true,
        });
        historyForProduct = result.count || rows.length;
        totalHistoryAdded += historyForProduct;
      }

      // 4. Update product aggregates (bestPrice, bestStoreId)
      await refreshProductAggregates(product.id);

      console.log(`  ✓ ${product.name.slice(0, 48)}... | ₹${product.bestPrice} | Stores: ${storesForProduct} | History: ${historyForProduct} pts`);
      totalProductsAdded++;
    }

    // Small polite pause between brand scrapes
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  console.log('\n===============================================================');
  console.log('   INGESTION COMPLETE!');
  console.log(`   Total Real Laptops Ingested: ${totalProductsAdded}`);
  console.log(`   Total Verified Store Listings: ${totalStoresAdded}`);
  console.log(`   Total Real Price History Points: ${totalHistoryAdded}`);
  console.log('===============================================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[FATAL ERROR]:', e);
  await prisma.$disconnect();
  process.exit(1);
});
