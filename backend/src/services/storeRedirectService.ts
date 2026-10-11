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

  // Already a direct retailer URL
  if (
    rawUrl.includes('amazon.in') ||
    rawUrl.includes('amazon.com') ||
    rawUrl.includes('flipkart.com') ||
    rawUrl.includes('croma.com')
  ) {
    return rawUrl;
  }

  // Check cache
  const cacheKey = `${rawUrl}::${storeName}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  // If already a tracking link (l.smartprix.com)
  if (rawUrl.includes('l.smartprix.com')) {
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
          const head = execSync(`curl -s -I "${link}"`, { maxBuffer: 1024 * 1024, timeout: 6000 }).toString('utf-8');
          const locMatch = head.match(/location:\s*([^\r\n]+)/i);
          if (locMatch) {
            const dest = cleanDestinationUrl(locMatch[1].trim());
            const destLower = dest.toLowerCase();

            if (
              (storeTarget.includes('flipkart') && destLower.includes('flipkart')) ||
              (storeTarget.includes('amazon') && destLower.includes('amazon')) ||
              (storeTarget.includes('croma') && destLower.includes('croma'))
            ) {
              urlCache.set(cacheKey, dest);
              return dest;
            }

            // If we found any valid retailer destination, keep it as candidate
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
const cleanDestinationUrl = (url: string): string => {
  // If wrapped in linkredirect / dl= query parameter
  if (url.includes('dl=')) {
    try {
      const parsed = new URL(url);
      const dl = parsed.searchParams.get('dl');
      if (dl && (dl.includes('flipkart.com') || dl.includes('amazon.in'))) {
        return decodeURIComponent(dl);
      }
    } catch {
      // Ignore URL parse error
    }
  }
  return url;
};

/**
 * Constructs direct retailer search URL as reliable fallback
 */
export const getFallbackStoreSearch = (storeName: string, productName: string): string => {
  const query = encodeURIComponent(productName || 'smartphone');
  const s = (storeName || '').toLowerCase();

  if (s.includes('flipkart')) {
    return `https://www.flipkart.com/search?q=${query}`;
  }
  if (s.includes('croma')) {
    return `https://www.croma.com/searchB?q=${query}`;
  }
  return `https://www.amazon.in/s?k=${query}`;
};
