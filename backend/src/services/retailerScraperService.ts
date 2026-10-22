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

/**
 * Live Scraper for Flipkart Product Pages
 */
export const scrapeFlipkart = async (directUrl: string): Promise<Partial<ScrapedStoreOffer> | null> => {
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

    const isOutOfStock =
      html.includes('Currently Out of Stock') ||
      html.includes('Sold Out') ||
      html.includes('Coming Soon');

    const priceMatch =
      html.match(/"price"\s*:\s*([0-9.]+)/i) ||
      html.match(/₹([0-9,]+)/i);

    const price = priceMatch ? Math.round(Number(priceMatch[1].replace(/,/g, ''))) : null;

    return {
      price: price || undefined,
      stockStatus: isOutOfStock ? StockStatus.OUT_OF_STOCK : StockStatus.IN_STOCK,
      availability: isOutOfStock ? 'Out of Stock' : 'In Stock',
    };
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
      const scraped = await scrapeFlipkart(directUrl);
      if (scraped) return { ...scraped, directUrl };
    }

    return { directUrl };
  } catch {
    return null;
  }
};
