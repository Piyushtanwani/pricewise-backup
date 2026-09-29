/**
 * Amazon Creators API client (the successor to PA-API 5.0, which was retired on 15 May 2026).
 * Auth is OAuth 2.0 client credentials; India (www.amazon.in) uses the EU token endpoint.
 * Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
 */
import { env } from '../../config/env';
import { Throttle } from '../../utils/cache';
import { ProviderError, StoreOffer, StoreProvider, toPrice } from './types';

const RESOURCES = [
  'images.primary.large',
  'itemInfo.title',
  'itemInfo.byLineInfo',
  'itemInfo.features',
  'itemInfo.classifications',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'offersV2.listings.isBuyBoxWinner',
];

const MAX_ITEMS_PER_REQUEST = 10;
const REQUEST_TIMEOUT_MS = 10_000;
// New Creators API accounts start with a low TPS allowance; stay just under 1 request/second.
const throttle = new Throttle(1100);

interface AmazonMoney {
  amount?: number | string;
  currency?: string;
}

interface AmazonListing {
  isBuyBoxWinner?: boolean;
  price?: { money?: AmazonMoney; savingBasis?: { money?: AmazonMoney } };
  availability?: { type?: string };
}

export interface AmazonItem {
  asin?: string;
  detailPageURL?: string;
  images?: { primary?: Record<string, { url?: string } | undefined> };
  itemInfo?: {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string }; manufacturer?: { displayValue?: string } };
    features?: { displayValues?: string[] };
    classifications?: { productGroup?: { displayValue?: string }; binding?: { displayValue?: string } };
  };
  offersV2?: { listings?: AmazonListing[] };
}

interface AmazonResponse {
  searchResult?: { items?: AmazonItem[] };
  itemResults?: { items?: AmazonItem[] };
  itemsResult?: { items?: AmazonItem[] };
  errors?: { code?: string; message?: string }[];
}

const IN_STOCK_TYPES = new Set(['IN_STOCK', 'IN_STOCK_SCARCE', 'PREORDER', 'AVAILABLE_DATE']);

export const normalizeAmazonItem = (item: AmazonItem): StoreOffer | null => {
  const title = item.itemInfo?.title?.displayValue?.trim();
  if (!item.asin || !title) return null;

  const listings = item.offersV2?.listings ?? [];
  const listing = listings.find((l) => l.isBuyBoxWinner) ?? listings[0];
  const price = toPrice(listing?.price?.money?.amount);
  const savingBasis = toPrice(listing?.price?.savingBasis?.money?.amount);
  const availability = listing?.availability?.type?.toUpperCase();
  const primary = item.images?.primary ?? {};

  return {
    provider: 'amazon',
    externalId: item.asin,
    title,
    brand:
      item.itemInfo?.byLineInfo?.brand?.displayValue?.trim() ||
      item.itemInfo?.byLineInfo?.manufacturer?.displayValue?.trim() ||
      null,
    category: item.itemInfo?.classifications?.productGroup?.displayValue?.trim() || null,
    imageUrl: primary.large?.url ?? primary.medium?.url ?? primary.small?.url ?? null,
    productUrl: item.detailPageURL ?? `https://${env.amazon.marketplace}/dp/${item.asin}`,
    price,
    mrp: savingBasis && price && savingBasis > price ? savingBasis : null,
    currency: listing?.price?.money?.currency ?? 'INR',
    inStock: price !== null && (availability === undefined || IN_STOCK_TYPES.has(availability)),
    shippingCost: null,
    specs: (item.itemInfo?.features?.displayValues ?? []).slice(0, 6),
  };
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const getAccessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch(env.amazon.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.amazon.clientId,
      client_secret: env.amazon.clientSecret,
      scope: 'creatorsapi::default',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new ProviderError('amazon', `Token request failed: ${body.error_description ?? body.error ?? res.statusText}`, res.status);
  }
  // Refresh a minute early so in-flight requests never carry an expired token.
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
  return cachedToken.value;
};

const call = async (operation: 'searchItems' | 'getItems', payload: Record<string, unknown>): Promise<AmazonResponse> =>
  throttle.run(async () => {
    const token = await getAccessToken();
    const res = await fetch(`${env.amazon.baseUrl}/catalog/v1/${operation}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-marketplace': env.amazon.marketplace,
      },
      body: JSON.stringify({
        ...payload,
        partnerTag: env.amazon.partnerTag,
        marketplace: env.amazon.marketplace,
        resources: RESOURCES,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as AmazonResponse;
    if (res.status === 401) cachedToken = null;
    if (!res.ok) {
      const detail = body.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') || res.statusText;
      throw new ProviderError('amazon', `${operation} failed (${res.status}): ${detail}`, res.status);
    }
    return body;
  });

export const amazonProvider: StoreProvider = {
  id: 'amazon',
  storeSlug: 'amazon',
  storeName: 'Amazon',

  missingConfig() {
    const missing: string[] = [];
    if (!env.amazon.clientId) missing.push('AMAZON_CREATORS_CLIENT_ID');
    if (!env.amazon.clientSecret) missing.push('AMAZON_CREATORS_CLIENT_SECRET');
    if (!env.amazon.partnerTag) missing.push('AMAZON_PARTNER_TAG');
    return missing;
  },

  isConfigured() {
    return this.missingConfig().length === 0;
  },

  async search(query, limit) {
    const body = await call('searchItems', {
      keywords: query,
      itemCount: Math.min(MAX_ITEMS_PER_REQUEST, Math.max(1, limit)),
    });
    return (body.searchResult?.items ?? []).map(normalizeAmazonItem).filter((o): o is StoreOffer => o !== null);
  },

  async getOffers(externalIds) {
    const offers: StoreOffer[] = [];
    for (let i = 0; i < externalIds.length; i += MAX_ITEMS_PER_REQUEST) {
      const body = await call('getItems', {
        itemIds: externalIds.slice(i, i + MAX_ITEMS_PER_REQUEST),
        itemIdType: 'ASIN',
      });
      const items = body.itemResults?.items ?? body.itemsResult?.items ?? [];
      offers.push(...items.map(normalizeAmazonItem).filter((o): o is StoreOffer => o !== null));
    }
    return offers;
  },
};
