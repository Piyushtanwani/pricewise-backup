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
export const scrapeAmazon = async (directUrl: string): Promise<Partial<ScrapedStoreOffer> | null> => {
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
      html.includes('Currently unavailable') ||
      html.includes('currently unavailable') ||
      html.includes('We don\'t know when or if this item will be back in stock');

    const priceMatch =
      html.match(/class="a-price-whole">([0-9,]+)/i) ||
      html.match(/class="a-offscreen">₹?([0-9,]+)/i);

    const price = priceMatch ? Math.round(Number(priceMatch[1].replace(/,/g, ''))) : null;

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
      const scraped = await scrapeAmazon(directUrl);
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
