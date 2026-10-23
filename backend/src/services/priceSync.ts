import prisma from '../utils/prisma';
import { HttpError } from '../utils/http';
import { TtlCache, livePriceCache } from '../utils/cache';
import { parsePrice, evaluateStockStatus } from '../utils/priceNormalizer';
import { evaluatePriceChange } from './alertEngine';
import { MATCH_THRESHOLD, titleSimilarity } from './matching';
import { isExactProductMatch } from '../utils/productMatcher';
import { sanitizeRetailerUrl } from '../utils/urlSanitizer';
import { refreshProductAggregates } from './productService';
import { ProviderId, StoreOffer, StoreProvider, configuredProviders, providers } from './stores';
import { clearMarketIntelligenceCache } from './marketIntelligenceService';

export interface ProviderSyncResult {
  provider: ProviderId;
  configured: boolean;
  checked: number;
  updated: number;
  notFound: number;
  error?: string;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  providers: ProviderSyncResult[];
  productsUpdated: number;
  notificationsCreated: number;
}

let lastSync: SyncSummary | null = null;
let syncInFlight: Promise<SyncSummary> | null = null;

export const lastSyncSummary = () => lastSync;

const ensureStore = (provider: StoreProvider) =>
  prisma.store.upsert({
    where: { slug: provider.storeSlug },
    update: {},
    create: { name: provider.storeName, slug: provider.storeSlug },
  });

const applyAggregatesAndAlerts = async (productIds: Iterable<string>): Promise<number> => {
  let notifications = 0;
  for (const productId of productIds) {
    const { previousBest, bestPrice } = await refreshProductAggregates(productId);
    if (bestPrice !== null) notifications += await evaluatePriceChange(productId, previousBest, bestPrice);
  }
  clearMarketIntelligenceCache();
  await livePriceCache.invalidatePattern('serp_live::*');
  return notifications;
};

const recordOffer = async (listingId: string, offer: StoreOffer, current: { mrp: number | null; shippingCost: number }) => {
  const now = new Date();
  const cleanPrice = parsePrice(offer.price);
  const stock = evaluateStockStatus(offer.inStock);
  if (cleanPrice <= 0 || !stock.inStock) {
    await prisma.productStore.update({
      where: { id: listingId },
      data: { stockStatus: 'OUT_OF_STOCK', lastCheckedAt: now },
    });
    return;
  }
  await prisma.productStore.update({
    where: { id: listingId },
    data: {
      currentPrice: cleanPrice,
      mrp: offer.mrp ? parsePrice(offer.mrp) : current.mrp,
      currency: offer.currency,
      stockStatus: stock.stockStatus,
      shippingCost: offer.shippingCost ?? current.shippingCost,
      productUrl: sanitizeRetailerUrl(offer.productUrl, offer.provider),
      lastCheckedAt: now,
      priceHistory: { create: { price: cleanPrice, currency: offer.currency, timestamp: now } },
    },
  });
};

/**
 * Execute an async operation with exponential backoff on transient errors (429, 503, timeouts)
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  initialDelayMs = 1000,
  context = 'priceSync',
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isTransient =
        err?.status === 429 ||
        err?.statusCode === 429 ||
        err?.status === 503 ||
        err?.statusCode === 503 ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        err?.name === 'AbortError' ||
        (typeof err?.message === 'string' &&
          (err.message.includes('429') ||
            err.message.includes('503') ||
            err.message.includes('rate limit') ||
            err.message.includes('timeout')));

      if (attempt >= retries || !isTransient) {
        throw err;
      }
      const backoff = initialDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[${context}] Transient error (attempt ${attempt}/${retries}): ${err?.message || err}. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  return fn();
}

/**
 * Refreshes prices for every listing that is linked to a store identifier (ASIN / FSN)
 * on a configured provider. Unconfigured providers are reported and skipped.
 */
const runSync = async (opts: { productId?: string }): Promise<SyncSummary> => {
  const startedAt = new Date().toISOString();
  const results: ProviderSyncResult[] = [];
  const affected = new Set<string>();

  for (const provider of providers) {
    const result: ProviderSyncResult = { provider: provider.id, configured: provider.isConfigured(), checked: 0, updated: 0, notFound: 0 };
    results.push(result);
    if (!result.configured) continue;

    const listings = await prisma.productStore.findMany({
      where: {
        store: { slug: provider.storeSlug },
        externalId: { not: null },
        ...(opts.productId ? { productId: opts.productId } : {}),
      },
    });
    result.checked = listings.length;
    if (listings.length === 0) continue;

    try {
      const offers = await executeWithRetry(
        () => provider.getOffers(listings.map((l) => l.externalId!)),
        3,
        1000,
        `ProviderSync:${provider.id}`,
      );
      const byId = new Map(offers.map((o) => [o.externalId, o]));
      for (const listing of listings) {
        const offer = byId.get(listing.externalId!);
        if (!offer) {
          result.notFound++;
          // Stale listing ghost-price protection: If an offer is no longer found and the listing
          // was last checked more than 48 hours ago, mark OUT_OF_STOCK rather than retaining old ghost prices indefinitely
          const daysSinceLastCheck = (Date.now() - new Date(listing.lastCheckedAt).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastCheck > 2 && listing.stockStatus !== 'OUT_OF_STOCK') {
            await prisma.productStore.update({
              where: { id: listing.id },
              data: { stockStatus: 'OUT_OF_STOCK', lastCheckedAt: new Date() },
            });
            affected.add(listing.productId);
          }
          continue;
        }
        await recordOffer(listing.id, offer, listing);
        result.updated++;
        affected.add(listing.productId);
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`Price sync failed for ${provider.id}:`, result.error);
    }
  }

  const notificationsCreated = await applyAggregatesAndAlerts(affected);
  lastSync = {
    startedAt,
    finishedAt: new Date().toISOString(),
    providers: results,
    productsUpdated: affected.size,
    notificationsCreated,
  };
  return lastSync;
};

/** Runs a sync, or joins the one already running so overlapping triggers never double-write history. */
export const syncPrices = (opts: { productId?: string } = {}): Promise<SyncSummary> => {
  if (!syncInFlight) {
    syncInFlight = runSync(opts).finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
};

const selectProviders = (ids?: string[]): StoreProvider[] => {
  const configured = configuredProviders();
  const selected = ids?.length ? configured.filter((p) => ids.includes(p.id)) : configured;
  if (selected.length === 0) {
    const missing = providers
      .filter((p) => !ids?.length || ids.includes(p.id))
      .map((p) => `${p.storeName}: ${p.missingConfig().join(', ') || 'configured'}`);
    throw new HttpError(503, 'No configured store providers for this request. Add the API credentials to backend/.env.', missing);
  }
  return selected;
};

export interface LiveSearchResult {
  provider: ProviderId;
  store: string;
  offers: StoreOffer[];
  error?: string;
}

const liveCache = new TtlCache<StoreOffer[]>(30 * 1000); // 30s debounce for real-time live price comparison

/** Queries the store APIs directly without persisting anything (results cached for 10 minutes). */
export const searchStores = async (query: string, limit: number, providerIds?: string[]): Promise<LiveSearchResult[]> => {
  const selected = selectProviders(providerIds);
  return Promise.all(
    selected.map(async (provider): Promise<LiveSearchResult> => {
      const key = `${provider.id}:${limit}:${query.toLowerCase()}`;
      try {
        let offers = liveCache.get(key);
        if (!offers) {
          offers = await provider.search(query, limit);
          liveCache.set(key, offers);
        }
        return { provider: provider.id, store: provider.storeName, offers };
      } catch (err) {
        return { provider: provider.id, store: provider.storeName, offers: [], error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
};

const findMatchingProduct = async (offer: StoreOffer) => {
  if (!offer.brand) return null;
  const candidates = await prisma.product.findMany({
    where: { brand: { equals: offer.brand, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 500,
  });
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    if (!isExactProductMatch(c.name, offer.title, 0.45) && titleSimilarity(offer.title, c.name, offer.brand) < 0.8) {
      continue;
    }
    const score = titleSimilarity(offer.title, c.name, offer.brand);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best;
};

const createProductFromOffer = (offer: StoreOffer, category?: string) => {
  const chips = offer.specs.filter((s) => s.length <= 40).slice(0, 4);
  const longSpecs = offer.specs.filter((s) => s.length > 40);
  return prisma.product.create({
    data: {
      name: offer.title.slice(0, 250),
      brand: offer.brand ?? 'Unknown',
      category: category ?? offer.category ?? 'Uncategorized',
      imageUrl: offer.imageUrl,
      mrp: offer.mrp,
      specs: chips,
      description: longSpecs.length ? longSpecs.join('\n') : null,
    },
  });
};

export interface ImportedListing {
  provider: ProviderId;
  externalId: string;
  title: string;
  productId: string;
  action: 'created' | 'linked' | 'updated';
}

/**
 * Searches the configured stores and stores the results: listings already known by ASIN/FSN
 * are updated, titles that match an existing product are linked to it, anything else becomes
 * a new product.
 */
export const importFromStores = async (
  query: string,
  opts: { providers?: string[]; limit?: number; category?: string } = {},
) => {
  const results = await searchStores(query, opts.limit ?? 10, opts.providers);
  const imported: ImportedListing[] = [];
  const affected = new Set<string>();

  for (const result of results) {
    const provider = providers.find((p) => p.id === result.provider)!;
    if (result.error) continue;
    const store = await ensureStore(provider);

    for (const offer of result.offers) {
      if (offer.price === null) continue;

      const known = await prisma.productStore.findUnique({
        where: { storeId_externalId: { storeId: store.id, externalId: offer.externalId } },
      });
      let productId = known?.productId;
      let action: ImportedListing['action'] = 'updated';
      if (!productId) {
        const match = await findMatchingProduct(offer);
        if (match) {
          productId = match.id;
          action = 'linked';
        } else {
          productId = (await createProductFromOffer(offer, opts.category)).id;
          action = 'created';
        }
      }

      const listing = await prisma.productStore.upsert({
        where: { productId_storeId: { productId, storeId: store.id } },
        update: { externalId: offer.externalId },
        create: {
          productId,
          storeId: store.id,
          externalId: offer.externalId,
          productUrl: sanitizeRetailerUrl(offer.productUrl, offer.provider),
          currentPrice: parsePrice(offer.price),
          mrp: offer.mrp ? parsePrice(offer.mrp) : null,
        },
      });
      await recordOffer(listing.id, offer, listing);

      affected.add(productId);
      imported.push({ provider: provider.id, externalId: offer.externalId, title: offer.title, productId, action });
    }
  }

  const notificationsCreated = await applyAggregatesAndAlerts(affected);
  return {
    query,
    providers: results.map((r) => ({ provider: r.provider, found: r.offers.length, error: r.error })),
    imported,
    notificationsCreated,
  };
};
