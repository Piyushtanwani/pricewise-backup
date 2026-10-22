import { execSync } from 'child_process';
import prisma from '../utils/prisma';

// Memory cache for quick lookups
const urlCache = new Map<string, string>();

/**
 * Resolves a Smartprix product or listing URL into a direct store URL (Amazon or Flipkart).
 * Uses fast curl scraping to extract the store tracking link and follows the HTTP 302 redirect.
 */
export const resolveDirectStoreUrl = async (
  rawUrl: string,
  storeName = 'Amazon',
  productName = '',
): Promise<string> => {
  if (!rawUrl) {
    return getFallbackStoreSearch(storeName, productName);
  }

  // Check if rawUrl is already a direct retailer URL (product page or search URL)
  if (
    rawUrl.includes('amazon.in') ||
    rawUrl.includes('amazon.com') ||
    rawUrl.includes('flipkart.com') ||
    rawUrl.includes('croma.com') ||
    rawUrl.includes('vijaysales.com') ||
    rawUrl.includes('reliancedigital.in')
  ) {
    return cleanDestinationUrl(rawUrl, productName);
  }

  // Check cache
  const cacheKey = `${rawUrl}::${storeName}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  // If already a tracking link (l.smartprix.com or linkredirect.in)
  if (rawUrl.includes('l.smartprix.com') || rawUrl.includes('linkredirect.in')) {
    try {
      const resp = await fetch(rawUrl, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const loc = resp.headers.get('location');
      if (loc) {
        const dest = cleanDestinationUrl(loc.trim());
        urlCache.set(cacheKey, dest);
        return dest;
      }
    } catch {
      try {
        const head = execSync(`curl -s -I "${rawUrl}"`, { maxBuffer: 1024 * 1024, timeout: 8000 }).toString('utf-8');
        const locMatch = head.match(/location:\s*([^\r\n]+)/i);
        if (locMatch) {
          const dest = cleanDestinationUrl(locMatch[1].trim());
          urlCache.set(cacheKey, dest);
          return dest;
        }
      } catch (err) {
        console.warn('[StoreRedirect] Failed to resolve tracking link:', err);
      }
    }
  }

  // If a Smartprix product page (e.g. smartprix.com/mobiles/...)
  if (rawUrl.includes('smartprix.com')) {
    try {
      const html = execSync(
        `curl -s -L "${rawUrl}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 10000 },
      ).toString('utf-8');

      // Try matching by store name first in table
      const storeTarget = storeName.toLowerCase();
      const trackingMatches = [...html.matchAll(/"trackingLink":"([^"]+)"/g)];

      for (const m of trackingMatches) {
        const link = m[1];
        try {
          const resp = await fetch(link, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
          const loc = resp.headers.get('location');
          if (loc) {
            const dest = cleanDestinationUrl(loc.trim());
            const destLower = dest.toLowerCase();

            if (
              (storeTarget.includes('flipkart') && destLower.includes('flipkart')) ||
              (storeTarget.includes('amazon') && destLower.includes('amazon')) ||
              (storeTarget.includes('croma') && destLower.includes('croma'))
            ) {
              urlCache.set(cacheKey, dest);
              return dest;
            }

            if (!urlCache.has(cacheKey) && (destLower.includes('amazon') || destLower.includes('flipkart'))) {
              urlCache.set(cacheKey, dest);
            }
          }
        } catch {
          // Continue to next link
        }
      }

      if (urlCache.has(cacheKey)) {
        return urlCache.get(cacheKey)!;
      }
    } catch (err) {
      console.warn('[StoreRedirect] Error scraping Smartprix page:', err);
    }
  }

  // Fallback to high-accuracy search on the retailer's store
  const fallback = getFallbackStoreSearch(storeName, productName);
  urlCache.set(cacheKey, fallback);
  return fallback;
};

/**
 * Clean up affiliate wrappers and extract true destination URL
 */
export const cleanDestinationUrl = (url: string, productName?: string): string => {
  // If wrapped in linkredirect / dl= query parameter
  if (url.includes('dl=')) {
    try {
      const parsed = new URL(url);
      const dl = parsed.searchParams.get('dl');
      if (dl) {
        let clean = decodeURIComponent(dl);
        clean = clean.replace(/^https?:\/\/dl\.flipkart\.com\/dl\//, 'https://www.flipkart.com/');
        return clean;
      }
    } catch {
      // Ignore URL parse error
    }
  }
  if (url.includes('dl.flipkart.com/dl/')) {
    return url.replace(/^https?:\/\/dl\.flipkart\.com\/dl\//, 'https://www.flipkart.com/');
  }

  // Handle placeholder / invalid Flipkart item URLs (avoids Flipkart E002 error)
  if (url.includes('flipkart.com') && url.includes('/p/itm_')) {
    const slugMatch = url.match(/flipkart\.com\/([^/]+)\/p\/itm_/i);
    const query = slugMatch ? slugMatch[1].replace(/-/g, ' ') : (productName || 'smartphone');
    return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
  }

  // Fix Vijay Sales search URLs falling back to refrigerator filters
  if (url.includes('vijaysales.com/search') && !url.includes('/p/')) {
    if (url.toLowerCase().includes('apple') || url.toLowerCase().includes('iphone')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=Apple';
    }
    if (url.toLowerCase().includes('samsung') || url.toLowerCase().includes('galaxy')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=Samsung';
    }
    if (url.toLowerCase().includes('oneplus')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=OnePlus';
    }
    return 'https://www.vijaysales.com/c/smartphones';
  }

  return url;
};

/**
 * Constructs direct retailer search URL as reliable fallback
 */
export const getFallbackStoreSearch = (storeName: string, productName: string): string => {
  const query = encodeURIComponent(productName || 'smartphone');
  const s = (storeName || '').toLowerCase();
  const prod = (productName || '').toLowerCase();

  if (s.includes('flipkart')) {
    return `https://www.flipkart.com/search?q=${query}`;
  }
  if (s.includes('croma')) {
    return `https://www.croma.com/searchB?q=${query}`;
  }
  if (s.includes('vijay')) {
    if (prod.includes('apple') || prod.includes('iphone')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=Apple';
    }
    if (prod.includes('samsung') || prod.includes('galaxy')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=Samsung';
    }
    if (prod.includes('oneplus')) {
      return 'https://www.vijaysales.com/c/smartphones?brand=OnePlus';
    }
    return 'https://www.vijaysales.com/c/smartphones';
  }
  return `https://www.amazon.in/s?k=${query}`;
};
