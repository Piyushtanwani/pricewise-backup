import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/utils/prisma';
import { smartprixClient } from '../src/services/smartprix/smartprixClient';
import { applyEnrichmentToProduct } from '../src/services/productEnricherService';
import { refreshProductAggregates } from '../src/services/productService';

interface SmartprixRawProduct {
  id: string;
  name: string;
  price: number;
  fePrice?: string;
  rating?: number;
  specsScore?: number;
  features?: string[];
  url?: string;
  image_id?: string;
  store?: string;
  [key: string]: unknown;
}

function parseTechSpecs(features: string[] = []): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const f of features) {
    if (/sim|5g|volte|nfc|wifi|wi-fi/i.test(f)) specs['Connectivity'] = f;
    else if (/snapdragon|dimensity|bionic|octa core|processor|ghz/i.test(f)) specs['Processor'] = f;
    else if (/ram|storage|inbuilt/i.test(f)) specs['Memory & Storage'] = f;
    else if (/battery|charging|mah/i.test(f)) specs['Battery'] = f;
    else if (/display|inches|hz|punch hole|oled|amoled/i.test(f)) specs['Display'] = f;
    else if (/camera|mp|rear|front/i.test(f)) specs['Camera'] = f;
    else if (/android|ios/i.test(f)) specs['Operating System'] = f;
  }
  return specs;
}

async function getOrCreateStore(slugOrName: string) {
  const cleanSlug = (slugOrName || 'smartprix').toLowerCase().trim();
  const name = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);

  return prisma.store.upsert({
    where: { slug: cleanSlug },
    update: {},
    create: {
      name,
      slug: cleanSlug,
      url: cleanSlug === 'amazon' ? 'https://www.amazon.in' : cleanSlug === 'flipkart' ? 'https://www.flipkart.com' : 'https://www.smartprix.com',
    },
  });
}

async function ingestMobilesForBrand(brandName: string, brandSlug: string, maxRetries = 2) {
  console.log(`\n========================================`);
  console.log(`[BRAND] Fetching Page 1 for ${brandName} (${brandSlug})...`);
  console.log(`========================================`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[RETRY] Attempt ${attempt} for ${brandName} after pause...`);
        await new Promise((r) => setTimeout(r, 5000));
      }

      let res: any;
      try {
        if (brandSlug === 'motorola') {
          res = await smartprixClient.searchSmartphones({
            query: 'Motorola',
            page: 1,
          });
        } else {
          res = await smartprixClient.searchSmartphones({
            brand: brandSlug,
            page: 1,
          });
        }
      } catch (err: any) {
        console.log(`[FALLBACK] Brand search failed for ${brandName}, trying query search...`);
        res = await smartprixClient.searchSmartphones({
          query: brandName,
          page: 1,
        });
      }

      const products: SmartprixRawProduct[] = res?.data?.products || res?.products || [];

      if (!Array.isArray(products) || products.length === 0) {
        console.log(`[INFO] No products returned for brand ${brandName}`);
        return 0;
      }

      console.log(`[FOUND] ${products.length} smartphones for ${brandName}. Ingesting to Supabase...`);

      let savedCount = 0;

      for (const item of products) {
        if (!item.name || !item.price) continue;

        const storeName = item.store || 'Smartprix';
        const store = await getOrCreateStore(storeName);

        const price = Number(item.price);
        const mrp = Math.round(price * 1.15); // Estimated MRP
        const discountPercent = Math.round(((mrp - price) / mrp) * 100);
        const rating = item.rating ? Math.min(5, Math.max(1, Math.round((item.rating / 20) * 10) / 10)) : 4.2;
        const techSpecs = parseTechSpecs(item.features || []);
        const productUrl = item.url
          ? item.url.startsWith('http')
            ? item.url
            : `https://www.smartprix.com${item.url}`
          : `https://www.smartprix.com/mobiles/${brandSlug}`;
        const imageUrl = item.image_id ? `https://images.smartprix.com/${item.image_id}.webp` : null;

        // Upsert Product in Supabase
        const existingProduct = await prisma.product.findFirst({
          where: { name: item.name },
        });

        let productRecord;
        if (existingProduct) {
          productRecord = await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              brand: brandName,
              bestPrice: price,
              mrp,
              discountPercent,
              rating,
              specs: item.features || [],
              techSpecs,
              imageUrl: imageUrl || existingProduct.imageUrl,
              bestStoreId: store.id,
            },
          });
        } else {
          productRecord = await prisma.product.create({
            data: {
              name: item.name,
              brand: brandName,
              category: 'Mobiles',
              bestPrice: price,
              mrp,
              discountPercent,
              rating,
              specs: item.features || [],
              techSpecs,
              imageUrl,
              bestStoreId: store.id,
            },
          });
        }

        // Upsert ProductStore listing
        const existingListing = await prisma.productStore.findFirst({
          where: { productId: productRecord.id, storeId: store.id },
        });

        let listingRecord;
        if (existingListing) {
          listingRecord = await prisma.productStore.update({
            where: { id: existingListing.id },
            data: {
              currentPrice: price,
              mrp,
              productUrl,
              lastCheckedAt: new Date(),
            },
          });
        } else {
          listingRecord = await prisma.productStore.create({
            data: {
              productId: productRecord.id,
              storeId: store.id,
              externalId: item.id || undefined,
              productUrl,
              currentPrice: price,
              mrp,
              currency: 'INR',
              stockStatus: 'IN_STOCK',
              lastCheckedAt: new Date(),
            },
          });
        }

        // Record base price history entry
        await prisma.priceHistory.create({
          data: {
            productStoreId: listingRecord.id,
            price,
            currency: 'INR',
            timestamp: new Date(),
          },
        });

        // Enrich with multi-store comparison and decoded 180+ daily price history
        if (item.url) {
          try {
            const enrichRes = await applyEnrichmentToProduct(productRecord.id, item.url);
            if (enrichRes.storesCount > 0 || enrichRes.historyCount > 0) {
              console.log(`    ↳ Enriched: ${enrichRes.storesCount} verified stores, ${enrichRes.historyCount} price history points`);
            }
          } catch (enrichErr: any) {
            console.warn(`    ↳ Enrichment warning for ${item.name}:`, enrichErr.message);
          }
        }

        try {
          await refreshProductAggregates(productRecord.id);
        } catch {
          // ignore
        }

        savedCount++;
        console.log(`  ✓ Saved: ${item.name} — ₹${price.toLocaleString('en-IN')}`);
      }

      console.log(`[COMPLETED] Successfully ingested ${savedCount} mobiles for ${brandName}!`);
      return savedCount;
    } catch (err: any) {
      console.error(`[ERROR] Attempt ${attempt} failed for ${brandName}:`, err.message);
      if (attempt === maxRetries) {
        return 0;
      }
    }
  }
  return 0;
}

async function main() {
  console.log('--- PriceWise: Supabase Brand-by-Brand Mobile Ingestion ---');

  const brandCatalog: Record<string, string> = {
    apple: 'Apple',
    oneplus: 'OnePlus',
    motorola: 'Motorola',
    oppo: 'OPPO',
    samsung: 'Samsung',
    vivo: 'Vivo',
    realme: 'Realme',
    xiaomi: 'Xiaomi',
    poco: 'Poco',
    iqoo: 'iQOO',
  };

  const cliArgs = process.argv.slice(2).map((a) => a.toLowerCase().trim());
  const targetSlugs = cliArgs.length > 0 ? cliArgs : ['apple', 'oneplus', 'motorola', 'oppo'];

  const selectedBrands = targetSlugs.map((slug) => ({
    slug,
    name: brandCatalog[slug] || slug.charAt(0).toUpperCase() + slug.slice(1),
  }));

  console.log(`[TARGET BRANDS] Ingesting Page 1 for: ${selectedBrands.map((b) => b.name).join(', ')}`);

  let totalIngested = 0;
  for (const b of selectedBrands) {
    const count = await ingestMobilesForBrand(b.name, b.slug);
    totalIngested += count;
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('\n========================================');
  console.log(`[ALL DONE] Ingestion run complete! Added/Updated products in Supabase.`);
  console.log('========================================');

  await prisma.$disconnect();
}



main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
