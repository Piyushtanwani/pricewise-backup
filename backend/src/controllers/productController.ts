import { Request, Response } from 'express';
import { Prisma, StockStatus } from '../generated/prisma';
import prisma from '../utils/prisma';
import { badRequest, notFound } from '../utils/http';
import { queryInt, queryList, queryNumber, queryString } from '../utils/validate';
import { buildInsights, computeStats, computeVerdict, parseRange, sliceByDays } from '../services/priceAnalytics';
import { presentCards, productInclude, resolveProductImageUrl, storePriceRows, toProductCard, StorePriceRow } from '../services/productService';
import { findProductOr404, getPriceHistory, getPricePrediction, seriesFor } from '../services/historyService';
import { env } from '../config/env';
import { resolveDirectStoreUrl, validateCanonicalProductUrl } from '../services/storeRedirectService';
import { refreshProductAggregates } from '../services/productService';
import { parsePrice } from '../utils/priceNormalizer';
import { livePriceCache } from '../utils/cache';
import { TargetSpecs } from '../services/retailerScraperService';
import { getLiveSerpStorePrices, matchAllowedStore } from '../services/serpShoppingService';
import { scrapeLiveStoreListing, scrapeFlipkart, scrapeCroma } from '../services/retailerScraperService';

const SORTS: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  relevance: [{ reviewCount: 'desc' }, { rating: 'desc' }],
  price_asc: [{ bestPrice: { sort: 'asc', nulls: 'last' } }],
  price_desc: [{ bestPrice: { sort: 'desc', nulls: 'last' } }],
  rating: [{ rating: 'desc' }, { reviewCount: 'desc' }],
  best_deal: [{ discountPercent: { sort: 'desc', nulls: 'last' } }],
  newest: [{ createdAt: 'desc' }],
};

// Labels used by the sort menu in frontend/src/pages/Search.tsx
const SORT_LABELS: Record<string, string> = {
  Relevance: 'relevance',
  'Price: Low to High': 'price_asc',
  'Price: High to Low': 'price_desc',
  Rating: 'rating',
  'Best Deal': 'best_deal',
};

const anyEqualsInsensitive = (field: 'category' | 'brand', values: string[]): Prisma.ProductWhereInput => ({
  OR: values.map((value) => ({ [field]: { equals: value, mode: 'insensitive' } })),
});

export const listProducts = async (req: Request, res: Response): Promise<void> => {
  const q = queryString(req.query.q ?? req.query.search);
  const categories = queryList([req.query.category, req.query['category[]']].filter(Boolean).flat());
  const brands = queryList([req.query.brand, req.query['brand[]']].filter(Boolean).flat());
  const stores = queryList([req.query.store, req.query['store[]']].filter(Boolean).flat());
  const minPrice = queryNumber(req.query.minPrice);
  const maxPrice = queryNumber(req.query.maxPrice);
  const minRating = queryNumber(req.query.minRating);
  const sortParam = queryString(req.query.sort) ?? 'relevance';
  const sort = SORT_LABELS[sortParam] ?? sortParam;
  if (!SORTS[sort]) throw badRequest(`sort must be one of: ${Object.keys(SORTS).join(', ')}`);
  const page = queryInt(req.query.page, 1, { min: 1, max: 10_000 });
  const limit = queryInt(req.query.limit, 20, { min: 1, max: 500 });

  const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 8) : [];
  const filters: Prisma.ProductWhereInput[] = terms.map((term) => ({
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ],
  }));
  if (categories.length) filters.push(anyEqualsInsensitive('category', categories));
  if (brands.length) filters.push(anyEqualsInsensitive('brand', brands));
  if (stores.length) {
    filters.push({
      stores: {
        some: {
          store: { OR: stores.flatMap((s) => [{ name: { equals: s, mode: 'insensitive' as const } }, { slug: s.toLowerCase() }]) },
        },
      },
    });
  }
  if (minPrice !== undefined || maxPrice !== undefined) filters.push({ bestPrice: { gte: minPrice, lte: maxPrice } });
  if (minRating !== undefined) filters.push({ rating: { gte: minRating } });

  const where: Prisma.ProductWhereInput = filters.length ? { AND: filters } : {};
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [...SORTS[sort], { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({ items: await presentCards(products), total, page, limit, sort });
};

export const getCatalogMeta = async (_req: Request, res: Response): Promise<void> => {
  const [categories, brands, stores, priceRange] = await Promise.all([
    prisma.product.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } }),
    prisma.product.groupBy({ by: ['brand'], _count: { _all: true }, orderBy: { brand: 'asc' } }),
    prisma.store.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, url: true, logoUrl: true } }),
    prisma.product.aggregate({ _min: { bestPrice: true }, _max: { bestPrice: true } }),
  ]);

  res.json({
    categories: categories.map((c) => ({ name: c.category, count: c._count._all })),
    brands: brands.map((b) => ({ name: b.brand, count: b._count._all })),
    stores,
    priceRange: { min: Math.floor(priceRange._min.bestPrice ?? 0), max: Math.ceil(priceRange._max.bestPrice ?? 0) },
  });
};

// Lightweight TTL cache for product details (15s TTL for fresh stock & prices)
const productDetailCache = new Map<string, { data: any; expiry: number }>();

export const getProduct = async (req: Request, res: Response): Promise<void> => {
  const productId = String(req.params.id);
  const now = Date.now();
  const forceRefresh = req.query.refresh === 'true';

  const cached = forceRefresh ? null : productDetailCache.get(productId);
  let baseData = cached && cached.expiry > now ? cached.data : null;

  if (!baseData) {
    const product = await findProductOr404(productId);
    const [series, lowestEver] = await Promise.all([
      seriesFor(product.id, 90, undefined, product.bestPrice),
      prisma.priceHistory.aggregate({
        _min: { price: true },
        where: { productStore: { productId: product.id } },
      }),
    ]);

    const card = toProductCard(product, series);
    const window90 = sliceByDays(series, 90);
    const stats90 = computeStats(window90);

    const lastChecked = product.stores.reduce<Date | null>(
      (latest, s) => (!latest || s.lastCheckedAt > latest ? s.lastCheckedAt : latest),
      null,
    );

    baseData = {
      ...card,
      description: product.description,
      techSpecs: product.techSpecs ?? {},
      gtin: product.gtin,
      images: [resolveProductImageUrl(product.imageUrl, product.brand, 'detail')],
      savings: Math.max(0, card.mrp - card.bestPrice),
      storePrices: storePriceRows(product),
      stats: {
        current: card.bestPrice,
        lowest90: stats90?.lowest ?? card.bestPrice,
        highest90: stats90?.highest ?? card.bestPrice,
        average90: stats90?.average ?? card.bestPrice,
        lowestEver: Math.round(Math.min(lowestEver._min.price ?? card.bestPrice, card.bestPrice)),
      },
      verdict: computeVerdict(series),
      insights: buildInsights(series),
      pricesUpdatedAt: lastChecked?.toISOString() ?? null,
    };

    productDetailCache.set(productId, { data: baseData, expiry: now + 15_000 });
  }

  let userState = null;
  if (req.user) {
    const [wish, watch, alert] = await Promise.all([
      prisma.wishlist.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } }),
      prisma.watchlist.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } }),
      prisma.alert.findFirst({ where: { userId: req.user.id, productId, isActive: true } }),
    ]);
    userState = {
      wishlisted: Boolean(wish),
      tracking: Boolean(watch),
      alert: alert ? { id: alert.id, targetPrice: alert.targetPrice } : null,
    };
  }

  res.json({
    ...baseData,
    userState,
  });
};

export function extractProductSpecs(product: {
  name: string;
  specs?: string[];
  techSpecs?: any;
}): { ram?: string | null; storage?: string | null } {
  const specsList = Array.isArray(product.specs) ? product.specs : [];
  const specsStr = specsList.join(' ');
  const tech = product.techSpecs && typeof product.techSpecs === 'object' ? (product.techSpecs as Record<string, unknown>) : {};
  const nameStr = product.name || '';
  const combined = `${nameStr} ${specsStr}`;

  // 1. RAM extraction
  let ram: string | null = null;
  if (tech['RAM']) {
    ram = String(tech['RAM']);
  } else if (tech['Memory & Storage']) {
    const ms = String(tech['Memory & Storage']);
    const rMatch = ms.match(/([0-9]+)\s*GB\s*RAM/i) || ms.match(/([0-9]+)\s*GB/i);
    if (rMatch) ram = `${rMatch[1]} GB`;
  } else {
    const ramMatch = combined.match(/([0-9]+)\s*GB\s*RAM/i);
    if (ramMatch) ram = `${ramMatch[1]} GB`;
  }

  // 2. Storage extraction (internal storage only)
  let storage: string | null = null;
  if (tech['Internal Storage'] || tech['Storage'] || tech['ROM']) {
    storage = String(tech['Internal Storage'] || tech['Storage'] || tech['ROM']);
  } else if (tech['Memory & Storage']) {
    const ms = String(tech['Memory & Storage']);
    const sMatch =
      ms.match(/([0-9]+)\s*(?:GB|TB)\s*(?:inbuilt|internal|ROM|storage)/i) ||
      ms.match(/,\s*([0-9]+)\s*(?:GB|TB)/i) ||
      ms.match(/([0-9]+)\s*(?:GB|TB)/i);
    if (sMatch) storage = sMatch[0].replace(/^,\s*/, '').trim();
  }

  // Fallback to searching specs, ignoring expandable memory card / upto phrases
  if (!storage) {
    const cleanCombined = combined
      .replace(/memory\s*card[^,]*/gi, '')
      .replace(/upto\s*[0-9]+\s*(?:tb|gb)/gi, '')
      .replace(/expandable[^,]*/gi, '');

    const explicitInbuilt = cleanCombined.match(/([0-9]+)\s*(?:GB|TB)\s*(?:inbuilt|internal|ROM|storage)/i);
    if (explicitInbuilt) {
      storage = explicitInbuilt[0].trim();
    } else {
      const tbMatch = cleanCombined.match(/([0-9]+)\s*TB/i);
      if (tbMatch) {
        storage = `${tbMatch[1]} TB`;
      } else {
        const storageMatch =
          nameStr.match(/([0-9]+)\s*GB/i) ||
          cleanCombined.match(/([0-9]+)\s*GB/i);
        if (storageMatch) storage = `${storageMatch[1]} GB`;
      }
    }
  }

  return { ram, storage };
}

export const getProductLiveStores = async (req: Request, res: Response): Promise<void> => {
  const productId = String(req.params.id);
  const forceRefresh = req.query.refresh !== 'false';
  const product = await findProductOr404(productId);
  const targetSpecs = extractProductSpecs(product);

  // 1. Live real-time prices from SerpApi (always fresh when user visits phone page)
  const livePrices = await getLiveSerpStorePrices(product.name, product.brand, product.bestPrice, forceRefresh);

  // Verified database store rows (used for missing retailer fallback or metadata)
  const dbStores = storePriceRows(product).filter((s) => {
    const match = matchAllowedStore(s.store, product.brand, product.name);
    return match !== null;
  });

  if (livePrices.length > 0) {
    // 2. SerpApi live results are the PRIMARY ground truth for real-time prices & stock
    const liveStoreRows: StorePriceRow[] = livePrices.map((s) => {
      const stockStatus =
        s.stockStatus === 'OUT_OF_STOCK'
          ? StockStatus.OUT_OF_STOCK
          : s.stockStatus === 'LIMITED'
          ? StockStatus.LIMITED
          : StockStatus.IN_STOCK;

      return {
        storeId: s.storeId,
        store: s.store,
        storeSlug: s.storeSlug,
        logoUrl: s.logoUrl ?? null,
        price: s.price,
        mrp: s.mrp ?? null,
        shipping: s.shipping || 'Free',
        shippingCost: 0,
        availability: s.availability || 'In Stock',
        stockStatus,
        diff: s.diff,
        url: s.url,
        lastCheckedAt: s.lastCheckedAt ?? new Date().toISOString(),
      };
    });

    // 3. For stores from DB not present in live SerpApi results, safely retain their verified database status
    const liveSlugs = new Set(livePrices.map((p) => p.storeSlug.toLowerCase()));
    const missingDbStores: StorePriceRow[] = dbStores
      .filter((s) => !liveSlugs.has(s.storeSlug.toLowerCase()) && !liveSlugs.has(s.store.toLowerCase()))
      .map((s) => ({
        ...s,
        availability: s.availability || (s.stockStatus === StockStatus.OUT_OF_STOCK ? 'Out of Stock' : 'In Stock'),
        stockStatus: s.stockStatus || StockStatus.IN_STOCK,
        diff: 0,
      }));

    const stores = [...liveStoreRows, ...missingDbStores];

    // In Stock stores first (sorted by price ascending), then Limited, then Out of Stock
    stores.sort((a, b) => {
      const rank = (status: StockStatus) => {
        if (status === StockStatus.IN_STOCK) return 0;
        if (status === StockStatus.LIMITED) return 1;
        return 2;
      };
      const rankDiff = rank(a.stockStatus) - rank(b.stockStatus);
      if (rankDiff !== 0) return rankDiff;
      return a.price - b.price;
    });

    const lowestInStock = stores.find((s) => s.stockStatus !== StockStatus.OUT_OF_STOCK)?.price ?? stores[0].price;
    const finalStores = stores.map((s) => ({
      ...s,
      diff: s.stockStatus === StockStatus.OUT_OF_STOCK ? 0 : Math.max(0, s.price - lowestInStock),
    }));

    const bestInStock = finalStores.find((s) => s.stockStatus !== StockStatus.OUT_OF_STOCK) || finalStores[0];

    res.json({
      stores: finalStores,
      bestDealUrl: bestInStock?.url || null,
      source: 'live_serpapi',
      refreshedAt: new Date().toISOString(),
    });
    return;
  }

  // 4. Real-Time Live Direct Retailer Scraping:
  // When SerpApi is exhausted (HTTP 429 quota reached) or returns no live results,
  // scrape the verified store URLs (Croma, Amazon, Flipkart) directly in real-time!
  const scrapedStores: StorePriceRow[] = await Promise.all(
    dbStores.map(async (s) => {
      const scraped = await scrapeLiveStoreListing(s.url, s.store, product.name, product.bestPrice, targetSpecs);
      if (!scraped) return s;

      return {
        ...s,
        price: scraped.price && scraped.price > 0 ? scraped.price : s.price,
        stockStatus: scraped.stockStatus ?? s.stockStatus,
        availability: scraped.availability ?? s.availability,
        url: scraped.directUrl ?? s.url,
        lastCheckedAt: new Date().toISOString(),
      };
    }),
  );

  // If Flipkart is not yet linked in database or live results, dynamically scrape Flipkart live in real-time!
  const hasFlipkart = scrapedStores.some(
    (s) => s.storeSlug?.toLowerCase() === 'flipkart' || s.store.toLowerCase().includes('flipkart'),
  );
  if (!hasFlipkart) {
    try {
      const fkOffer = await scrapeFlipkart('https://www.flipkart.com/search', product.bestPrice, product.name, targetSpecs);
      if (fkOffer && fkOffer.price && fkOffer.price > 0) {
        scrapedStores.push({
          storeId: 'flipkart-live',
          store: 'Flipkart',
          storeSlug: 'flipkart',
          logoUrl: 'https://img1a.flixcart.com/www/linchpin/fk-cp-zion/img/flipkart-plus_8d85f4.png',
          price: fkOffer.price,
          mrp: null,
          shipping: 'Free',
          shippingCost: 0,
          availability: fkOffer.availability || 'In Stock',
          stockStatus: fkOffer.stockStatus ?? StockStatus.IN_STOCK,
          diff: 0,
          url: fkOffer.directUrl || `https://www.flipkart.com/search?q=${encodeURIComponent(product.name)}`,
          lastCheckedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[LiveStore] Flipkart dynamic scrape error:', e);
    }
  }

  const stores = [...scrapedStores].sort((a, b) => {
    const aOut = a.stockStatus === StockStatus.OUT_OF_STOCK ? 1 : 0;
    const bOut = b.stockStatus === StockStatus.OUT_OF_STOCK ? 1 : 0;
    return aOut - bOut || a.price - b.price;
  });

  const lowestInStock = stores.find((s) => s.stockStatus !== StockStatus.OUT_OF_STOCK)?.price ?? stores[0]?.price ?? 0;
  const finalStores = stores.map((s) => ({
    ...s,
    diff: s.stockStatus === StockStatus.OUT_OF_STOCK ? 0 : Math.max(0, s.price - lowestInStock),
  }));

  const bestInStock = finalStores.find((s) => s.stockStatus !== StockStatus.OUT_OF_STOCK) || finalStores[0];

  res.json({
    stores: finalStores,
    bestDealUrl: bestInStock?.url || null,
    source: 'live_scraped',
    refreshedAt: new Date().toISOString(),
  });
};

export const getProductHistory = async (req: Request, res: Response): Promise<void> => {
  res.json(await getPriceHistory(String(req.params.id), parseRange(queryString(req.query.range)), queryString(req.query.store)));
};

export const getProductPrediction = async (req: Request, res: Response): Promise<void> => {
  res.json(await getPricePrediction(String(req.params.id)));
};

export const getAlternatives = async (req: Request, res: Response): Promise<void> => {
  const product = await findProductOr404(String(req.params.id));
  const limit = queryInt(req.query.limit, 4, { min: 1, max: 12 });
  const price = product.bestPrice ?? 0;

  // 1. Content-based ML Recommender via FastAPI
  if (env.mlServiceUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const mlRes = await fetch(`${env.mlServiceUrl}/recommend/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, limit }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (mlRes.ok) {
        const payload = (await mlRes.json()) as { recommendations?: { product_id: string }[] };
        if (payload.recommendations && payload.recommendations.length > 0) {
          const recIds = payload.recommendations.map((r) => r.product_id);
          const dbProducts = await prisma.product.findMany({
            where: { id: { in: recIds } },
            include: productInclude,
          });
          const productMap = new Map(dbProducts.map((p) => [p.id, p]));
          const ordered = recIds.map((id) => productMap.get(id)).filter((p): p is (typeof dbProducts)[0] => Boolean(p));
          if (ordered.length > 0) {
            res.json({ items: await presentCards(ordered) });
            return;
          }
        }
      }
    } catch {
      // Fall through to deterministic heuristic fallback
    }
  }

  // 2. Deterministic SQL Heuristic Fallback
  const inBand = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      category: product.category,
      ...(price ? { bestPrice: { gte: price * 0.6, lte: price * 1.4 } } : {}),
    },
    include: productInclude,
    orderBy: [{ rating: 'desc' }, { discountPercent: { sort: 'desc', nulls: 'last' } }],
    take: limit,
  });
  // Top up with same-category products outside the price band, then anything highly rated.
  const exclude = [product.id, ...inBand.map((p) => p.id)];
  const sameCategory =
    inBand.length < limit
      ? await prisma.product.findMany({
          where: { id: { notIn: exclude }, category: product.category },
          include: productInclude,
          orderBy: { rating: 'desc' },
          take: limit - inBand.length,
        })
      : [];
  const remaining = limit - inBand.length - sameCategory.length;
  const others =
    remaining > 0
      ? await prisma.product.findMany({
          where: { id: { notIn: [...exclude, ...sameCategory.map((p) => p.id)] } },
          include: productInclude,
          orderBy: { rating: 'desc' },
          take: remaining,
        })
      : [];

  res.json({ items: await presentCards([...inBand, ...sameCategory, ...others]) });
};

export const compareProducts = async (req: Request, res: Response): Promise<void> => {
  const ids = [...new Set(queryList(req.query.ids))];
  if (ids.length === 0) throw badRequest('Provide at least 1 product id, e.g. ?ids=a,b');

  const found = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
  if (found.length === 0) {
    throw badRequest('No matching products found for comparison');
  }
  const ordered = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is typeof found[0] => Boolean(p));
  const cards = ordered.map((p) => toProductCard(p));

  const techSpecLabels: string[] = [];
  for (const p of ordered) {
    const specs = (p.techSpecs ?? {}) as Record<string, unknown>;
    for (const label of Object.keys(specs)) if (!techSpecLabels.includes(label)) techSpecLabels.push(label);
  }

  res.json({
    products: ordered.map((p, i) => ({
      ...cards[i],
      techSpecs: (p.techSpecs ?? {}) as Record<string, string>,
      bestDealUrl: storePriceRows(p)[0]?.url ?? null,
    })),
    techSpecLabels,
  });
};

/**
 * Asynchronously refreshes real-time stock and pricing in the background upon store redirection,
 * without blocking or delaying the user's outgoing navigation flow.
 */
async function refreshStockAndPriceAsync(
  productId: string,
  listingId: string | undefined,
  directUrl: string,
  storeName: string,
  productName: string,
  basePrice?: number | null,
  targetSpecs?: TargetSpecs,
): Promise<void> {
  if (!listingId || !directUrl) return;

  try {
    const scraped = await scrapeLiveStoreListing(directUrl, storeName, productName, basePrice, targetSpecs);
    if (!scraped) return;

    const cleanPrice = scraped.price ? parsePrice(scraped.price) : 0;
    const now = new Date();

    await prisma.productStore.update({
      where: { id: listingId },
      data: {
        ...(cleanPrice > 0 ? { currentPrice: cleanPrice } : {}),
        stockStatus: scraped.stockStatus,
        lastCheckedAt: now,
      },
    });

    await refreshProductAggregates(productId);

    // Invalidate caches so subsequent views are immediately fresh
    const cleanQuery = productName.replace(/\(.*?\)/g, '').replace(/\b5g\b/gi, '').trim();
    await livePriceCache.del(`serp_live::${cleanQuery.toLowerCase()}::`);
    productDetailCache.delete(productId);
  } catch (err: any) {
    console.warn(`[AsyncStockRefresh] Background sync notice for ${productName}:`, err?.message || err);
  }
}

export const redirectToStore = async (req: Request, res: Response): Promise<void> => {
  const productId = String(req.params.id);
  const requestedStore = (req.query.store as string) || '';
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: productInclude,
  });

  if (!product) {
    throw notFound('Product not found');
  }

  // Find the matching store listing or first store
  const listing = product.stores.find(
    (s) =>
      !requestedStore ||
      s.store.name.toLowerCase().includes(requestedStore.toLowerCase()) ||
      s.store.slug.toLowerCase().includes(requestedStore.toLowerCase()),
  ) || product.stores[0];

  const storeName = listing?.store?.name || product.bestStore?.name || requestedStore || 'Amazon';
  const rawUrl = listing?.productUrl || '';
  const targetSpecs = extractProductSpecs(product);

  let directUrl = await resolveDirectStoreUrl(rawUrl, storeName, product.name);

  // If redirecting to Flipkart, ensure the direct link matches the EXACT RAM & storage variant
  if (storeName.toLowerCase().includes('flipkart') && (!directUrl.includes('/p/itm') || directUrl.includes('flipkart.com/search'))) {
    try {

      const fkScraped = await scrapeFlipkart('https://www.flipkart.com/search', product.bestPrice, product.name, targetSpecs);
      if (fkScraped?.directUrl && fkScraped.directUrl.includes('/p/itm')) {
        directUrl = fkScraped.directUrl;
      }
    } catch {
      // Keep directUrl
    }
  }

  // Strict URL-matching validation check before finalizing redirect
  const validation = validateCanonicalProductUrl(directUrl, storeName, product);
  const finalRedirectUrl = validation.isValid ? validation.canonicalUrl : validation.fallbackUrl;

  // Asynchronously refresh real-time stock status without breaking or delaying outgoing navigation
  setImmediate(() => {
    refreshStockAndPriceAsync(product.id, listing?.id, finalRedirectUrl, storeName, product.name, product.bestPrice, targetSpecs)
      .catch(() => {});
  });

  // If client wants JSON payload instead of direct 302 redirect
  if (req.query.format === 'json') {
    res.json({
      directUrl: finalRedirectUrl,
      canonicalUrl: validation.canonicalUrl,
      fallbackUrl: validation.fallbackUrl,
      isValid: validation.isValid,
      isFallback: validation.isFallback,
      validationReason: validation.reason,
      storeName,
      productName: product.name,
      stockStatus: listing?.stockStatus || StockStatus.IN_STOCK,
    });
    return;
  }

  res.redirect(finalRedirectUrl);
};
