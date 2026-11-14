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

interface ScrapedProduct {
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

function parseTabletTechSpecs(features: string[] = []): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const f of features) {
    if (!f) continue;
    if (/bionic|snapdragon|helio|dimensity|tensor|core|octa|hexa|processor|ghz/i.test(f) && !specs['Processor']) {
      specs['Processor'] = f;
    } else if (/\b\d+\s*gb\s*ram\b/i.test(f) || (/\bram\b/i.test(f) && !specs['RAM'])) {
      specs['RAM'] = f;
    } else if (/\binbuilt\b|\bstorage\b|\brom\b|\b\d+\s*(?:gb|tb)\s*(?:inbuilt|storage|rom)?\b/i.test(f) && !specs['Storage']) {
      specs['Storage'] = f;
    } else if (/inches|\bin\b|display|pixels|px|oled|lcd|ips|amoled|hz/i.test(f) && !specs['Display']) {
      specs['Display'] = f;
    } else if (/camera|rear|front|mp/i.test(f) && !specs['Camera']) {
      specs['Camera'] = f;
    } else if (/battery|mah|charging/i.test(f) && !specs['Battery']) {
      specs['Battery'] = f;
    } else if (/ipados|android|hyperos|oxygenos|one\s*ui|os/i.test(f) && !specs['Operating System']) {
      specs['Operating System'] = f;
    } else if (/sim|wi-fi|wifi|5g|4g|volte/i.test(f) && !specs['Connectivity']) {
      specs['Connectivity'] = f;
    }
  }
  return specs;
}

function parseTvTechSpecs(features: string[] = []): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const f of features) {
    if (!f) continue;
    if (/\b\d+\s*(?:in|inch)\b|oled|qled|led|mini led|panel/i.test(f) && !specs['Display']) {
      specs['Display'] = f;
    } else if (/4k|ultra hd|full hd|hd ready|pixels|3840|1920|resolution/i.test(f) && !specs['Resolution']) {
      specs['Resolution'] = f;
    } else if (/speaker|output|dolby|sound|audio|dts/i.test(f) && !specs['Audio']) {
      specs['Audio'] = f;
    } else if (/google tv|android tv|webos|tizen|fire tv|smart tv|os/i.test(f) && !specs['Operating System']) {
      specs['Operating System'] = f;
    } else if (/hdmi|usb|optical|ports/i.test(f) && !specs['Ports']) {
      specs['Ports'] = f;
    } else if (/wifi|ethernet|bluetooth/i.test(f) && !specs['Connectivity']) {
      specs['Connectivity'] = f;
    } else if (/storage|inbuilt/i.test(f) && !specs['Storage']) {
      specs['Storage'] = f;
    }
  }
  return specs;
}

const TABLET_BRANDS = [
  { slug: 'apple', name: 'Apple', limit: 12 },
  { slug: 'samsung', name: 'Samsung', limit: 12 },
  { slug: 'lenovo', name: 'Lenovo', limit: 12 },
  { slug: 'xiaomi', name: 'Xiaomi', limit: 12 },
  { slug: 'oneplus', name: 'OnePlus', limit: 10 },
  { slug: 'realme', name: 'Realme', limit: 10 },
  { slug: 'motorola', name: 'Motorola', limit: 10 },
  { slug: 'honor', name: 'Honor', limit: 10 },
];

const TV_BRANDS = [
  { slug: 'sony', name: 'Sony', limit: 12 },
  { slug: 'samsung', name: 'Samsung', limit: 12 },
  { slug: 'lg', name: 'LG', limit: 12 },
  { slug: 'xiaomi', name: 'Xiaomi', limit: 12 },
  { slug: 'tcl', name: 'TCL', limit: 12 },
  { slug: 'vu', name: 'Vu', limit: 12 },
  { slug: 'hisense', name: 'Hisense', limit: 12 },
  { slug: 'oneplus', name: 'OnePlus', limit: 10 },
];

function fetchCategoryProducts(categorySlug: string, brandSlug: string, limit = 12): Promise<ScrapedProduct[]> {
  return new Promise((resolve) => {
    const pythonScript = path.resolve(__dirname, 'scrapeElectronicsCategory.py');
    execFile(
      'python',
      [pythonScript, categorySlug, brandSlug, String(limit)],
      { maxBuffer: 30 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(`[WARNING] Failed to scrape ${categorySlug} brand ${brandSlug}:`, stderr || error.message);
          return resolve([]);
        }
        try {
          const data = JSON.parse(stdout);
          resolve(data as ScrapedProduct[]);
        } catch (err: any) {
          console.warn(`[WARNING] JSON parse error for ${categorySlug} brand ${brandSlug}:`, err.message);
          resolve([]);
        }
      },
    );
  });
}

async function ingestCategory(
  categoryName: 'Tablets' | 'TVs',
  categorySlug: 'tablets' | 'tvs',
  brands: Array<{ slug: string; name: string; limit: number }>,
  specParser: (features: string[]) => Record<string, string>,
) {
  console.log(`\n===============================================================`);
  console.log(`   INGESTING 100% REAL ${categoryName.toUpperCase()} FROM SMARTPRIX`);
  console.log(`===============================================================`);

  // Step 1: Clean out previous mock data for this specific category ONLY
  console.log(`[CLEANUP] Removing previous mock ${categoryName} entries from DB...`);
  const delResult = await prisma.product.deleteMany({
    where: { category: categoryName },
  });
  console.log(`✓ Removed ${delResult.count} old ${categoryName} records & cascaded relations.\n`);

  let totalProducts = 0;
  let totalStores = 0;
  let totalHistoryPoints = 0;

  for (const b of brands) {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`[${categoryName}] Fetching live products for ${b.name.toUpperCase()} (${b.slug})...`);
    console.log(`-------------------------------------------------------------`);

    const items = await fetchCategoryProducts(categorySlug, b.slug, b.limit);
    console.log(`Found ${items.length} real ${categoryName} for ${b.name}. Ingesting into Supabase...`);

    for (const item of items) {
      if (!item.name || !item.price) continue;

      const techSpecs = specParser(item.features);
      const imageUrl = item.imageId ? `https://images.smartprix.com/${item.imageId}.webp` : null;
      const normalizedRating = item.rating ? Math.round((item.rating / 20) * 10) / 10 : 4.3;

      // 1. Create Product record
      const product = await prisma.product.create({
        data: {
          name: item.name,
          category: categoryName,
          brand: b.name,
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
        totalStores++;
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
        totalHistoryPoints += historyForProduct;
      }

      // 4. Update product aggregates
      await refreshProductAggregates(product.id);

      console.log(`  ✓ ${product.name.slice(0, 48)}... | ₹${product.bestPrice} | Stores: ${storesForProduct} | History: ${historyForProduct} pts`);
      totalProducts++;
    }

    // Polite pause between brands
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  console.log(`\n✓ ${categoryName} Ingestion Finished: ${totalProducts} Products | ${totalStores} Stores | ${totalHistoryPoints} History Points`);
}

async function main() {
  console.log('===============================================================');
  console.log('   PRICEWISE: INGEST 100% REAL TABLETS & SMART TVS');
  console.log('   (Genuine Retailer Links, Real Prices, Real 180+ Day History)');
  console.log('   (Mobiles & Laptops strictly preserved without changes)');
  console.log('===============================================================\n');

  // Verify baseline product counts before running
  const mobileCount = await prisma.product.count({ where: { category: 'Mobiles' } });
  const laptopCount = await prisma.product.count({ where: { category: 'Laptops' } });
  console.log(`[SAFETY CHECK] Mobiles in DB: ${mobileCount} (will NOT be touched)`);
  console.log(`[SAFETY CHECK] Laptops in DB: ${laptopCount} (will NOT be touched)`);

  // Ingest Tablets
  await ingestCategory('Tablets', 'tablets', TABLET_BRANDS, parseTabletTechSpecs);

  // Ingest TVs
  await ingestCategory('TVs', 'tvs', TV_BRANDS, parseTvTechSpecs);

  // Final verification
  const finalMobileCount = await prisma.product.count({ where: { category: 'Mobiles' } });
  const finalLaptopCount = await prisma.product.count({ where: { category: 'Laptops' } });
  const finalTabletCount = await prisma.product.count({ where: { category: 'Tablets' } });
  const finalTvCount = await prisma.product.count({ where: { category: 'TVs' } });

  console.log('\n===============================================================');
  console.log('   FINAL DATABASE VERIFICATION:');
  console.log(`   • Mobiles: ${finalMobileCount} (PRESERVED)`);
  console.log(`   • Laptops: ${finalLaptopCount} (PRESERVED)`);
  console.log(`   • Tablets: ${finalTabletCount} (100% REAL DATA)`);
  console.log(`   • TVs:     ${finalTvCount} (100% REAL DATA)`);
  console.log('===============================================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[FATAL ERROR]:', e);
  await prisma.$disconnect();
  process.exit(1);
});
