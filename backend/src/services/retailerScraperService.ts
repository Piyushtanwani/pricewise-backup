import { resolveDirectStoreUrl } from './storeRedirectService';
import { StockStatus } from '../generated/prisma';

export interface ScrapedStoreOffer {
  storeName: string;
  storeSlug: string;
  price: number;
  stockStatus: StockStatus;
  availability: string;
  directUrl: string;
  shipping: string;
  lastCheckedAt: string;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
};

/**
 * Live Scraper for Croma Product Pages
 */
export const scrapeCroma = async (directUrl: string): Promise<Partial<ScrapedStoreOffer> | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(directUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    // 1. Check approvalStatus / discontinued status
    const appMatch = html.match(/"approvalStatus"\s*:\s*"([^"]+)"/i);
    const approvalStatus = appMatch ? appMatch[1].toLowerCase() : '';
    const isDiscontinued =
      approvalStatus === 'discontinued' ||
      html.includes('this item has been discontinued') ||
      html.includes('This item has been discontinued');

    // 2. Extract price from offers JSON
    const priceMatch =
      html.match(/"offers"\s*:\s*\{[^}]*?"price"\s*:\s*"([0-9.]+)"/i) ||
      html.match(/"price"\s*:\s*"([0-9.]+)"/i);

    const price = priceMatch ? Math.round(Number(priceMatch[1])) : null;

    if (isDiscontinued) {
      return {
        price: price || 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        availability: 'Out of Stock',
      };
    }

    if (price && price > 0) {
      return {
        price,
        stockStatus: StockStatus.IN_STOCK,
        availability: 'In Stock',
      };
    }

    return null;
  } catch (err: any) {
    console.warn('[RetailerScraper] Croma scrape error:', err?.message || err);
    return null;
  }
};

/**
 * Live Scraper for Amazon Product Pages
 */
export const scrapeAmazon = async (
  directUrl: string,
  basePrice?: number | null,
): Promise<Partial<ScrapedStoreOffer> | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(directUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    // Robot check / Captcha safety: don't produce false out-of-stock
    const isCaptcha = html.includes('validateCaptcha') || html.includes('Robot Check');
    if (isCaptcha) {
      return null;
    }

    // 1. Direct BuyBox action buttons (strongest in-stock signal on Amazon)
    const hasAddToCart = html.includes('id="add-to-cart-button"') || html.includes('name="submit.add-to-cart"');
    const hasBuyNow = html.includes('id="buy-now-button"') || html.includes('name="submit.buy-now"');

    // 2. Out of Stock container checks
    const hasOutOfStockDiv =
      html.includes('id="outOfStock"') ||
      html.includes('class="outOfStock"') ||
      html.includes('Currently unavailable.') ||
      html.includes('We don\'t know when or if this item will be back in stock');

    const availMatch = html.match(/id="availability"[^>]*>([\s\S]*?)<\/div>/i);
    const availText = availMatch ? availMatch[1].replace(/<[^>]+>/g, ' ').toLowerCase() : '';

    let isOutOfStock = false;
    if (!hasAddToCart && !hasBuyNow) {
      if (hasOutOfStockDiv || availText.includes('currently unavailable') || availText.length === 0) {
        isOutOfStock = true;
      }
    }

    // 3. Main Product Core Price ONLY (Do NOT match carousel accessories or phone cases)
    const corePriceSection =
      html.match(/id="corePriceDisplay_desktop_feature_div"[\s\S]*?<\/div>\s*<\/div>/i) ||
      html.match(/id="corePrice_desktop"[\s\S]*?<\/div>/i) ||
      html.match(/id="apex_desktop"[\s\S]*?<\/div>/i) ||
      html.match(/id="desktop_buybox"[\s\S]*?<\/div>/i);

    const priceScope = corePriceSection ? corePriceSection[0] : '';
    const priceWhole =
      priceScope.match(/class="a-price-whole">([0-9,]+)/i) ||
      html.match(/id="priceblock_ourprice"[^>]*>₹?([0-9,]+)/i) ||
      html.match(/id="priceblock_dealprice"[^>]*>₹?([0-9,]+)/i);

    let price = priceWhole ? Math.round(Number(priceWhole[1].replace(/,/g, ''))) : null;

    // Reject phone covers, accessories, or erroneous sub-prices (< 35% of phone price)
    const minThreshold = Math.max(3000, (basePrice || 15000) * 0.35);
    if (price && price < minThreshold) {
      price = null;
    }

    if (isOutOfStock) {
      return {
        price: price || 0,
        stockStatus: StockStatus.OUT_OF_STOCK,
        availability: 'Out of Stock',
      };
    }

    if (price && price > 0) {
      return {
        price,
        stockStatus: StockStatus.IN_STOCK,
        availability: 'In Stock',
      };
    }

    return null;
  } catch (err: any) {
    console.warn('[RetailerScraper] Amazon scrape error:', err?.message || err);
    return null;
  }
};

export interface TargetSpecs {
  ram?: string | null;
  storage?: string | null;
}

const NON_MODEL_TERMS = new Set(['5g', '4g', '3g', 'lte', 'gb', 'tb', 'mb', 'ram', 'rom', 'sim']);

export function parseStorageNumber(s?: string | null): number | null {
  if (!s) return null;
  const str = String(s).toLowerCase();
  if (str.includes('1 tb') || str.includes('1tb')) return 1024;
  if (str.includes('2 tb') || str.includes('2tb')) return 2048;
  const m = str.match(/([0-9]+)\s*(?:gb|inbuilt|rom)?/i);
  return m ? Number(m[1]) : null;
}

export function parseRamNumber(s?: string | null): number | null {
  if (!s) return null;
  const str = String(s).toLowerCase();
  const m = str.match(/([0-9]+)\s*(?:gb)?\s*(?:ram)?/i);
  return m ? Number(m[1]) : null;
}

/**
 * Accurately scores and verifies if a retailer's candidate product title matches the requested product.
 * Prevents cross-model mismatches (e.g. 17 Pro matching 18 Pro) and variant mismatches (e.g. 256GB matching 512GB).
 */
export function matchProductVariant(
  candidateTitle: string,
  targetProductName: string,
  targetSpecs?: TargetSpecs,
): { matches: boolean; score: number } {
  if (!targetProductName) {
    return { matches: true, score: 1 };
  }

  const normTitle = candidateTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const normTarget = targetProductName.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

  const titleTokens = normTitle.split(/\s+/).filter(Boolean);
  const targetTokens = normTarget.split(/\s+/).filter(Boolean);
  const titleSet = new Set(titleTokens);

  // 1. Mandatory number check (generation): target "17", "18", "24", "12"
  const targetStorageNum = parseStorageNumber(targetSpecs?.storage);
  const targetRamNum = parseRamNumber(targetSpecs?.ram);

  const targetNumbers = targetTokens.filter((t) => /^\d+$/.test(t));
  for (const num of targetNumbers) {
    // If this number is the target storage or RAM, skip it here (handled in strict spec matching)
    if (Number(num) === targetStorageNum || Number(num) === targetRamNum) {
      continue;
    }
    if (!titleSet.has(num)) {
      return { matches: false, score: -1 };
    }
  }

  // 2. Critical model tier modifiers: max, ultra, plus, mini, fe, xl, lite
  const criticalModifiers = ['max', 'ultra', 'plus', 'mini', 'fe', 'xl', 'lite'];
  for (const mod of criticalModifiers) {
    const inTarget = targetTokens.includes(mod);
    const inTitle = titleTokens.includes(mod);
    if (inTarget !== inTitle) {
      return { matches: false, score: -1 };
    }
  }

  // Check 'pro':
  const targetHasPro = targetTokens.includes('pro');
  const titleHasPro = titleTokens.includes('pro');
  if (targetHasPro !== titleHasPro) {
    return { matches: false, score: -1 };
  }

  // Check alphanumeric sub-models (e.g., '12r', '11t', 's24') - excluding 5g, 4g, gb, tb
  const alphaNumTokens = targetTokens.filter(
    (t) => (/^[a-z]+\d+$/i.test(t) || /^\d+[a-z]+$/i.test(t)) && !NON_MODEL_TERMS.has(t),
  );

  for (const an of alphaNumTokens) {
    if (!titleSet.has(an) && !normTitle.includes(an)) {
      return { matches: false, score: -1 };
    }
  }

  // Reverse check: if candidate has a sub-model token (like '12r') that target doesn't have
  const titleAlphaNum = titleTokens.filter(
    (t) => (/^[a-z]+\d+$/i.test(t) || /^\d+[a-z]+$/i.test(t)) && !NON_MODEL_TERMS.has(t),
  );

  for (const an of titleAlphaNum) {
    if (!normTarget.includes(an)) {
      if (/^\d+[a-z]$/i.test(an)) {
        return { matches: false, score: -1 };
      }
    }
  }

  // 3. STRICT STORAGE MATCHING:
  // Candidate titles typically specify storage: "(... 256 GB)", "(... 512 GB)", "(... 128 GB)", "(... 1 TB)"
  const titleStorageMatch = candidateTitle.match(/([0-9]+)\s*(?:GB|TB)\b/gi);
  const titleStorages = (titleStorageMatch || []).map((s) => parseStorageNumber(s)).filter(Boolean);

  if (targetStorageNum && titleStorages.length > 0) {
    // If candidate mentions a storage that conflicts with targetStorage
    const hasExactStorage = titleStorages.includes(targetStorageNum);
    if (!hasExactStorage) {
      return { matches: false, score: -1 }; // Reject mismatched storage (e.g. 512GB when target is 256GB)
    }
  }

  // 4. STRICT RAM MATCHING:
  // If candidate title explicitly specifies RAM: "(16 GB RAM)" or "(12 GB RAM)"
  const titleRamMatch = candidateTitle.match(/([0-9]+)\s*GB\s*RAM\b/i);
  if (targetRamNum && titleRamMatch) {
    const titleRamNum = Number(titleRamMatch[1]);
    if (titleRamNum !== targetRamNum) {
      return { matches: false, score: -1 }; // Reject mismatched RAM (e.g. 16GB when target is 12GB)
    }
  }

  // Calculate score based on token overlap:
  let score = 0;
  for (const t of targetTokens) {
    if (titleSet.has(t)) score += 3;
  }

  if (targetStorageNum && titleStorages.includes(targetStorageNum)) {
    score += 10; // High bonus for exact storage match
  }

  return { matches: true, score };
}

/**
 * Live Scraper for Flipkart: Extracts exact real-time prices & direct product page links
 */
export const scrapeFlipkart = async (
  directUrl: string,
  basePrice?: number | null,
  productName?: string,
  targetSpecs?: TargetSpecs,
): Promise<Partial<ScrapedStoreOffer> | null> => {
  try {
    let fetchUrl = directUrl;
    if (directUrl.includes('flipkart.com/search') || !directUrl.includes('/p/itm')) {
      const qTokens = [productName || 'smartphone'];
      if (targetSpecs?.storage) qTokens.push(targetSpecs.storage);
      const q = encodeURIComponent(qTokens.join(' '));
      fetchUrl = `https://www.flipkart.com/search?q=${q}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(fetchUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    // 1. Primary: Extract live product offers from Flipkart preloaded state (Search results)
    const answerBoxRegex = /\{"title":"([^"]+)","url":"([^"]+)","values":\["Rs\.\s*([0-9]+)"\]\}/g;
    const matches = [...html.matchAll(answerBoxRegex)].map((m) => ({
      title: m[1],
      url: m[2].startsWith('http') ? m[2] : 'https://www.flipkart.com' + m[2],
      price: Number(m[3]),
    }));

    if (matches.length > 0) {
      // Score every match against the EXACT requested product name AND target specs (RAM/Storage)
      const scored = matches
        .map((m) => ({ ...m, ...matchProductVariant(m.title, productName || '', targetSpecs) }))
        .filter((m) => m.matches)
        .sort((a, b) => b.score - a.score || a.price - b.price);

      const chosen = scored.length > 0 ? scored[0] : null;

      if (chosen) {
        // Real-time stock status check on the chosen variant's direct product page
        let stockStatus: StockStatus = StockStatus.IN_STOCK;
        let availability = 'In Stock';
        try {
          const checkCtrl = new AbortController();
          const checkTimer = setTimeout(() => checkCtrl.abort(), 3500);
          const directCheckRes = await fetch(chosen.url, {
            headers: BROWSER_HEADERS,
            signal: checkCtrl.signal,
          });
          clearTimeout(checkTimer);
          if (directCheckRes.ok) {
            const directHtml = await directCheckRes.text();
            const isOos =
              directHtml.includes('schema.org/OutOfStock') ||
              directHtml.includes('NOTIFY ME') ||
              directHtml.includes('Notify Me') ||
              directHtml.includes('Currently Out of Stock') ||
              directHtml.includes('This item is currently out of stock') ||
              directHtml.includes('Sold Out') ||
              directHtml.includes('Currently unavailable');

            if (isOos) {
              stockStatus = StockStatus.OUT_OF_STOCK;
              availability = 'Out of Stock';
            }
          }
        } catch {
          // Keep default if direct validation times out
        }

        return {
          price: chosen.price,
          directUrl: chosen.url,
          stockStatus,
          availability,
          storeName: 'Flipkart',
          storeSlug: 'flipkart',
        };
      }
    }

    // 2. Direct Flipkart Product Page Scrape (when fetchUrl is /p/itm...)
    const isDirectOutOfStock =
      html.includes('schema.org/OutOfStock') ||
      html.includes('NOTIFY ME') ||
      html.includes('Notify Me') ||
      html.includes('Currently Out of Stock') ||
      html.includes('This item is currently out of stock') ||
      html.includes('Sold Out') ||
      html.includes('Currently unavailable');

    const schemaMatch = html.match(/"offers"\s*:\s*\{[^}]*?"price"\s*:\s*"?([0-9.]+)"?/i);
    const classMatch = html.match(/class="[^"]*(?:Nx9bqj|_30jeq3)[^"]*">₹?([0-9,]+)/i);

    let price: number | null = null;
    if (schemaMatch) {
      price = Math.round(Number(schemaMatch[1]));
    } else if (classMatch) {
      price = Math.round(Number(classMatch[1].replace(/,/g, '')));
    }

    const minThreshold = Math.max(3000, (basePrice || 15000) * 0.35);
    if (price && price < minThreshold) {
      price = null;
    }
    if (typeof basePrice === 'number' && basePrice > 0 && price) {
      if (price < basePrice * 0.65 || price > basePrice * 1.35) {
        price = null;
      }
    }

    if (price) {
      return {
        price,
        stockStatus: isDirectOutOfStock ? StockStatus.OUT_OF_STOCK : StockStatus.IN_STOCK,
        availability: isDirectOutOfStock ? 'Out of Stock' : 'In Stock',
        directUrl: fetchUrl,
        storeName: 'Flipkart',
        storeSlug: 'flipkart',
      };
    }

    return null;
  } catch (err: any) {
    console.warn('[RetailerScraper] Flipkart scrape error:', err?.message || err);
    return null;
  }
};

/**
 * Given a store listing with a URL, resolves direct destination and scrapes real-time price & stock
 */
export const scrapeLiveStoreListing = async (
  rawUrl: string,
  storeName: string,
  productName: string,
  basePrice?: number | null,
  targetSpecs?: TargetSpecs,
): Promise<Partial<ScrapedStoreOffer> | null> => {
  try {
    const directUrl = await resolveDirectStoreUrl(rawUrl, storeName, productName);
    const sLower = storeName.toLowerCase();
    const urlLower = directUrl.toLowerCase();

    if (sLower.includes('croma') || urlLower.includes('croma.com')) {
      const scraped = await scrapeCroma(directUrl);
      if (scraped) return { ...scraped, directUrl };
    }

    if (sLower.includes('amazon') || urlLower.includes('amazon.in')) {
      const scraped = await scrapeAmazon(directUrl, basePrice);
      if (scraped) return { ...scraped, directUrl };
    }

    if (sLower.includes('flipkart') || urlLower.includes('flipkart.com')) {
      const scraped = await scrapeFlipkart(directUrl, basePrice, productName, targetSpecs);
      if (scraped) return { ...scraped, directUrl: scraped.directUrl || directUrl };
    }

    return { directUrl };
  } catch {
    return null;
  }
};
