import { env } from '../config/env';

export interface SerpStoreRate {
  storeId: string;
  store: string;
  storeSlug: string;
  logoUrl?: string | null;
  price: number;
  mrp: number | null;
  shipping: string;
  availability: string;
  diff: number;
  url: string;
  lastCheckedAt?: string;
}

// In-memory cache to ensure extreme speed and preserve SerpApi credits
interface CacheEntry {
  data: SerpStoreRate[];
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

// Clean store names for clean UI display
const normalizeStoreName = (rawSource: string): string => {
  if (!rawSource) return 'Online Store';
  const s = rawSource.trim();
  const lower = s.toLowerCase();
  if (lower.includes('amazon')) return 'Amazon';
  if (lower.includes('flipkart')) return 'Flipkart';
  if (lower.includes('croma')) return 'Croma';
  if (lower.includes('reliance')) return 'Reliance Digital';
  if (lower.includes('zepto')) return 'Zepto';
  if (lower.includes('blinkit')) return 'Blinkit';
  if (lower.includes('cashify')) return 'Cashify';
  if (lower.includes('vijay')) return 'Vijay Sales';
  if (lower.includes('motorola')) return 'Motorola India';
  if (lower.includes('apple')) return 'Apple Store';
  if (lower.includes('samsung')) return 'Samsung Shop';
  if (lower.includes('tatacliq') || lower.includes('tata cliq')) return 'Tata CLiQ';
  if (lower.includes('poorvika')) return 'Poorvika';
  if (lower.includes('sangeetha')) return 'Sangeetha Mobiles';
  return s.replace(/\.(com|in|org|net)$/i, '');
};

const ACCESSORY_KEYWORDS = [
  'case',
  'cover',
  'back cover',
  'skin',
  'tempered',
  'glass',
  'protector',
  'charger',
  'cable',
  'pouch',
  'adapter',
  'strap',
  'holder',
  'stand',
  'lens',
  'wrap',
  'guard',
];

export const getLiveSerpStorePrices = async (
  productName: string,
  basePrice?: number | null,
): Promise<SerpStoreRate[]> => {
  if (!productName || !env.serpApiKey) return [];

  // Simplify search query (e.g. remove "(12GB RAM + 256GB)", "5G", etc. for best Indian store matching)
  const cleanQuery = productName
    .replace(/\(.*?\)/g, '')
    .replace(/\b5g\b/gi, '')
    .replace(/\b4g\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cacheKey = cleanQuery.toLowerCase();

  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_shopping');
    url.searchParams.set('q', cleanQuery);
    url.searchParams.set('location', 'India');
    url.searchParams.set('gl', 'in');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', env.serpApiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    console.log(`[SerpShoppingService] Fetching Google Shopping prices for: "${cleanQuery}"`);
    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[SerpShoppingService] SerpApi responded with HTTP ${response.status}`);
      return [];
    }

    const data: any = await response.json();
    const shoppingResults: any[] = data?.shopping_results || [];
    console.log(`[SerpShoppingService] Received ${shoppingResults.length} items from SerpApi`);

    if (!Array.isArray(shoppingResults) || shoppingResults.length === 0) {
      return [];
    }

    // Minimum price filter to avoid phone cases/covers/accessories
    const estimatedPrice = typeof basePrice === 'number' && basePrice > 0 ? basePrice : 15000;
    const minThreshold = Math.max(3000, estimatedPrice * 0.35);

    const validOffers: {
      storeName: string;
      price: number;
      url: string;
      shipping: string;
      title: string;
    }[] = [];

    for (const item of shoppingResults) {
      let rawPrice = Number(item.extracted_price ?? item.price?.replace(/[^0-9.]/g, ''));
      if (!rawPrice || isNaN(rawPrice)) continue;

      // If price was returned in USD ($), convert to approx INR (x86)
      const price = (item.price && item.price.includes('$')) ? Math.round(rawPrice * 86) : Math.round(rawPrice);
      if (price < minThreshold) continue;

      const title = (item.title || '').toLowerCase();
      const isAccessory = ACCESSORY_KEYWORDS.some((kw) => title.includes(kw));
      if (isAccessory) continue;

      const storeName = normalizeStoreName(item.source || '');
      const itemUrl = item.product_link || item.link || '';
      if (!itemUrl) continue;

      validOffers.push({
        storeName,
        price: Math.round(price),
        url: itemUrl,
        shipping: item.delivery && !item.delivery.toLowerCase().includes('₹') ? item.delivery : 'Free',
        title: item.title,
      });
    }

    console.log(`[SerpShoppingService] validOffers count: ${validOffers.length}`);

    // Sort by price ascending
    validOffers.sort((a, b) => a.price - b.price);

    // Keep unique stores (or up to 1 best rate per store name)
    const seenStores = new Set<string>();
    const topOffers: typeof validOffers = [];

    for (const offer of validOffers) {
      if (!seenStores.has(offer.storeName)) {
        seenStores.add(offer.storeName);
        topOffers.push(offer);
        if (topOffers.length >= 6) break;
      }
    }

    console.log(`[SerpShoppingService] topOffers count: ${topOffers.length}`);
    if (topOffers.length === 0) return [];

    const bestPrice = topOffers[0].price;

    const formatted: SerpStoreRate[] = topOffers.map((offer, index) => ({
      storeId: `serp_${offer.storeName.toLowerCase().replace(/\s+/g, '_')}_${index}`,
      store: offer.storeName,
      storeSlug: offer.storeName.toLowerCase().replace(/\s+/g, '-'),
      logoUrl: null,
      price: offer.price,
      mrp: estimatedPrice > offer.price ? Math.round(estimatedPrice * 1.15) : null,
      shipping: offer.shipping,
      availability: 'In Stock',
      diff: Math.round(offer.price - bestPrice),
      url: offer.url,
      lastCheckedAt: new Date().toISOString(),
    }));

    // Cache in memory for fast subsequent loads
    memoryCache.set(cacheKey, {
      data: formatted,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return formatted;
  } catch (err: any) {
    console.error('[SerpShoppingService] Error fetching live prices:', err?.message || err);
    return [];
  }
};
