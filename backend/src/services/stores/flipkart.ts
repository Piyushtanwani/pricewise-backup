/**
 * Flipkart Affiliate API v1.0 client.
 * Docs: https://affiliate.flipkart.com/api-docs/af_prod_ref.html
 */
import { env } from '../../config/env';
import { Throttle } from '../../utils/cache';
import { ProviderError, StoreOffer, StoreProvider, toPrice } from './types';

const REQUEST_TIMEOUT_MS = 10_000;
const throttle = new Throttle(250);

interface FlipkartMoney {
  amount?: number | string;
  currency?: string;
}

export interface FlipkartProduct {
  productBaseInfoV1?: {
    productId?: string;
    title?: string;
    productDescription?: string;
    imageUrls?: Record<string, string>;
    maximumRetailPrice?: FlipkartMoney;
    flipkartSellingPrice?: FlipkartMoney;
    flipkartSpecialPrice?: FlipkartMoney;
    productUrl?: string;
    productBrand?: string;
    inStock?: boolean;
    categoryPath?: string;
  };
  productShippingInfoV1?: { shippingCharges?: FlipkartMoney };
  categorySpecificInfoV1?: { keySpecs?: string[] };
}

interface FlipkartSearchResponse {
  products?: FlipkartProduct[];
  productInfoList?: FlipkartProduct[];
}

/** Picks the largest image from keys such as "200x200", "400x400", "unknown". */
const largestImage = (urls: Record<string, string> | undefined): string | null => {
  if (!urls) return null;
  const ranked = Object.entries(urls)
    .map(([size, url]) => {
      const [w, h] = size.split('x').map(Number);
      return { url, area: Number.isFinite(w) && Number.isFinite(h) ? w * h : 0 };
    })
    .sort((a, b) => b.area - a.area);
  return ranked[0]?.url ?? null;
};

const topCategory = (path: string | undefined): string | null => {
  const first = path?.split('>').map((s) => s.trim()).find(Boolean);
  return first ?? null;
};

export const normalizeFlipkartProduct = (product: FlipkartProduct): StoreOffer | null => {
  const base = product.productBaseInfoV1;
  const title = base?.title?.trim();
  if (!base?.productId || !title || !base.productUrl) return null;

  const special = toPrice(base.flipkartSpecialPrice?.amount);
  const selling = toPrice(base.flipkartSellingPrice?.amount);
  const price = special ?? selling;
  const mrp = toPrice(base.maximumRetailPrice?.amount);
  const shipping = product.productShippingInfoV1?.shippingCharges?.amount;

  return {
    provider: 'flipkart',
    externalId: base.productId,
    title,
    brand: base.productBrand?.trim() || null,
    category: topCategory(base.categoryPath),
    imageUrl: largestImage(base.imageUrls),
    productUrl: base.productUrl,
    price,
    mrp: mrp && price && mrp > price ? mrp : null,
    currency: base.flipkartSellingPrice?.currency ?? base.maximumRetailPrice?.currency ?? 'INR',
    inStock: base.inStock !== false && price !== null,
    shippingCost: shipping === undefined ? null : (toPrice(shipping) ?? 0),
    specs: (product.categorySpecificInfoV1?.keySpecs ?? []).slice(0, 6),
  };
};

const get = <T>(path: string, params: Record<string, string>): Promise<T> =>
  throttle.run(async () => {
    const url = `${env.flipkart.baseUrl}/${path}?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url, {
      headers: {
        'Fk-Affiliate-Id': env.flipkart.affiliateId,
        'Fk-Affiliate-Token': env.flipkart.affiliateToken,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 200);
      throw new ProviderError('flipkart', `${path} failed (${res.status}): ${text || res.statusText}`, res.status);
    }
    return (await res.json()) as T;
  });

export const flipkartProvider: StoreProvider = {
  id: 'flipkart',
  storeSlug: 'flipkart',
  storeName: 'Flipkart',

  missingConfig() {
    const missing: string[] = [];
    if (!env.flipkart.affiliateId) missing.push('FLIPKART_AFFILIATE_ID');
    if (!env.flipkart.affiliateToken) missing.push('FLIPKART_AFFILIATE_TOKEN');
    return missing;
  },

  isConfigured() {
    return this.missingConfig().length === 0;
  },

  async search(query, limit) {
    const body = await get<FlipkartSearchResponse>('search.json', {
      query,
      resultCount: String(Math.min(10, Math.max(1, limit))),
    });
    const items = body.products ?? body.productInfoList ?? [];
    return items.map(normalizeFlipkartProduct).filter((o): o is StoreOffer => o !== null);
  },

  async getOffers(externalIds) {
    const offers: StoreOffer[] = [];
    for (const id of externalIds) {
      try {
        const body = await get<FlipkartProduct>('product.json', { id });
        const offer = normalizeFlipkartProduct(body);
        if (offer) offers.push(offer);
      } catch (err) {
        // A delisted product returns 4xx; skip it instead of failing the whole batch.
        if (err instanceof ProviderError && err.status && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          continue;
        }
        throw err;
      }
    }
    return offers;
  },
};
