import prisma from '../utils/prisma';
import { badRequest, notFound } from '../utils/http';
import {
  RANGE_DAYS,
  RangeKey,
  computeStats,
  downsample,
  formatDayLabel,
  sliceByDays,
  trailingAverage,
  withCurrentPrice,
} from './priceAnalytics';
import { loadDailySeries, productInclude } from './productService';
import { predictPrices } from './predictionService';

const MAX_CHART_POINTS = 90;
const AVERAGE_WINDOW_DAYS = 30;

export const findProductOr404 = async (id: string) => {
  const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!product) throw notFound('Product not found');
  return product;
};

/** Resolves ?store= (name or slug, case-insensitive) to one of the product's listings. */
const resolveListing = (product: Awaited<ReturnType<typeof findProductOr404>>, store?: string) => {
  if (!store || /^all( stores)?$/i.test(store)) return null;
  const listing = product.stores.find(
    (s) => s.store.name.toLowerCase() === store.toLowerCase() || s.store.slug === store.toLowerCase(),
  );
  if (!listing) throw badRequest(`This product is not listed on "${store}"`);
  return listing;
};

/** Best-price series for a product including today's live price. */
export const seriesFor = async (productId: string, days: number | null, storeId?: string, currentPrice?: number | null) => {
  const series = (await loadDailySeries([productId], { days, storeId })).get(productId) ?? [];
  return withCurrentPrice(series, currentPrice);
};

export const getPriceHistory = async (productId: string, range: RangeKey, store?: string) => {
  const product = await findProductOr404(productId);
  const listing = resolveListing(product, store);
  const days = RANGE_DAYS[range];
  // Load extra days so the trailing average is meaningful from the first visible point.
  const full = await seriesFor(
    productId,
    days === null ? null : days + AVERAGE_WINDOW_DAYS,
    listing?.storeId,
    listing ? listing.currentPrice : product.bestPrice,
  );
  const averages = trailingAverage(full, AVERAGE_WINDOW_DAYS);
  const withAvg = full.map((p, i) => ({ ...p, avg: averages[i] }));
  const visible = sliceByDays(withAvg, days);

  return {
    productId,
    range,
    store: listing?.store.name ?? 'All Stores',
    stats: computeStats(visible),
    points: downsample(visible, MAX_CHART_POINTS).map((p) => ({
      date: formatDayLabel(p.day),
      timestamp: p.day.toISOString(),
      price: Math.round(p.price),
      avg: p.avg,
    })),
  };
};

export const getPricePrediction = async (productId: string) => {
  const product = await findProductOr404(productId);
  const series = await seriesFor(productId, 120, undefined, product.bestPrice);
  return { productId, ...(await predictPrices(productId, series)) };
};
