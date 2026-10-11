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

interface CacheEntry {
  data: SerpStoreRate[];
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

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
      directUrl: `https://www.vijaysales.com/search/${q}`,
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
): Promise<SerpStoreRate[]> => {
  if (!productName || !env.serpApiKey) return [];

  // Simplify search query
  const cleanQuery = productName
    .replace(/\(.*?\)/g, '')
    .replace(/\b5g\b/gi, '')
    .replace(/\b4g\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cacheKey = `${cleanQuery.toLowerCase()}::${(brandName || '').toLowerCase()}`;

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
    }[] = [];

    for (const item of shoppingResults) {
      let rawPrice = Number(item.extracted_price ?? item.price?.replace(/[^0-9.]/g, ''));
      if (!rawPrice || isNaN(rawPrice)) continue;

      const price = (item.price && item.price.includes('$')) ? Math.round(rawPrice * 86) : Math.round(rawPrice);
      if (price < minThreshold) continue;

      const title = (item.title || '').toLowerCase();
      const isAccessory = ACCESSORY_KEYWORDS.some((kw) => title.includes(kw));
      if (isAccessory) continue;

      // STRICT FILTER: Check if source matches Amazon, Flipkart, Croma, Vijay Sales, or official brand site
      const match = matchAllowedStore(item.source || '', brandName, productName);
      if (!match) continue; // Completely ignore any other website

      validOffers.push({
        storeKey: match.key,
        storeName: match.displayName,
        price,
        directUrl: match.directUrl,
        shipping: item.delivery && !item.delivery.toLowerCase().includes('₹') ? item.delivery : 'Free',
      });
    }

    // Sort by price ascending
    validOffers.sort((a, b) => a.price - b.price);

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

    const bestPrice = topOffers[0].price;

    const formatted: SerpStoreRate[] = topOffers.map((offer, index) => ({
      storeId: `serp_${offer.storeKey}_${index}`,
      store: offer.storeName,
      storeSlug: offer.storeKey,
      logoUrl: null,
      price: offer.price,
      mrp: estimatedPrice > offer.price ? Math.round(estimatedPrice * 1.15) : null,
      shipping: offer.shipping,
      availability: 'In Stock',
      diff: Math.round(offer.price - bestPrice),
      url: offer.directUrl,
      lastCheckedAt: new Date().toISOString(),
    }));

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
