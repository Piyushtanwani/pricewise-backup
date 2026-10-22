import { execSync } from 'child_process';
import prisma from '../utils/prisma';

// Memory cache for quick lookups
const urlCache = new Map<string, string>();

/**
 * Checks if a Flipkart URL points to a conflicting storage/RAM variant
 */
export const isFlipkartVariantMismatch = (url: string, productName: string): boolean => {
  if (!url || !url.toLowerCase().includes('flipkart.com')) return false;
  const storageMatch = productName.match(/(\d+)\s*(?:GB|TB)(?!\s*RAM)/i);
  if (!storageMatch) return false;
  const targetStorage = storageMatch[1].toLowerCase(); // e.g. '512'
  const urlLower = url.toLowerCase();

  // If URL already contains the target storage, it's a match
  if (urlLower.includes(`${targetStorage}-gb`) || urlLower.includes(`${targetStorage}gb`) || urlLower.includes(`${targetStorage}-tb`)) {
    return false;
  }

  // Check if URL has another storage specified (e.g. 256-gb, 128-gb)
  const urlStorageMatch = urlLower.match(/-(\d+)-(?:gb|tb)/i) || urlLower.match(/-(\d+)(?:gb|tb)/i);
  if (urlStorageMatch && urlStorageMatch[1] !== targetStorage) {
    return true; // Conflicting storage variant
  }
  return false;
};

/**
 * Resolves a direct product page URL on Flipkart by querying Flipkart's catalog
 * and finding the exact direct /p/itm... product link for the requested RAM/Storage variant.
 */
export const resolveFlipkartDirectUrl = async (productName: string): Promise<string | null> => {
  if (!productName) return null;
  const cacheKey = `flipkart_direct::${productName.toLowerCase().trim()}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }
  try {
    // Keep RAM and Storage in query (e.g. OnePlus 15 5G 16GB RAM 512GB)
    const clean = productName.replace(/[()+]/g, ' ').replace(/\s+/g, ' ').trim();
    const storageMatch = productName.match(/(\d+)\s*(?:GB|TB)(?!\s*RAM)/i);
    const targetStorage = storageMatch ? storageMatch[1].toLowerCase() : null; // e.g. '512'

    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(clean)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const itmMatches = [...html.matchAll(/\/([a-zA-Z0-9-]+)\/p\/(itm[a-zA-Z0-9]+)/g)];
    if (!itmMatches.length) return null;

    // Prioritize match that has the exact storage variant in slug (e.g. '512-gb' or '512gb')
    if (targetStorage) {
      const variantMatch = itmMatches.find((m) => {
        const slug = m[1].toLowerCase();
        return slug.includes(`${targetStorage}-gb`) || slug.includes(`${targetStorage}gb`) || slug.includes(`${targetStorage}-tb`);
      });
      if (variantMatch) {
        const direct = `https://www.flipkart.com${variantMatch[0]}`;
        urlCache.set(cacheKey, direct);
        return direct;
      }
    }

    const direct = `https://www.flipkart.com${itmMatches[0][0]}`;
    urlCache.set(cacheKey, direct);
    return direct;
  } catch {
    return null;
  }
};

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

  const storeTarget = storeName.toLowerCase();
  const cacheKey = `${rawUrl}::${storeName}::${productName}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  // 1. If rawUrl is already a direct verified product page (contains /p/ or /dp/)
  if (
    (rawUrl.includes('/p/') || rawUrl.includes('/dp/')) &&
    (rawUrl.includes('amazon.') || rawUrl.includes('flipkart.com') || rawUrl.includes('croma.com') || rawUrl.includes('vijaysales.com'))
  ) {
    // If it's Flipkart, ensure the stored direct URL is not for a wrong variant (e.g. 256GB instead of 512GB)
    if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(rawUrl, productName)) {
      const correctVariant = await resolveFlipkartDirectUrl(productName);
      if (correctVariant) {
        urlCache.set(cacheKey, correctVariant);
        return correctVariant;
      }
    }
    return cleanDestinationUrl(rawUrl);
  }

  // 2. For Flipkart: If rawUrl is a generic search URL or lacks a /p/itm... product ID,
  // resolve the true direct Flipkart product page dynamically!
  if (storeTarget.includes('flipkart') && productName) {
    const directFlipkart = await resolveFlipkartDirectUrl(productName);
    if (directFlipkart) {
      urlCache.set(cacheKey, directFlipkart);
      return directFlipkart;
    }
  }

  // 3. Check if rawUrl is another direct retailer URL
  if (
    rawUrl.includes('amazon.in') ||
    rawUrl.includes('amazon.com') ||
    rawUrl.includes('croma.com') ||
    rawUrl.includes('vijaysales.com') ||
    rawUrl.includes('reliancedigital.in')
  ) {
    return cleanDestinationUrl(rawUrl);
  }

  // If already a tracking link (l.smartprix.com or linkredirect.in)
  if (rawUrl.includes('l.smartprix.com') || rawUrl.includes('linkredirect.in')) {
    try {
      const resp = await fetch(rawUrl, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const loc = resp.headers.get('location');
      if (loc) {
        let dest = cleanDestinationUrl(loc.trim());
        // Check for Flipkart variant mismatch (e.g. Smartprix redirected to 256GB for a 512GB phone)
        if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(dest, productName)) {
          const correctVariant = await resolveFlipkartDirectUrl(productName);
          if (correctVariant) {
            dest = correctVariant;
          }
        }
        urlCache.set(cacheKey, dest);
        return dest;
      }
    } catch {
      try {
        const head = execSync(`curl -s -I "${rawUrl}"`, { maxBuffer: 1024 * 1024, timeout: 8000 }).toString('utf-8');
        const locMatch = head.match(/location:\s*([^\r\n]+)/i);
        if (locMatch) {
          let dest = cleanDestinationUrl(locMatch[1].trim());
          if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(dest, productName)) {
            const correctVariant = await resolveFlipkartDirectUrl(productName);
            if (correctVariant) {
              dest = correctVariant;
            }
          }
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
export const cleanDestinationUrl = (url: string): string => {
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
