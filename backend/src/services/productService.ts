import { Prisma, StockStatus } from '../generated/prisma';
import prisma from '../utils/prisma';
import {
  DailyPoint,
  computeTrend,
  computeVerdict,
  sparkline,
  withCurrentPrice,
} from './priceAnalytics';

export const productInclude = {
  bestStore: true,
  stores: { include: { store: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithStores = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Matches the `Product` type used by frontend/src/components/ui/ProductCard.tsx. */
export interface ProductCard {
  id: string;
  brand: string;
  name: string;
  image: string;
  rating: number;
  reviews: number;
  specs: string[];
  bestPrice: number;
  mrp: number;
  discount: number;
  bestStore: string;
  stores: number;
  trend: string;
  category: string;
  aiVerdict: string;
  verdictColor: string;
  priceHistory: number[];
  storePrices?: { store: string; price: number; diff: number; url?: string }[];
}

export interface StorePriceRow {
  storeId: string;
  store: string;
  storeSlug: string;
  logoUrl: string | null;
  price: number;
  mrp: number | null;
  shipping: string;
  shippingCost: number;
  availability: string;
  stockStatus: StockStatus;
  diff: number;
  url: string;
  lastCheckedAt: string;
}

const AVAILABILITY_LABEL: Record<StockStatus, string> = {
  IN_STOCK: 'In Stock',
  LIMITED: 'Limited',
  OUT_OF_STOCK: 'Out of Stock',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily best (lowest) price per product across its stores, optionally limited to one store.
 * Aggregated in SQL so list pages do not pull every raw history row.
 */
export const loadDailySeries = async (
  productIds: string[],
  opts: { days?: number | null; storeId?: string } = {},
): Promise<Map<string, DailyPoint[]>> => {
  const result = new Map<string, DailyPoint[]>(productIds.map((id) => [id, []]));
  if (productIds.length === 0) return result;

  const days = opts.days === undefined ? 400 : opts.days;
  const since = days === null ? null : new Date(Date.now() - days * DAY_MS);

  // Prisma stores DateTime as UTC "timestamp without time zone", so truncating it directly yields UTC days.
  const rows = await prisma.$queryRaw<{ productId: string; day: string; price: number }[]>`
    SELECT ps."productId" AS "productId",
           to_char(date_trunc('day', ph."timestamp"), 'YYYY-MM-DD') AS "day",
           MIN(ph."price")::float8 AS "price"
    FROM "PriceHistory" ph
    JOIN "ProductStore" ps ON ps."id" = ph."productStoreId"
    WHERE ps."productId" IN (${Prisma.join(productIds)})
      ${since ? Prisma.sql`AND ph."timestamp" >= ${since}` : Prisma.empty}
      ${opts.storeId ? Prisma.sql`AND ps."storeId" = ${opts.storeId}` : Prisma.empty}
    GROUP BY 1, 2
    ORDER BY 1, 2`;

  for (const row of rows) {
    result.get(row.productId)?.push({ day: new Date(`${row.day}T00:00:00.000Z`), price: Number(row.price) });
  }
  return result;
};

const liveListings = (product: ProductWithStores) => {
  const inStock = product.stores.filter((s) => s.stockStatus !== 'OUT_OF_STOCK');
  return inStock.length > 0 ? inStock : product.stores;
};

export const bestPriceOf = (product: ProductWithStores): number | null => {
  if (product.bestPrice !== null) return product.bestPrice;
  const prices = liveListings(product).map((s) => s.currentPrice);
  return prices.length ? Math.min(...prices) : null;
};

export const resolveProductImageUrl = (url?: string | null, brand?: string, size: 'card' | 'detail' = 'card'): string => {
  const dim = size === 'detail' ? 'w420-h420' : 'w280-h280';
  if (url) {
    const spMatch = url.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/);
    if (spMatch) {
      return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-${dim}/phone.webp`;
    }
    if (url.startsWith('http') && !url.includes('smartprix.com')) {
      return url;
    }
  }

  const b = (brand || '').toLowerCase();
  if (b.includes('apple')) return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
  if (b.includes('samsung')) return 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80';
  if (b.includes('oneplus')) return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
  if (b.includes('motorola')) return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
  if (b.includes('vivo')) return 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80';
  if (b.includes('realme')) return 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80';
  if (b.includes('oppo')) return 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80';
  if (b.includes('redmi') || b.includes('xiaomi')) return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
  if (b.includes('google') || b.includes('pixel')) return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80';
  return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80';
};

export const toProductCard = (product: ProductWithStores, rawSeries: DailyPoint[] = []): ProductCard => {
  const bestPrice = bestPriceOf(product) ?? 0;
  const series = withCurrentPrice(rawSeries, bestPrice || null);
  const listingMrps = product.stores.map((s) => s.mrp).filter((m): m is number => m !== null);
  const mrp = product.mrp ?? (listingMrps.length ? Math.max(...listingMrps) : bestPrice);
  const verdict = computeVerdict(series);
  const bestStoreName =
    product.bestStore?.name ?? liveListings(product).find((s) => s.currentPrice === bestPrice)?.store.name ?? '';

  return {
    id: product.id,
    brand: product.brand,
    name: product.name,
    image: resolveProductImageUrl(product.imageUrl, product.brand, 'card'),
    rating: product.rating,
    reviews: product.reviewCount,
    specs: product.specs,
    bestPrice: Math.round(bestPrice),
    mrp: Math.round(mrp),
    discount: Math.round(product.discountPercent ?? (mrp > bestPrice ? ((mrp - bestPrice) / mrp) * 100 : 0)),
    bestStore: bestStoreName,
    stores: product.stores.length,
    trend: computeTrend(series),
    category: product.category,
    aiVerdict: verdict.label,
    verdictColor: verdict.color,
    priceHistory: sparkline(series),
    storePrices: storePriceRows(product).map((s) => ({
      store: s.store,
      price: s.price,
      diff: s.diff,
      url: s.url,
    })),
  };
};

export const presentCards = async (products: ProductWithStores[]): Promise<ProductCard[]> => {
  const series = await loadDailySeries(products.map((p) => p.id), { days: 120 });
  return products.map((p) => toProductCard(p, series.get(p.id)));
};

export const storePriceRows = (product: ProductWithStores): StorePriceRow[] => {
  const rows = [...product.stores].sort((a, b) => {
    const aOut = a.stockStatus === 'OUT_OF_STOCK' ? 1 : 0;
    const bOut = b.stockStatus === 'OUT_OF_STOCK' ? 1 : 0;
    return aOut - bOut || a.currentPrice - b.currentPrice;
  });
  const best = rows.length ? rows[0].currentPrice : 0;
  return rows.map((s) => ({
    storeId: s.storeId,
    store: s.store.name,
    storeSlug: s.store.slug,
    logoUrl: s.store.logoUrl,
    price: Math.round(s.currentPrice),
    mrp: s.mrp === null ? null : Math.round(s.mrp),
    shipping: s.shippingCost > 0 ? '₹' + Math.round(s.shippingCost).toLocaleString('en-IN') : 'Free',
    shippingCost: s.shippingCost,
    availability: AVAILABILITY_LABEL[s.stockStatus],
    stockStatus: s.stockStatus,
    diff: s.stockStatus === 'OUT_OF_STOCK' ? 0 : Math.max(0, Math.round(s.currentPrice - best)),
    url: s.productUrl,
    lastCheckedAt: s.lastCheckedAt.toISOString(),
  }));
};

/**
 * Recomputes Product.bestPrice / bestStoreId / discountPercent from its store listings.
 * Returns the best price before and after so callers can evaluate alerts.
 */
export const refreshProductAggregates = async (
  productId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ previousBest: number | null; bestPrice: number | null }> => {
  const product = await db.product.findUnique({ where: { id: productId }, include: productInclude });
  if (!product) return { previousBest: null, bestPrice: null };

  const listings = liveListings(product);
  const best = listings.reduce<(typeof listings)[number] | null>(
    (min, s) => (min === null || s.currentPrice < min.currentPrice ? s : min),
    null,
  );
  const listingMrps = product.stores.map((s) => s.mrp).filter((m): m is number => m !== null);
  const mrp = product.mrp ?? (listingMrps.length ? Math.max(...listingMrps) : null);
  const bestPrice = best?.currentPrice ?? null;
  const discountPercent = bestPrice !== null && mrp !== null && mrp > bestPrice ? ((mrp - bestPrice) / mrp) * 100 : 0;

  await db.product.update({
    where: { id: productId },
    data: { bestPrice, bestStoreId: best?.storeId ?? null, discountPercent },
  });

  return { previousBest: product.bestPrice, bestPrice };
};
