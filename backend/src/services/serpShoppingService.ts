import { env } from '../config/env';
import { titleSimilarity, MATCH_THRESHOLD } from './matching';
import { parsePrice, evaluateStockStatus, normalizeStoreOffer } from '../utils/priceNormalizer';
import { isExactProductMatch } from '../utils/productMatcher';
import { sanitizeRetailerUrl } from '../utils/urlSanitizer';
import { livePriceCache } from '../utils/cache';
import { cleanDestinationUrl } from './storeRedirectService';

export { normalizeStoreOffer, isExactProductMatch, sanitizeRetailerUrl };

export interface SerpStoreRate {
  storeId: string;
  store: string;
  storeSlug: string;
  logoUrl?: string | null;
  price: number;
  mrp: number | null;
  shipping: string;
  availability: string;
  stockStatus: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
  diff: number;
  url: string;
  lastCheckedAt?: string;
}

/**
 * Extracts stock availability from SerpApi Google Shopping item attributes,
 * safely evaluating string and boolean availability flags.
 */
export const parseStockStatus = (
  item: any,
): { availability: string; stockStatus: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK' } => {
  if (item?.in_stock !== undefined) {
    const evaluated = evaluateStockStatus(item.in_stock);
    if (!evaluated.inStock) {
      return { availability: 'Out of Stock', stockStatus: 'OUT_OF_STOCK' };
    }
  }

  const text = [
    item?.availability,
    item?.delivery,
    item?.tag,
    item?.snippet,
    Array.isArray(item?.extensions) ? item.extensions.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');

  const evaluated = evaluateStockStatus(text, true);
  return {
    availability: evaluated.availability,
    stockStatus: evaluated.stockStatus,
  };
};


/**
 * Resolves direct offer link from Google Shopping, unwrapping Google redirect if present
 */
export const resolveOfferUrl = (rawLink: string | undefined, fallbackUrl: string, storeName = ''): string => {
  if (!rawLink || typeof rawLink !== 'string') return sanitizeRetailerUrl(fallbackUrl, storeName);
  const trimmed = rawLink.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return sanitizeRetailerUrl(fallbackUrl, storeName);
  }

  let dest = trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('google.')) {
      const target = parsed.searchParams.get('url') || parsed.searchParams.get('q') || parsed.searchParams.get('adurl');
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        dest = target;
      }
    }
  } catch {
    // Ignore URL parse errors and return trimmed
  }
  const cleaned = cleanDestinationUrl(dest);
  return sanitizeRetailerUrl(cleaned, storeName);
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

export interface AllowedStoreMatch {
  key: 'amazon' | 'flipkart' | 'croma' | 'vijay_sales' | 'brand';
  displayName: string;
  directUrl: string;
}

/**
 * STRICT STORE MATCHER:
 * Only permits:
 * 1. Amazon
 * 2. Flipkart
 * 3. Croma
 * 4. Vijay Sales
 * 5. Official Brand Website for the phone's brand (e.g. OnePlus, Apple, Samsung, Motorola, etc.)
 * Strictly rejects all third-party sites (no FoneZone, no Budli, no Cashify, no Etoren, etc.).
 */
export const matchAllowedStore = (
  rawSource: string,
  brandName: string,
  productName: string,
): AllowedStoreMatch | null => {
  if (!rawSource) return null;
  const s = rawSource.toLowerCase().trim();
  const brand = (brandName || '').toLowerCase().trim();
  const cleanName = productName.replace(/\(.*?\)/g, '').trim();
  const q = encodeURIComponent(cleanName);

  // 1. Amazon
  if (s.includes('amazon')) {
    return {
      key: 'amazon',
      displayName: 'Amazon',
      directUrl: `https://www.amazon.in/s?k=${q}`,
    };
  }

  // 2. Flipkart
  if (s.includes('flipkart')) {
    return {
      key: 'flipkart',
      displayName: 'Flipkart',
      directUrl: `https://www.flipkart.com/search?q=${q}`,
    };
  }

  // 3. Croma
  if (s.includes('croma')) {
    return {
      key: 'croma',
      displayName: 'Croma',
      directUrl: `https://www.croma.com/searchB?q=${q}`,
    };
  }

  // 4. Vijay Sales
  if (s.includes('vijay') || s.includes('vijaysales')) {
    return {
      key: 'vijay_sales',
      displayName: 'Vijay Sales',
      directUrl: `https://www.vijaysales.com/search?q=${q}`,
    };
  }

  // 5. Official Brand Store
  if (brand && (s.includes(brand) || (brand === 'apple' && s.includes('apple')))) {
    if (brand.includes('apple')) {
      return {
        key: 'brand',
        displayName: 'Apple Store',
        directUrl: 'https://www.apple.com/in/shop/buy-iphone',
      };
    }
    if (brand.includes('oneplus')) {
      return {
        key: 'brand',
        displayName: 'OnePlus',
        directUrl: `https://www.oneplus.in/search?keyword=${q}`,
      };
    }
    if (brand.includes('samsung')) {
      return {
        key: 'brand',
        displayName: 'Samsung Shop',
        directUrl: `https://www.samsung.com/in/search/?searchvalue=${q}`,
      };
    }
    if (brand.includes('motorola')) {
      return {
        key: 'brand',
        displayName: 'Motorola India',
        directUrl: `https://www.motorola.in/search?q=${q}`,
      };
    }
    if (brand.includes('xiaomi') || brand.includes('mi') || brand.includes('redmi')) {
      return {
        key: 'brand',
        displayName: 'Mi Store',
        directUrl: `https://www.mi.com/in/search/${q}`,
      };
    }
    if (brand.includes('vivo')) {
      return {
        key: 'brand',
        displayName: 'Vivo Store',
        directUrl: `https://shop.vivo.com/in/search?keyword=${q}`,
      };
    }
    if (brand.includes('realme')) {
      return {
        key: 'brand',
        displayName: 'Realme Store',
        directUrl: `https://buy.realme.com/in/search?keyword=${q}`,
      };
    }
    if (brand.includes('oppo')) {
      return {
        key: 'brand',
        displayName: 'Oppo Store',
        directUrl: `https://www.oppo.com/in/search/?q=${q}`,
      };
    }
    if (brand.includes('google')) {
      return {
        key: 'brand',
        displayName: 'Google Store',
        directUrl: `https://store.google.com/in/search?q=${q}`,
      };
    }
  }

  // Strictly NOT allowed: skip all other websites
  return null;
};

export const getLiveSerpStorePrices = async (
  productName: string,
  brandName = '',
  basePrice?: number | null,
  forceRefresh = false,
): Promise<SerpStoreRate[]> => {
  if (!productName || !env.serpApiKey) return [];

  // Simplify search query
  const cleanQuery = productName
    .replace(/\(.*?\)/g, '')
    .replace(/\b5g\b/gi, '')
    .replace(/\b4g\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cacheKey = `serp_live::${cleanQuery.toLowerCase()}::${(brandName || '').toLowerCase()}`;

  if (!forceRefresh) {
    const cached = await livePriceCache.get<SerpStoreRate[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } else {
    await livePriceCache.evict(cacheKey);
    await livePriceCache.invalidatePattern(`serp_live::${cleanQuery.toLowerCase()}*`);
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

    if (!Array.isArray(shoppingResults) || shoppingResults.length === 0) {
      return [];
    }

    // Minimum price filter to avoid phone cases/covers/accessories
    const estimatedPrice = typeof basePrice === 'number' && basePrice > 0 ? basePrice : 15000;
    const minThreshold = Math.max(3000, estimatedPrice * 0.35);

    const validOffers: {
      storeKey: string;
      storeName: string;
      price: number;
      directUrl: string;
      shipping: string;
      availability: string;
      stockStatus: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
    }[] = [];

    for (const item of shoppingResults) {
      // Robust normalized price parsing
      const price = parsePrice(item.extracted_price ?? item.price, { minThreshold });
      if (!price || price < minThreshold) continue;

      // Price tolerance check against catalog base price (prevent mismatched luxury items or accessories)
      if (typeof basePrice === 'number' && basePrice > 0) {
        if (price < basePrice * 0.65 || price > basePrice * 1.35) {
          continue;
        }
      }

      const rawTitle = String(item.title || '');
      const title = rawTitle.toLowerCase();
      const isAccessory = ACCESSORY_KEYWORDS.some((kw) => title.includes(kw));
      if (isAccessory) continue;

      // STRICT MODEL MATCH: Ensure the retailer product title actually matches the requested phone
      const sim = titleSimilarity(rawTitle, productName, brandName);
      if (sim < MATCH_THRESHOLD) {
        continue;
      }

      // STRICT FILTER: Check if source matches Amazon, Flipkart, Croma, Vijay Sales, or official brand site
      const match = matchAllowedStore(item.source || '', brandName, productName);
      if (!match) continue; // Completely ignore any other website

      const stock = parseStockStatus(item);
      const offerUrl = resolveOfferUrl(item.link || item.product_link, match.directUrl, match.displayName);

      validOffers.push({
        storeKey: match.key,
        storeName: match.displayName,
        price,
        directUrl: offerUrl,
        shipping: item.delivery && !item.delivery.toLowerCase().includes('₹') ? item.delivery : 'Free',
        availability: stock.availability,
        stockStatus: stock.stockStatus,
      });
    }

    // Sort: In Stock first, then ascending by price
    validOffers.sort((a, b) => {
      const aOut = a.stockStatus === 'OUT_OF_STOCK' ? 1 : 0;
      const bOut = b.stockStatus === 'OUT_OF_STOCK' ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      return a.price - b.price;
    });

    // Keep best rate for each unique store
    const seenStores = new Set<string>();
    const topOffers: typeof validOffers = [];

    for (const offer of validOffers) {
      if (!seenStores.has(offer.storeKey)) {
        seenStores.add(offer.storeKey);
        topOffers.push(offer);
        if (topOffers.length >= 6) break;
      }
    }

    if (topOffers.length === 0) return [];

    const bestInStock = topOffers.find((o) => o.stockStatus !== 'OUT_OF_STOCK') || topOffers[0];
    const bestPrice = bestInStock.price;

    const formatted: SerpStoreRate[] = topOffers.map((offer, index) => ({
      storeId: `serp_${offer.storeKey}_${index}`,
      store: offer.storeName,
      storeSlug: offer.storeKey,
      logoUrl: null,
      price: offer.price,
      mrp: estimatedPrice > offer.price ? Math.round(estimatedPrice * 1.15) : null,
      shipping: offer.shipping,
      availability: offer.availability,
      stockStatus: offer.stockStatus,
      diff: Math.max(0, Math.round(offer.price - bestPrice)),
      url: offer.directUrl,
      lastCheckedAt: new Date().toISOString(),
    }));

    await livePriceCache.set(cacheKey, formatted, 30); // 30s TTL for real-time responsiveness

    return formatted;
  } catch (err: any) {
    console.error('[SerpShoppingService] Error fetching live prices:', err?.message || err);
    return [];
  }
};
