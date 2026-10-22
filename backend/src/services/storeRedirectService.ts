import { execSync } from 'child_process';
import prisma from '../utils/prisma';
import { sanitizeRetailerUrl } from '../utils/urlSanitizer';

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
 * Comprehensive Model & Variant Mismatch Check:
 * Compares a retailer product URL (slug / query) against the target product title
 * to prevent wrong-product redirects (e.g. S25 FE instead of A16, iPhone 13 instead of 15, Pro instead of base).
 */
export const checkProductUrlModelMismatch = (
  url: string,
  productName: string,
): { isMismatch: boolean; reason?: string } => {
  if (!url || !productName) return { isMismatch: false };

  const urlLower = url.toLowerCase();
  const nameLower = productName.toLowerCase();

  // 1. Accessory check in URL (cases, panels, protectors, chargers, housings)
  const ACCESSORY_LIST = [
    'case',
    'cover',
    'back-cover',
    'skin',
    'tempered-glass',
    'screen-protector',
    'charger',
    'cable',
    'pouch',
    'adapter',
    'strap',
    'holder',
    'stand',
    'lens-protector',
    'guard',
    'housing',
    'full-panel',
    'back-panel',
    'front-panel',
    'sim-tray',
    'sim-card-tray',
    'middle-frame',
    'lcd',
  ];
  for (const acc of ACCESSORY_LIST) {
    if (
      urlLower.includes(`/${acc}`) ||
      urlLower.includes(`-${acc}-`) ||
      urlLower.includes(`_${acc}_`) ||
      urlLower.includes(`-${acc}`) ||
      urlLower.includes(`${acc}-`)
    ) {
      return { isMismatch: true, reason: `URL points to an accessory (${acc}) rather than the device` };
    }
  }

  // 2. Storage variant conflict
  if (isFlipkartVariantMismatch(url, productName)) {
    return { isMismatch: true, reason: 'URL points to conflicting storage variant' };
  }

  // Extract slug from URL if present (must not be 'p', 'dp', 'gp', or 'item')
  const slugMatch =
    urlLower.match(/(?:\.com|\.in)\/([a-zA-Z0-9-_]+)\/p\//i) ||
    urlLower.match(/(?:\.com|\.in)\/([a-zA-Z0-9-_]+)\/dp\//i);
  const rawSlug = slugMatch ? slugMatch[1] : '';
  const slug = rawSlug && !['p', 'dp', 'gp', 'item'].includes(rawSlug) ? rawSlug : '';

  // 3. Variant words check (pro, max, ultra, plus, mini, lite, fe, se, neo, fold, flip)
  const VARIANT_WORDS = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'neo', 'se', 'fold', 'flip'];
  for (const vw of VARIANT_WORDS) {
    const nameHasVariant = new RegExp(`\\b${vw}\\b`, 'i').test(nameLower);

    // Filter out false positives from color names like "ultra-violet" and "neo-green"
    if (vw === 'ultra' && slug && (slug.includes('ultra-violet') || slug.includes('ultra_violet') || slug.includes('ultraviolet'))) {
      continue;
    }
    if (vw === 'neo' && slug && (slug.includes('neo-green') || slug.includes('neo_green') || slug.includes('neogreen'))) {
      continue;
    }

    const urlHasVariant = slug
      ? new RegExp(`[-_]${vw}[-_]`, 'i').test(`-${slug}-`)
      : new RegExp(`[-_\\/]${vw}[-_\\/]`, 'i').test(urlLower);

    // If URL contains a variant word that the product does NOT have (e.g. S25 FE for A16, or Pro for base phone)
    if (!nameHasVariant && urlHasVariant) {
      return {
        isMismatch: true,
        reason: `URL contains conflicting variant "${vw}" not in product name`,
      };
    }

    // If product HAS a variant (e.g. Pro, Plus), but URL HAS A SLUG and the slug omits that variant:
    if (nameHasVariant && slug && !urlHasVariant) {
      return {
        isMismatch: true,
        reason: `Expected variant "${vw}" missing in URL slug ("${slug}")`,
      };
    }
  }

  // 4. Model code check (e.g. A16, S25, S24, M15, F54, 12R)
  const modelCodeMatch = nameLower.match(/\b([a-z]\d{1,2}[a-z]?)\b/i);
  if (modelCodeMatch && slug) {
    const code = modelCodeMatch[1].toLowerCase(); // e.g. 'a16'
    const slugHasCode =
      slug.includes(`-${code}-`) ||
      slug.includes(`-${code}`) ||
      slug.includes(`${code}-`) ||
      slug.includes(`/${code}-`) ||
      slug.includes(`/${code}`);

    if (!slugHasCode) {
      return {
        isMismatch: true,
        reason: `Model code mismatch: product is "${code}", but URL slug is "${slug}"`,
      };
    }
  }

  // 5. Generation numbers (e.g. 11, 12, 13, 14, 15, 16, 23, 24, 25)
  const prodTokens = nameLower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  const numTokens = prodTokens.filter((t) => /^\d{2}$/.test(t) && Number(t) < 50);
  if (slug) {
    for (const num of numTokens) {
      const otherGenerations = ['11', '12', '13', '14', '15', '16', '23', '24', '25'].filter((g) => g !== num);
      const hasOther = otherGenerations.some(
        (g) =>
          slug.includes(`-${g}-`) ||
          slug.includes(`-${g}`) ||
          slug.includes(`${g}-`) ||
          slug.includes(`_${g}_`),
      );
      const hasThis =
        slug.includes(`-${num}-`) ||
        slug.includes(`-${num}`) ||
        slug.includes(`${num}-`) ||
        slug.includes(`_${num}_`);
      if (hasOther && !hasThis) {
        return {
          isMismatch: true,
          reason: `Generation mismatch: product has "${num}", but URL slug points to a different generation (${slug})`,
        };
      }
    }
  }

  return { isMismatch: false };
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

    // Filter candidate matches to only those that genuinely match the product model & are not accessories
    const validCandidates: string[] = [];
    for (const m of itmMatches) {
      const candidateUrl = `https://www.flipkart.com${m[0]}`;
      const mismatch = checkProductUrlModelMismatch(candidateUrl, productName);
      if (!mismatch.isMismatch) {
        validCandidates.push(candidateUrl);
      }
    }

    if (validCandidates.length === 0) {
      // No genuine matching phone product found on Flipkart (e.g. only accessories or sponsored ads)
      return null;
    }

    // Prioritize match that has the exact storage variant in slug (e.g. '512-gb' or '512gb')
    if (targetStorage) {
      const variantMatch = validCandidates.find((url) => {
        const uLower = url.toLowerCase();
        return uLower.includes(`${targetStorage}-gb`) || uLower.includes(`${targetStorage}gb`) || uLower.includes(`${targetStorage}-tb`);
      });
      if (variantMatch) {
        urlCache.set(cacheKey, variantMatch);
        return variantMatch;
      }
    }

    const direct = validCandidates[0];
    urlCache.set(cacheKey, direct);
    return direct;
  } catch {
    return null;
  }
};

export interface CanonicalValidationResult {
  isValid: boolean;
  canonicalId: string | null;
  canonicalUrl: string;
  fallbackUrl: string;
  reason?: string;
  isFallback: boolean;
}

const ACCESSORY_TERMS = [
  'case',
  'cover',
  'back-cover',
  'skin',
  'tempered-glass',
  'screen-protector',
  'charger',
  'cable',
  'pouch',
  'adapter',
  'strap',
  'holder',
  'stand',
  'lens-protector',
  'guard',
];

/**
 * Strict URL-matching validation check:
 * Compares the target store product URL against expected canonical signatures,
 * identifiers (Amazon ASIN, Flipkart ITM, Croma SKU), and model tokens
 * to prevent mismatched redirects or wrong-product landings.
 */
export const validateCanonicalProductUrl = (
  rawUrl: string,
  storeName: string,
  product: { name: string; brand?: string | null },
): CanonicalValidationResult => {
  const sLower = (storeName || '').toLowerCase();
  const fallbackUrl = getFallbackStoreSearch(storeName, product.name);

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      isValid: false,
      canonicalId: null,
      canonicalUrl: fallbackUrl,
      fallbackUrl,
      reason: 'Empty or missing store URL',
      isFallback: true,
    };
  }

  const rawLower = rawUrl.toLowerCase();
  // 1. Check for malformed / placeholder / error query parameters in raw URL
  if (
    rawLower.includes('q=null') ||
    rawLower.includes('text=null') ||
    rawLower.includes('/p/null') ||
    rawLower.includes('{search_term_string}') ||
    rawLower.includes('undefined')
  ) {
    return {
      isValid: false,
      canonicalId: null,
      canonicalUrl: fallbackUrl,
      fallbackUrl,
      reason: 'Malformed URL containing placeholder or null parameter',
      isFallback: true,
    };
  }

  const cleanUrl = cleanDestinationUrl(rawUrl.trim(), product.name);

  // 2. Check for accessory keywords in URL slug
  const urlLower = cleanUrl.toLowerCase();
  for (const acc of ACCESSORY_TERMS) {
    if (
      urlLower.includes(`/${acc}`) ||
      urlLower.includes(`-${acc}-`) ||
      urlLower.includes(`_${acc}_`) ||
      rawLower.includes(`/${acc}`) ||
      rawLower.includes(`-${acc}-`) ||
      rawLower.includes(`_${acc}_`)
    ) {
      return {
        isValid: false,
        canonicalId: null,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: `Mismatched accessory landing detected (${acc})`,
        isFallback: true,
      };
    }
  }

  // 3. Global Model & Variant Mismatch Check
  const modelMismatch = checkProductUrlModelMismatch(cleanUrl, product.name);
  if (modelMismatch.isMismatch) {
    return {
      isValid: false,
      canonicalId: null,
      canonicalUrl: fallbackUrl,
      fallbackUrl,
      reason: modelMismatch.reason || 'Model or variant mismatch detected in store URL',
      isFallback: true,
    };
  }

  // 4. Retailer-specific canonical signatures & identifiers

  // --- AMAZON ---
  if (sLower.includes('amazon') || urlLower.includes('amazon.')) {
    const asinMatch = cleanUrl.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i);
    if (!asinMatch) {
      if (urlLower.includes('/s?') || urlLower.includes('/s/')) {
        return {
          isValid: true,
          canonicalId: null,
          canonicalUrl: cleanUrl,
          fallbackUrl,
          reason: 'Amazon search URL',
          isFallback: true,
        };
      }
      return {
        isValid: false,
        canonicalId: null,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: 'Missing valid 10-character Amazon ASIN identifier (/dp/ASIN)',
        isFallback: true,
      };
    }

    const asin = asinMatch[1].toUpperCase();
    const canonicalUrl = `https://www.amazon.in/dp/${asin}`;

    // Verify model number tokens if present in slug
    const prodTokens = product.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
    const numTokens = prodTokens.filter((t) => /^\d+$/.test(t) && Number(t) < 100);
    for (const num of numTokens) {
      const urlHasNum =
        urlLower.includes(`-${num}-`) ||
        urlLower.includes(`-${num}/`) ||
        urlLower.includes(`/${num}-`) ||
        rawLower.includes(`-${num}-`) ||
        rawLower.includes(`-${num}/`) ||
        rawLower.includes(`/${num}-`);
      const urlHasOtherNum = [11, 12, 13, 14, 15, 16, 17, 18, 23, 24, 25]
        .filter((n) => n !== Number(num))
        .some(
          (other) =>
            urlLower.includes(`-${other}-`) ||
            urlLower.includes(`-${other}/`) ||
            rawLower.includes(`-${other}-`) ||
            rawLower.includes(`-${other}/`),
        );

      if (urlHasOtherNum && !urlHasNum && (rawLower.includes('iphone') || rawLower.includes('galaxy') || rawLower.includes('oneplus'))) {
        return {
          isValid: false,
          canonicalId: asin,
          canonicalUrl: fallbackUrl,
          fallbackUrl,
          reason: `Model generation mismatch in Amazon URL (expected ${num})`,
          isFallback: true,
        };
      }
    }

    return {
      isValid: true,
      canonicalId: asin,
      canonicalUrl,
      fallbackUrl,
      isFallback: false,
    };
  }

  // --- FLIPKART ---
  if (sLower.includes('flipkart') || urlLower.includes('flipkart.com')) {
    const itmMatch = cleanUrl.match(/\/p\/(itm[a-zA-Z0-9]+)/i);
    if (!itmMatch) {
      if (urlLower.includes('/search')) {
        return {
          isValid: true,
          canonicalId: null,
          canonicalUrl: cleanUrl,
          fallbackUrl,
          reason: 'Flipkart search URL',
          isFallback: true,
        };
      }
      return {
        isValid: false,
        canonicalId: null,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: 'Missing Flipkart item identifier (/p/itm...)',
        isFallback: true,
      };
    }

    const itmId = itmMatch[1];

    if (isFlipkartVariantMismatch(cleanUrl, product.name)) {
      return {
        isValid: false,
        canonicalId: itmId,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: 'Flipkart URL points to conflicting storage variant',
        isFallback: true,
      };
    }

    return {
      isValid: true,
      canonicalId: itmId,
      canonicalUrl: sanitizeRetailerUrl(cleanUrl, 'Flipkart'),
      fallbackUrl,
      isFallback: false,
    };
  }

  // --- CROMA ---
  if (sLower.includes('croma') || urlLower.includes('croma.com')) {
    const skuMatch = cleanUrl.match(/\/p\/([0-9]{5,8})/i);
    if (!skuMatch) {
      if (urlLower.includes('/searchb') || urlLower.includes('/search?')) {
        return {
          isValid: true,
          canonicalId: null,
          canonicalUrl: cleanUrl,
          fallbackUrl,
          reason: 'Croma search URL',
          isFallback: true,
        };
      }
      return {
        isValid: false,
        canonicalId: null,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: 'Missing numeric Croma SKU identifier (/p/SKU)',
        isFallback: true,
      };
    }

    return {
      isValid: true,
      canonicalId: skuMatch[1],
      canonicalUrl: sanitizeRetailerUrl(cleanUrl, 'Croma'),
      fallbackUrl,
      isFallback: false,
    };
  }

  // --- VIJAY SALES ---
  if (sLower.includes('vijay') || urlLower.includes('vijaysales.com')) {
    if (urlLower.includes('refrigerators') || urlLower.includes('washing-machines') || urlLower.includes('air-conditioners')) {
      return {
        isValid: false,
        canonicalId: null,
        canonicalUrl: fallbackUrl,
        fallbackUrl,
        reason: 'Mismatched Vijay Sales appliance category URL',
        isFallback: true,
      };
    }

    return {
      isValid: true,
      canonicalId: null,
      canonicalUrl: cleanUrl,
      fallbackUrl,
      isFallback: false,
    };
  }

  // --- BRAND OFFICIAL STORE ---
  if (
    urlLower.includes('apple.com') ||
    urlLower.includes('samsung.com') ||
    urlLower.includes('oneplus.in') ||
    urlLower.includes('mi.com') ||
    urlLower.includes('vivo.com') ||
    urlLower.includes('realme.com') ||
    urlLower.includes('oppo.com')
  ) {
    return {
      isValid: true,
      canonicalId: null,
      canonicalUrl: cleanUrl,
      fallbackUrl,
      isFallback: false,
    };
  }

  return {
    isValid: true,
    canonicalId: null,
    canonicalUrl: cleanUrl,
    fallbackUrl,
    isFallback: false,
  };
};

/**
 * Resolves a Smartprix product or listing URL into a direct store URL (Amazon, Flipkart, Croma).
 * Preserves direct retailer destination links even if current database state flags the product as out-of-stock.
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
    const rawMismatch = checkProductUrlModelMismatch(rawUrl, productName);
    if (rawMismatch.isMismatch) {
      if (storeTarget.includes('flipkart') && productName) {
        const correctVariant = await resolveFlipkartDirectUrl(productName);
        if (correctVariant) {
          urlCache.set(cacheKey, correctVariant);
          return correctVariant;
        }
      }
      const fallback = getFallbackStoreSearch(storeName, productName);
      urlCache.set(cacheKey, fallback);
      return fallback;
    }

    if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(rawUrl, productName)) {
      const correctVariant = await resolveFlipkartDirectUrl(productName);
      if (correctVariant) {
        urlCache.set(cacheKey, correctVariant);
        return correctVariant;
      }
    }
    const clean = cleanDestinationUrl(rawUrl, productName);
    urlCache.set(cacheKey, clean);
    return clean;
  }

  // 2. For Flipkart: If rawUrl is a generic search URL or lacks a /p/itm... product ID, resolve dynamically
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
    const clean = cleanDestinationUrl(rawUrl, productName);
    urlCache.set(cacheKey, clean);
    return clean;
  }

  // 4. If already a tracking link (l.smartprix.com or linkredirect.in)
  if (rawUrl.includes('l.smartprix.com') || rawUrl.includes('linkredirect.in')) {
    try {
      const resp = await fetch(rawUrl, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const loc = resp.headers.get('location');
      if (loc) {
        let dest = cleanDestinationUrl(loc.trim(), productName);
        const modelCheck = checkProductUrlModelMismatch(dest, productName);
        if (modelCheck.isMismatch) {
          if (storeTarget.includes('flipkart') && productName) {
            const correctVariant = await resolveFlipkartDirectUrl(productName);
            dest = correctVariant || getFallbackStoreSearch(storeName, productName);
          } else {
            dest = getFallbackStoreSearch(storeName, productName);
          }
        } else if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(dest, productName)) {
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
          let dest = cleanDestinationUrl(locMatch[1].trim(), productName);
          const modelCheck = checkProductUrlModelMismatch(dest, productName);
          if (modelCheck.isMismatch) {
            if (storeTarget.includes('flipkart') && productName) {
              const correctVariant = await resolveFlipkartDirectUrl(productName);
              dest = correctVariant || getFallbackStoreSearch(storeName, productName);
            } else {
              dest = getFallbackStoreSearch(storeName, productName);
            }
          } else if (storeTarget.includes('flipkart') && productName && isFlipkartVariantMismatch(dest, productName)) {
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

  // 5. If a Smartprix product page (e.g. smartprix.com/mobiles/...)
  if (rawUrl.includes('smartprix.com')) {
    try {
      const html = execSync(
        `curl -s -L "${rawUrl}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 10000 },
      ).toString('utf-8');

      const trackingMatches = [...html.matchAll(/"trackingLink":"([^"]+)"/g)];

      for (const m of trackingMatches) {
        const link = m[1];
        try {
          const resp = await fetch(link, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
          const loc = resp.headers.get('location');
          if (loc) {
            const dest = cleanDestinationUrl(loc.trim(), productName);
            const modelCheck = checkProductUrlModelMismatch(dest, productName);
            if (modelCheck.isMismatch) {
              continue;
            }
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

  // Handle broken Croma search queries (e.g. q=null, text=null, {search_term_string})
  if (
    url.includes('croma.com') &&
    (url.includes('q=null') || url.includes('text=null') || url.includes('{search_term_string}') || url.includes('/p/null'))
  ) {
    const clean = (productName || 'smartphone').replace(/\(.*?\)/g, '').trim();
    return `https://www.croma.com/searchB?q=${encodeURIComponent(clean)}`;
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
