import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { badRequest, notFound } from '../utils/http';
import { optionalString, queryInt, queryList, queryString, requireString } from '../utils/validate';
import { providerStatus } from '../services/stores';
import { importFromStores, lastSyncSummary, searchStores, syncPrices } from '../services/priceSync';
import { refreshProductAggregates } from '../services/productService';

/** Public: which stores have live data. Never exposes credential values. */
export const getPublicStatus = (_req: Request, res: Response): void => {
  const last = lastSyncSummary();
  res.json({
    providers: providerStatus().map(({ id, store, configured }) => ({ id, store, configured })),
    lastSync: last ? { finishedAt: last.finishedAt, productsUpdated: last.productsUpdated } : null,
  });
};

export const getAdminStatus = (_req: Request, res: Response): void => {
  res.json({ providers: providerStatus(), lastSync: lastSyncSummary() });
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

/** Scrapes real smartphones and historical prices, storing them in PostgreSQL. */
export const scrapeAndStore = async (req: Request, res: Response): Promise<void> => {
  const limit = queryInt(req.body?.limit === undefined ? undefined : String(req.body.limit), 5, { min: 1, max: 20 });
  const { runPythonScraper, ingestScrapedProducts } = await import('../services/scraperService');
  
  const scraped = await runPythonScraper(limit);
  const ingested = await ingestScrapedProducts(scraped);

  res.json({
    status: 'success',
    scrapedCount: scraped.length,
    ingestedCount: ingested.length,
    products: ingested,
  });
};
