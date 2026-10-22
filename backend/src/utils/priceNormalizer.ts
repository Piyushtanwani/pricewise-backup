import { StockStatus } from '../generated/prisma';

export interface PriceNormalizationOptions {
  defaultUsdRate?: number;
  minThreshold?: number;
  maxThreshold?: number;
}

/**
 * Robust price parser that strips currency symbols, commas, non-numeric noise,
 * handles Indian Lakh/Crore and Western formats, USD to INR conversion,
 * and range strings safely.
 *
 * Always returns a clean, non-negative number (or 0 if invalid).
 */
export function parsePrice(
  rawPrice: unknown,
  options: PriceNormalizationOptions = {},
): number {
  if (typeof rawPrice === 'number') {
    if (!Number.isFinite(rawPrice) || isNaN(rawPrice) || rawPrice <= 0) {
      return 0;
    }
    return Math.round(rawPrice);
  }

  if (rawPrice === null || rawPrice === undefined) {
    return 0;
  }

  let str = String(rawPrice).trim();
  if (!str) return 0;

  // Unescape HTML entities if any (e.g. &nbsp;, &#8377; for ₹)
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8377;/gi, '₹')
    .replace(/&#36;/gi, '$');

  // Check for USD currency indication ($ or USD)
  const isUsd = str.includes('$') || /\busd\b/i.test(str);
  const usdRate = options.defaultUsdRate || 86;

  // If a price range is given (e.g. "₹54,999 - ₹59,999" or "Rs. 20,000 to 25,000"), take the lowest / first value
  if (str.includes('-') || /\bto\b/i.test(str)) {
    const parts = str.split(/-|\bto\b/i);
    if (parts.length > 0 && parts[0].trim()) {
      str = parts[0].trim();
    }
  }

  // Strip common currency prefixes and noise
  // e.g. "₹", "Rs.", "Rs", "INR", "/-", commas, whitespace
  const cleaned = str
    .replace(/[₹$€£]/g, '')
    .replace(/\b(?:rs\.?|inr|usd|eur|gbp)\b/gi, '')
    .replace(/\/-/, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();

  // Extract valid floating/integer number pattern (e.g. 54999 or 54999.00)
  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return 0;

  const parsed = parseFloat(match[1]);
  if (!Number.isFinite(parsed) || isNaN(parsed) || parsed <= 0) {
    return 0;
  }

  const finalPrice = isUsd ? Math.round(parsed * usdRate) : Math.round(parsed);

  if (options.minThreshold && finalPrice < options.minThreshold) {
    return 0;
  }
  if (options.maxThreshold && finalPrice > options.maxThreshold) {
    return 0;
  }

  return finalPrice;
}

export interface StockEvaluationResult {
  availability: string;
  stockStatus: StockStatus;
  inStock: boolean;
}

/**
 * Resilient stock availability evaluation.
 * Evaluates boolean and string signals, explicitly protecting against false-positive
 * "out of stock" states caused by dynamic DOM shifts, A/B testing, or API payload shifts.
 */
export function evaluateStockStatus(
  rawStock: unknown,
  fallbackToInStock = true,
): StockEvaluationResult {
  // 1. Explicit boolean evaluation
  if (typeof rawStock === 'boolean') {
    return rawStock
      ? { availability: 'In Stock', stockStatus: StockStatus.IN_STOCK, inStock: true }
      : { availability: 'Out of Stock', stockStatus: StockStatus.OUT_OF_STOCK, inStock: false };
  }

  // 2. String evaluation
  if (typeof rawStock === 'string') {
    const text = rawStock.toLowerCase().replace(/\s+/g, ' ').trim();

    // Explicit Out-of-Stock checks
    const isExplicitlyOos =
      text.includes('out of stock') ||
      text.includes('out_of_stock') ||
      text.includes('currently unavailable') ||
      text.includes('temporarily unavailable') ||
      text.includes('temporarily out of stock') ||
      text.includes('sold out') ||
      text.includes('discontinued') ||
      text.includes('notify me') ||
      text.includes('coming soon') ||
      text.includes('not available') ||
      text.includes("we don't know when or if this item will be back in stock");

    if (isExplicitlyOos) {
      return {
        availability: 'Out of Stock',
        stockStatus: StockStatus.OUT_OF_STOCK,
        inStock: false,
      };
    }

    // Limited Stock checks
    const isLimited =
      text.includes('limited') ||
      text.includes('few left') ||
      (text.includes('only ') && text.includes('left')) ||
      text.includes('order soon');

    if (isLimited) {
      return {
        availability: 'Limited Stock',
        stockStatus: StockStatus.LIMITED,
        inStock: true,
      };
    }

    // Explicit In-Stock keywords
    const isExplicitlyInStock =
      text.includes('in stock') ||
      text.includes('in_stock') ||
      text.includes('available') ||
      text.includes('delivery') ||
      text.includes('get it by') ||
      text.includes('ships from');

    if (isExplicitlyInStock) {
      return {
        availability: 'In Stock',
        stockStatus: StockStatus.IN_STOCK,
        inStock: true,
      };
    }
  }

  // 3. Fallback: Protect available products against fragile selector misses
  return fallbackToInStock
    ? { availability: 'In Stock', stockStatus: StockStatus.IN_STOCK, inStock: true }
    : { availability: 'Out of Stock', stockStatus: StockStatus.OUT_OF_STOCK, inStock: false };
}

export interface RawStoreOffer {
  storeName?: string;
  rawPrice: unknown;
  rawStock?: unknown;
  mrp?: unknown;
  productUrl?: string;
  shipping?: unknown;
}

export interface NormalizedStoreOffer {
  storeName: string;
  price: number;
  mrp: number | null;
  availability: string;
  stockStatus: StockStatus;
  inStock: boolean;
  productUrl: string;
}

/**
 * Unified normalization function for store offers before persistence or comparison.
 */
export function normalizeStoreOffer(
  offer: RawStoreOffer,
  options: PriceNormalizationOptions = {},
): NormalizedStoreOffer {
  const price = parsePrice(offer.rawPrice, options);
  const mrpParsed = parsePrice(offer.mrp, options);
  const mrp = mrpParsed > price ? mrpParsed : null;
  const stock = evaluateStockStatus(offer.rawStock);

  return {
    storeName: offer.storeName || 'Unknown Store',
    price,
    mrp,
    availability: stock.availability,
    stockStatus: stock.stockStatus,
    inStock: stock.inStock,
    productUrl: offer.productUrl || '',
  };
}

/**
 * Casts prices into clean numeric types (or null) safe for Prisma PostgreSQL ingestion.
 */
export function sanitizePriceForDb(price: unknown): number | null {
  const parsed = parsePrice(price);
  return parsed > 0 ? parsed : null;
}
