import { Request, Response } from 'express';
import { Prisma } from '../generated/prisma';
import prisma from '../utils/prisma';
import { badRequest } from '../utils/http';
import { queryInt, queryList, queryNumber, queryString } from '../utils/validate';
import { buildInsights, computeStats, computeVerdict, parseRange, sliceByDays } from '../services/priceAnalytics';
import { presentCards, productInclude, resolveProductImageUrl, storePriceRows, toProductCard } from '../services/productService';
import { findProductOr404, getPriceHistory, getPricePrediction, seriesFor } from '../services/historyService';

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

export const getProduct = async (req: Request, res: Response): Promise<void> => {
  const product = await findProductOr404(String(req.params.id));
  const series = await seriesFor(product.id, 400, undefined, product.bestPrice);
  const card = toProductCard(product, series);
  const window90 = sliceByDays(series, 90);
  const stats90 = computeStats(window90);
  const lowestEver = await prisma.priceHistory.aggregate({
    _min: { price: true },
    where: { productStore: { productId: product.id } },
  });

  let userState = null;
  if (req.user) {
    const [wish, watch, alert] = await Promise.all([
      prisma.wishlist.findUnique({ where: { userId_productId: { userId: req.user.id, productId: product.id } } }),
      prisma.watchlist.findUnique({ where: { userId_productId: { userId: req.user.id, productId: product.id } } }),
      prisma.alert.findFirst({ where: { userId: req.user.id, productId: product.id, isActive: true } }),
    ]);
    userState = {
      wishlisted: Boolean(wish),
      tracking: Boolean(watch),
      alert: alert ? { id: alert.id, targetPrice: alert.targetPrice } : null,
    };
  }

  const lastChecked = product.stores.reduce<Date | null>(
    (latest, s) => (!latest || s.lastCheckedAt > latest ? s.lastCheckedAt : latest),
    null,
  );

  res.json({
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
    userState,
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
  let ids = [...new Set(queryList(req.query.ids))];
  if (ids.length === 0) throw badRequest('Provide at least 1 product id, e.g. ?ids=a,b');

  // If only 1 product ID is provided, automatically fetch 1 or 2 similar competitor phones in a similar price range
  if (ids.length === 1) {
    const mainProduct = await prisma.product.findUnique({ where: { id: ids[0] } });
    if (mainProduct) {
      const minP = Math.round((mainProduct.bestPrice || 25000) * 0.7);
      const maxP = Math.round((mainProduct.bestPrice || 25000) * 1.35);
      const competitors = await prisma.product.findMany({
        where: {
          id: { not: mainProduct.id },
          brand: { not: mainProduct.brand },
          bestPrice: { gte: minP, lte: maxP },
        },
        take: 2,
        orderBy: { reviewCount: 'desc' },
      });
      ids = [mainProduct.id, ...competitors.map((c) => c.id)];
    }
  }

  const found = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
  if (found.length === 0) {
    throw badRequest('No matching products found for comparison');
  }
  const ordered = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is typeof found[0] => Boolean(p));
  const cards = await presentCards(ordered);

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
