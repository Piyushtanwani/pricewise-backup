import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { badRequest, notFound } from '../utils/http';
import { optionalString, queryInt, queryList, queryString, requireString } from '../utils/validate';
import { providerStatus } from '../services/stores';
import { importFromStores, lastSyncSummary, searchStores, syncPrices } from '../services/priceSync';
import { refreshProductAggregates } from '../services/productService';
import { smartprixClient, groqNormalizer } from '../services/smartprix';

/** Public: which stores have live data. Never exposes credential values. */
export const getPublicStatus = (_req: Request, res: Response): void => {
  const last = lastSyncSummary();
  res.json({
    providers: [
      ...providerStatus().map(({ id, store, configured }) => ({ id, store, configured })),
      { id: 'smartprix', store: 'Smartprix (Parse.bot)', configured: smartprixClient.isConfigured() },
    ],
    lastSync: last ? { finishedAt: last.finishedAt, productsUpdated: last.productsUpdated } : null,
  });
};

export const getAdminStatus = (_req: Request, res: Response): void => {
  res.json({
    providers: [
      ...providerStatus(),
      {
        id: 'smartprix',
        store: 'Smartprix (Parse.bot)',
        configured: smartprixClient.isConfigured(),
        missing: smartprixClient.missingConfig(),
      },
    ],
    lastSync: lastSyncSummary(),
  });
};


export const runSync = async (req: Request, res: Response): Promise<void> => {
  const productId = optionalString(req.body, 'productId');
  res.json(await syncPrices({ productId }));
};

export const runImport = async (req: Request, res: Response): Promise<void> => {
  const query = requireString(req.body, 'query', { min: 2, max: 120 });
  const limit = queryInt(req.body?.limit === undefined ? undefined : String(req.body.limit), 10, { min: 1, max: 10 });
  res.json(
    await importFromStores(query, {
      providers: queryList(req.body?.stores),
      limit,
      category: optionalString(req.body, 'category', { max: 60 }),
    }),
  );
};

export const liveSearch = async (req: Request, res: Response): Promise<void> => {
  const q = queryString(req.query.q);
  if (!q) throw badRequest('q is required');
  const limit = queryInt(req.query.limit, 5, { min: 1, max: 10 });
  res.json({ query: q, results: await searchStores(q, limit, queryList(req.query.stores)) });
};

/** Links an existing listing to its ASIN / FSN so the price sync can refresh it. */
export const linkListing = async (req: Request, res: Response): Promise<void> => {
  const listingId = String(req.params.listingId);
  const externalId = requireString(req.body, 'externalId', { max: 64 });
  const productUrl = optionalString(req.body, 'productUrl', { max: 2000 });
  if (productUrl && !/^https:\/\//.test(productUrl)) throw badRequest('productUrl must be an https URL');

  const listing = await prisma.productStore.findUnique({ where: { id: listingId } });
  if (!listing) throw notFound('Listing not found');

  const updated = await prisma.productStore.update({
    where: { id: listingId },
    data: { externalId, ...(productUrl ? { productUrl } : {}) },
    include: { store: true },
  });
  await refreshProductAggregates(updated.productId);
  res.json({ id: updated.id, productId: updated.productId, store: updated.store.name, externalId: updated.externalId, productUrl: updated.productUrl });
};

export const listListings = async (req: Request, res: Response): Promise<void> => {
  const productId = queryString(req.query.productId);
  const listings = await prisma.productStore.findMany({
    where: productId ? { productId } : {},
    include: { store: { select: { name: true, slug: true } }, product: { select: { name: true } } },
    orderBy: [{ product: { name: 'asc' } }, { store: { name: 'asc' } }],
    take: 500,
  });
  res.json({
    items: listings.map((l) => ({
      id: l.id,
      productId: l.productId,
      product: l.product.name,
      store: l.store.name,
      storeSlug: l.store.slug,
      externalId: l.externalId,
      currentPrice: l.currentPrice,
      lastCheckedAt: l.lastCheckedAt.toISOString(),
    })),
  });
};

/** Smartprix / Parse.bot endpoints */

export const getSmartprixStatus = (_req: Request, res: Response): void => {
  res.json({
    provider: 'smartprix',
    configured: smartprixClient.isConfigured(),
    missingConfig: smartprixClient.missingConfig(),
    groqConfigured: groqNormalizer.isConfigured(),
  });
};

export const smartprixSearch = async (req: Request, res: Response): Promise<void> => {
  const query = queryString(req.query.query || req.query.q);
  const brand = queryString(req.query.brand);
  const sort = queryString(req.query.sort);
  const page = req.query.page !== undefined ? queryInt(req.query.page, 1, { min: 1, max: 100 }) : undefined;
  const min_price = req.query.min_price !== undefined ? queryInt(req.query.min_price, 0, { min: 0, max: 1_000_000 }) : undefined;
  const max_price = req.query.max_price !== undefined ? queryInt(req.query.max_price, 1_000_000, { min: 0, max: 1_000_000 }) : undefined;

  const data = await smartprixClient.searchSmartphones({
    query,
    brand,
    sort,
    page,
    min_price,
    max_price,
  });

  res.json({
    status: 'success',
    endpoint: 'search_smartphones',
    params: { query, brand, sort: query ? undefined : sort, page, min_price, max_price },
    data,
  });
};

export const smartprixDetails = async (req: Request, res: Response): Promise<void> => {
  const slug = queryString(req.query.slug);
  if (!slug) throw badRequest('slug query parameter is required (e.g. /mobiles/samsung-galaxy-s25-ultra-ppd1p8z4fzt4)');

  const data = await smartprixClient.getSmartphoneDetails({ slug });
  res.json({
    status: 'success',
    endpoint: 'get_smartphone_details',
    slug,
    data,
  });
};

export const smartprixPriceHistory = async (req: Request, res: Response): Promise<void> => {
  const pid = queryString(req.query.pid);
  if (!pid) throw badRequest('pid query parameter is required (e.g. pd1p8z4fzt4)');
  const range = queryString(req.query.range);

  const data = await smartprixClient.getSmartphonePriceHistory({ pid, range });
  res.json({
    status: 'success',
    endpoint: 'get_smartphone_price_history',
    pid,
    range,
    data,
  });
};

export const smartprixBrands = async (_req: Request, res: Response): Promise<void> => {
  const data = await smartprixClient.listBrands();
  res.json({
    status: 'success',
    endpoint: 'list_brands',
    data,
  });
};

export const smartprixNormalize = async (req: Request, res: Response): Promise<void> => {
  let rawData = req.body?.rawData;
  const query = optionalString(req.body, 'query', { max: 120 });

  if (!rawData && query) {
    rawData = await smartprixClient.searchSmartphones({ query });
  }

  if (!rawData) {
    throw badRequest('Either rawData or query must be provided in request body');
  }

  const result = await groqNormalizer.normalizeWithGroq(rawData);
  res.json({
    status: 'success',
    ...result,
  });
};

