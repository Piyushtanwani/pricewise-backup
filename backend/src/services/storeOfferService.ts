import { livePriceCache } from '../utils/cache';
import { SerpStoreRate, matchAllowedStore } from './serpShoppingService';
import { TargetSpecs, matchProductVariant } from './retailerScraperService';
import { resolveDirectStoreUrl, checkProductUrlModelMismatch, resolveFlipkartDirectUrl } from './storeRedirectService';

export type OfferCategory = 'BANK' | 'CASHBACK' | 'FESTIVAL' | 'EMI' | 'EXCHANGE' | 'COUPON';

export interface StoreDiscountOffer {
  type: OfferCategory;
  title: string;
  description: string;
  bank?: string | null;
}

export interface StoreOffersEntry {
  storeId: string;
  store: string;
  storeSlug: string;
  productUrl: string;
  offers: StoreDiscountOffer[];
  source: 'live_scraped' | 'cache' | 'unavailable';
  fetchedAt: string;
  expiresAt: string;
}

export interface ProductLiveOffersResponse {
  productId: string;
  productName: string;
  offersByStore: Record<string, StoreOffersEntry>;
  fetchedAt: string;
  fromCache: boolean;
}

export interface CandidateStoreInput {
  storeId: string;
  store: string;
  storeSlug: string;
  url: string;
}

const OFFERS_CACHE_TTL_SECONDS = 30 * 60; // 30-minute per-product freshness window
const FETCH_TIMEOUT_MS = 6500;
const MAX_OFFERS_PER_STORE = 6;

// Coalesce concurrent requests for the same productId so parallel page views don't duplicate scraping
const inFlightOfferFetches = new Map<string, Promise<ProductLiveOffersResponse>>();

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
  'Upgrade-Insecure-Requests': '1',
};

const AMAZON_OFFER_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  'Cookie': 'lc-acbin=en_IN; i18n-prefs=INR',
  'sec-ch-ua': '"Google Chrome";v="131", "Not_A Brand";v="24", "Chromium";v="131"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

const KNOWN_BANKS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bamazon\s*pay\s*icici\b/i, label: 'Amazon Pay ICICI' },
  { pattern: /\bflipkart\s*axis\b/i, label: 'Flipkart Axis Bank' },
  { pattern: /\bhdfc\b/i, label: 'HDFC Bank' },
  { pattern: /\bicici\b/i, label: 'ICICI Bank' },
  { pattern: /\bsbi\b|state bank of india/i, label: 'SBI' },
  { pattern: /(?<![0-9a-z\-])axis\s*(?:bank|card)?\b(?!\s*(?:gyro|motor|sensor|stabiliz))/i, label: 'Axis Bank' },
  { pattern: /\bkotak\b/i, label: 'Kotak Bank' },
  { pattern: /\bidfc\b/i, label: 'IDFC First Bank' },
  { pattern: /\byes\s*bank\b/i, label: 'Yes Bank' },
  { pattern: /\bhsbc\b/i, label: 'HSBC' },
  { pattern: /\brbl\b/i, label: 'RBL Bank' },
  { pattern: /\bindusind\b/i, label: 'IndusInd Bank' },
  { pattern: /\bfederal\b/i, label: 'Federal Bank' },
  { pattern: /\bbobcard\b|\bbank of baroda\b/i, label: 'Bank of Baroda' },
  { pattern: /\bau\s*(?:small finance\s*)?bank\b/i, label: 'AU Bank' },
  { pattern: /\bonecard\b|\bone\s*card\b/i, label: 'OneCard' },
  { pattern: /\bamex\b|\bamerican express\b/i, label: 'American Express' },
  { pattern: /\bbajaj\s*finserv\b/i, label: 'Bajaj Finserv' },
  { pattern: /\bstandard chartered\b|\bscb\b/i, label: 'Standard Chartered' },
  { pattern: /\bpnb\b|\bpunjab national\b/i, label: 'PNB' },
  { pattern: /\bcanara\b/i, label: 'Canara Bank' },
];

const JUNK_TEXT_PATTERNS: RegExp[] = [
  /\bcookie\b/i,
  /\bprivacy policy\b/i,
  /\bterms (?:of use|and conditions)\b/i,
  /\bsign\s*in\b|\blog\s*in\b|\bcreate account\b/i,
  /\badd to cart\b|\bbuy now\b|\badd to wishlist\b/i,
  /\bout of stock\b|\bcurrently unavailable\b|\bnotify me\b/i,
  /\bfree delivery\b|\bfree shipping\b|\bdelivery by\b|\benter pincode\b/i,
  /\bmanufacturer warranty\b|\byear warranty\b|\breplacement policy\b|\breturn policy\b/i,
  /\bfunction\s*\(|\bwindow\.|\bdocument\.|\bvar\s+|\bconst\s+|\blet\s+|\breturn\s+/i,
  /\{|\}|=>|<\/?[a-z]+/i,
  /\btempered glass\b|\bback cover\b|\bscreen protector\b|\bphone case\b/i,
  /\bcustomer reviews?\b|\bratings?\s*&\s*reviews?\b/i,
  /\b(?:gyroscope|accelerometer|proximity sensor|ambient light|fingerprint sensor|megapixels?|supervooc|bypass charging|haptics|stereo speakers)\b/i,
];

const OFFER_SIGNAL_PATTERN =
  /(?:instant\s+discount|bank\s+offer|card\s+offer|cashback|no[\s-]?cost\s+emi|zero\s+down\s+payment|special\s+price|extra\s+off|flat\s*(?:₹|rs\.?|inr|\d+%)|up\s*to\s*(?:₹|rs\.?|inr|\d+%)|save\s*(?:₹|rs\.?|inr|\d+%)|festival|festive|diwali|sale\s+offer|exchange\s+bonus|coupon|voucher|hdfc|icici|sbi|axis|kotak|idfc|hsbc|amex|onecard|bajaj\s+finserv|credit\s+card|debit\s+card)/i;

const VALUE_OR_BANK_PATTERN =
  /(?:₹|rs\.?|inr|%|\boff\b|\bdiscount\b|\bcashback\b|\bbonus\b|\bno[\s-]?cost\s+emi\b|\bhdfc\b|\bicici\b|\bsbi\b|\baxis\b|\bkotak\b|\bidfc\b|\bhsbc\b|\brbl\b|\bindusind\b|\bonecard\b|\bamex\b|\bbajaj\b)/i;

/**
 * Decodes common HTML entities and escaped unicode sequences returned inside inline JSON/HTML.
 */
export function decodeOfferText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u20b9/gi, '₹')
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8377;|&rupee;|&#x20b9;/gi, '₹')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips common retailer UI CTA suffixes ("T&C", "View Plans", "Details", "Know More").
 */
export function cleanOfferDescription(raw: string): string {
  let text = decodeOfferText(raw);
  text = text
    .replace(/^(?:bank offer|partner offer|special price|no cost emi|cashback|festival offer)\s*[:\-–|]\s*/i, '')
    .replace(/\s*(?:\|\s*)?(?:T&Cs?\s*apply|T&C|Terms\s*&\s*Conditions|Know More|View Plans|See Details|Check eligibility|Here's how|Details|Apply)\s*\.?$/gi, '')
    .replace(/\s*\(\s*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading bullet markers or punctuation
  text = text.replace(/^[•·\-\*:\s]+/, '').trim();
  return text;
}

/**
 * Validates that an extracted string is a real discount/bank/EMI offer and not webpage boilerplate.
 */
export function isGenuineOfferText(text: string): boolean {
  if (!text || text.length < 14 || text.length > 210) return false;
  if (JUNK_TEXT_PATTERNS.some((rx) => rx.test(text))) return false;
  if (!OFFER_SIGNAL_PATTERN.test(text)) return false;
  if (!VALUE_OR_BANK_PATTERN.test(text)) return false;
  return true;
}

export function detectBankName(text: string): string | null {
  for (const bank of KNOWN_BANKS) {
    if (bank.pattern.test(text)) {
      return bank.label;
    }
  }
  return null;
}

export function classifyOffer(description: string): StoreDiscountOffer {
  const bank = detectBankName(description);
  const lower = description.toLowerCase();

  let type: OfferCategory = 'BANK';
  let title = 'Bank Offer';

  if (/\b(?:festival|festive|diwali|holi|big billion|great indian|republic|independence|sale offer|special price)\b/i.test(lower)) {
    type = 'FESTIVAL';
    title = lower.includes('special price') ? 'Special Price' : 'Festival Offer';
  } else if (/\bcashback\b/i.test(lower)) {
    type = 'CASHBACK';
    title = bank ? `${bank} Cashback` : 'Cashback Offer';
  } else if (/\b(?:no[\s-]?cost\s+emi|zero\s+down\s+payment)\b/i.test(lower) && !/\binstant\s+discount\b/i.test(lower)) {
    type = 'EMI';
    title = bank ? `${bank} No-Cost EMI` : 'No-Cost EMI';
  } else if (/\bexchange\s+(?:bonus|offer|discount)\b/i.test(lower)) {
    type = 'EXCHANGE';
    title = 'Exchange Bonus';
  } else if (/\b(?:coupon|voucher)\b/i.test(lower)) {
    type = 'COUPON';
    title = 'Coupon Offer';
  } else if (bank) {
    type = 'BANK';
    title = lower.includes('credit card')
      ? `${bank} Credit Card`
      : lower.includes('debit card')
      ? `${bank} Debit Card`
      : `${bank} Offer`;
  } else if (/\bemi\b/i.test(lower)) {
    type = 'EMI';
    title = 'EMI Offer';
  } else if (/\b(?:credit card|debit card|upi)\b/i.test(lower)) {
    type = 'BANK';
    title = lower.includes('upi') ? 'UPI Offer' : 'Card Offer';
  }

  return {
    type,
    title,
    description,
    bank,
  };
}

/**
 * Normalizes, deduplicates, prioritizes and caps raw offer strings into structured badges.
 */
export function normalizeOffersList(rawTexts: string[]): StoreDiscountOffer[] {
  const seen = new Set<string>();
  const results: StoreDiscountOffer[] = [];

  for (const raw of rawTexts) {
    const cleaned = cleanOfferDescription(raw);
    if (!isGenuineOfferText(cleaned)) continue;

    // Deduplicate case-insensitively on alphanumeric core
    const fingerprint = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
    if (!fingerprint || seen.has(fingerprint)) continue;

    // Skip if almost identical to an already added offer
    const isSubstringDup = results.some((existing) => {
      const exNorm = existing.description.toLowerCase();
      const curNorm = cleaned.toLowerCase();
      return exNorm.includes(curNorm) || curNorm.includes(exNorm);
    });
    if (isSubstringDup) continue;

    seen.add(fingerprint);
    results.push(classifyOffer(cleaned));
    if (results.length >= MAX_OFFERS_PER_STORE) break;
  }

  // Prioritize Bank / Festival / Cashback offers before EMI / Exchange
  const priority: Record<OfferCategory, number> = {
    BANK: 0,
    FESTIVAL: 1,
    CASHBACK: 2,
    COUPON: 3,
    EMI: 4,
    EXCHANGE: 5,
  };
  results.sort((a, b) => priority[a.type] - priority[b.type]);
  return results;
}

function stripNonContentHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
}

function extractPageTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const clean = decodeOfferText(h1[1]);
    if (clean.length >= 4) return clean;
  }
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeOfferText(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? decodeOfferText(title[1]) : '';
}

function extractAmazonTitle(html: string): string {
  const prodTitle = html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  if (prodTitle) return decodeOfferText(prodTitle[1]);
  return extractPageTitle(html);
}

export function isPageTitleMatchingProduct(
  pageTitle: string,
  productName: string,
  targetSpecs?: TargetSpecs,
): boolean {
  if (!pageTitle || !productName) return true;
  const pLower = pageTitle.toLowerCase();
  const nLower = productName.toLowerCase();

  // 1. Accessory check
  const ACCESSORY_LIST = ['case', 'cover', 'back cover', 'tempered glass', 'screen protector', 'skin', 'cable', 'charger', 'pouch', 'strap'];
  for (const acc of ACCESSORY_LIST) {
    if (pLower.includes(acc) && !nLower.includes(acc)) {
      return false;
    }
  }

  // 2. Storage mismatch check (e.g. page is 128 GB when target is 256 GB)
  if (targetSpecs?.storage) {
    const targetStorageNum = targetSpecs.storage.match(/\d+/)?.[0];
    if (targetStorageNum) {
      const nonRamStorages = Array.from(
        pLower.matchAll(/\b(\d+)\s*(?:gb|tb)(?!\s*(?:ram|unified|memory))\b/gi),
      ).map((m) => m[1]);
      if (nonRamStorages.length > 0 && !nonRamStorages.includes(targetStorageNum)) {
        return false;
      }
    }
  }

  // 3. Brand check: must contain the target brand
  const brandWord = productName.trim().split(/\s+/)[0]?.toLowerCase();
  if (brandWord && !pLower.includes(brandWord)) {
    const coreTokens = nLower.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((t) => t.length > 3);
    const sharedTokens = coreTokens.filter((t) => pLower.includes(t));
    if (sharedTokens.length < 2) {
      return false;
    }
  }

  // 4. Variant tier conflicts (e.g. Ultra vs base, Pro vs base, Max vs base)
  const CRITICAL_VARIANTS = ['ultra', 'pro', 'plus', 'max', 'mini', 'lite', 'fe'];
  for (const v of CRITICAL_VARIANTS) {
    const targetHas = new RegExp(`\\b${v}\\b`, 'i').test(nLower);
    const pageHas = new RegExp(`\\b${v}\\b`, 'i').test(pLower);
    if (!targetHas && pageHas) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts real-time Bank, Card, Cashback, Festival & EMI offers from an Amazon product page HTML.
 */
export function extractAmazonOffersFromHtml(
  html: string,
  productName: string,
  targetSpecs?: TargetSpecs,
): { status: 'ok' | 'blocked' | 'mismatch'; offers: StoreDiscountOffer[] } {
  if (!html || html.length < 150) return { status: 'blocked', offers: [] };

  if (
    html.includes('validateCaptcha') ||
    html.includes('Robot Check') ||
    html.includes('Type the characters you see in this image')
  ) {
    return { status: 'blocked', offers: [] };
  }

  const pageTitle = extractAmazonTitle(html);
  if (pageTitle && productName) {
    if (!isPageTitleMatchingProduct(pageTitle, productName, targetSpecs)) {
      return { status: 'mismatch', offers: [] };
    }
  }

  const candidates: string[] = [];

  // 1. Collect Amazon SOPP / VSX / Promotions offer feature containers
  const sectionMarkers = [
    'id="vsx-offers-holder"',
    'id="sopp_feature_div"',
    'id="itembox-InstantBankDiscount"',
    'id="itembox-NoCostEmi"',
    'id="itembox-Cashback"',
    'id="itembox-Partner"',
    'id="promotions_feature_div"',
    'class="offers-items"',
  ];

  for (const marker of sectionMarkers) {
    let idx = html.indexOf(marker);
    while (idx !== -1) {
      const slice = html.slice(idx, idx + 12000);
      const cleanSlice = stripNonContentHtml(slice);

      for (const m of cleanSlice.matchAll(/class="[^"]*(?:a-truncate-full|offers-items-content|vsx-offers-desktop-lv__item)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/gi)) {
        candidates.push(m[1]);
      }
      for (const m of cleanSlice.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        candidates.push(m[1]);
      }
      for (const m of cleanSlice.matchAll(/<(?:span|p|div)[^>]*>([^<]{18,220})<\/(?:span|p|div)>/gi)) {
        candidates.push(m[1]);
      }

      idx = html.indexOf(marker, idx + marker.length);
    }
  }

  // 2. Fallback: inline JSON promotion descriptions embedded in Amazon SSR scripts
  for (const m of html.matchAll(/"(?:shortDescription|promotionText|displayString|offerDescription)"\s*:\s*"([^"]{15,240})"/gi)) {
    candidates.push(m[1]);
  }

  return { status: 'ok', offers: normalizeOffersList(candidates) };
}

/**
 * Extracts real-time Bank, Special Price, Cashback & EMI offers from a Flipkart product page HTML.
 */
export function extractFlipkartOffersFromHtml(
  html: string,
  productName: string,
  targetSpecs?: TargetSpecs,
): { status: 'ok' | 'blocked' | 'mismatch'; offers: StoreDiscountOffer[] } {
  if (!html || html.length < 150) return { status: 'blocked', offers: [] };

  const lowerHtml = html.toLowerCase();
  if (
    lowerHtml.includes('access denied') ||
    lowerHtml.includes('cf-browser-verification') ||
    (lowerHtml.includes('something went wrong!') && !html.includes('Available offers') && !html.includes('__INITIAL_STATE__'))
  ) {
    return { status: 'blocked', offers: [] };
  }

  const pageTitle = extractPageTitle(html);
  if (pageTitle && productName && !pageTitle.toLowerCase().includes('online shopping india')) {
    if (!isPageTitleMatchingProduct(pageTitle, productName, targetSpecs)) {
      return { status: 'mismatch', offers: [] };
    }
  }

  const candidates: string[] = [];

  // 1. Modern Flipkart __INITIAL_STATE__ JSON extraction (NepOffers / bankOfferGrid / offerSummariesRC)
  const scriptMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (scriptMatch) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      const slots =
        data?.multiWidgetState?.widgetsData?.slots ||
        data?.multiWidgetState?.widgetsData?.completeSlots ||
        [];
      for (const slot of slots) {
        const offers = slot?.slotData?.widget?.data?.offers;
        if (Array.isArray(offers)) {
          for (const off of offers) {
            const summaries = off?.value?.offerSummariesRC || [];
            for (const s of summaries) {
              const grids = s?.value?.bankOfferGrid || [];
              for (const g of grids) {
                const v = g?.value || {};
                const title = v.offerTitle || g?.tracking?.metaInfoLabelKey || 'Bank Offer';
                const discount = v.discountedPriceText || g?.tracking?.metaInfoLabelValue || '';
                const sub = v.offerSubTitleRC?.value?.contentList?.map((c: any) => c.contentValue).filter(Boolean).join(' ') || '';
                const staticText =
                  v.actionCta?.action?.params?.offerBottomsheetDetails?.value?.staticData
                    ?.map((d: any) => d.contentValue)
                    .filter(Boolean)
                    .join('. ') || '';

                let fullText = `${title}: ${discount ? discount + ' - ' : ''}${sub}`;
                if (staticText) fullText += ` (${staticText})`;
                candidates.push(fullText);
              }
            }
          }
        }
      }
    } catch {
      // Proceed to regex fallbacks
    }
  }

  // 2. High-speed regex fallbacks on modern & classic SSR JSON
  for (const m of html.matchAll(/"offerTitle"\s*:\s*"([^"]+)"[\s\S]{0,350}?"discountedPriceText"\s*:\s*"([^"]+)"/g)) {
    candidates.push(`Bank Offer: ${m[1]} - ${m[2]}`);
  }

  for (const m of html.matchAll(
    /"(?:title|tag|offerType)"\s*:\s*"(Bank Offer|Special Price|Cashback|No [Cc]ost EMI|Partner Offer|Festival Offer|Extra [^"]+)"[\s\S]{0,350}?"(?:text|description|subTitle|details)"\s*:\s*"([^"]{12,240})"/gi,
  )) {
    candidates.push(`${m[1]}: ${m[2]}`);
  }

  for (const m of html.matchAll(/"descriptions"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]{12,240})"/gi)) {
    candidates.push(m[1]);
  }

  for (const m of html.matchAll(/"offerText"\s*:\s*"([^"]{12,240})"/gi)) {
    candidates.push(m[1]);
  }

  // 3. DOM "Available offers" block
  const availIdx = html.search(/Available offers/i);
  if (availIdx !== -1) {
    const slice = stripNonContentHtml(html.slice(availIdx, availIdx + 12000));
    for (const m of slice.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      candidates.push(m[1]);
    }
    for (const m of slice.matchAll(/<(?:span|div|p)[^>]*>([^<]{16,230})<\/(?:span|div|p)>/gi)) {
      candidates.push(m[1]);
    }
  }

  return { status: 'ok', offers: normalizeOffersList(candidates) };
}

/**
 * Recursively collects potential offer strings from parsed JSON payloads (Next.js __NEXT_DATA__, Croma API, etc.).
 */
function collectOfferStringsFromJson(node: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 8 || node === null || node === undefined) return out;
  if (typeof node === 'string') {
    if (node.length >= 14 && node.length <= 240 && OFFER_SIGNAL_PATTERN.test(node)) {
      out.push(node);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 60)) {
      collectOfferStringsFromJson(item, depth + 1, out);
    }
    return out;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const kLower = k.toLowerCase();
      // Prioritize keys that look like offer/promo/bank objects or strings
      if (
        typeof v === 'string' &&
        (kLower.includes('offer') ||
          kLower.includes('promo') ||
          kLower.includes('discount') ||
          kLower.includes('cashback') ||
          kLower.includes('bank') ||
          kLower.includes('emi') ||
          kLower.includes('description') ||
          kLower.includes('subtitle'))
      ) {
        if (v.length >= 14 && v.length <= 240) out.push(v);
      } else {
        collectOfferStringsFromJson(v, depth + 1, out);
      }
    }
  }
  return out;
}

/**
 * Extracts real-time Bank, Festival, Cashback & EMI offers from Croma HTML / __NEXT_DATA__.
 */
export function extractCromaOffersFromHtml(
  html: string,
  productName: string,
  targetSpecs?: TargetSpecs,
): { status: 'ok' | 'blocked' | 'mismatch'; offers: StoreDiscountOffer[] } {
  if (!html || html.length < 150) return { status: 'blocked', offers: [] };

  const pageTitle = extractPageTitle(html);
  if (pageTitle && productName && !pageTitle.toLowerCase().includes('croma')) {
    if (!isPageTitleMatchingProduct(pageTitle, productName, targetSpecs)) {
      return { status: 'mismatch', offers: [] };
    }
  }

  const candidates: string[] = [];

  // 1. Next.js __NEXT_DATA__ JSON & Croma window.__INITIAL_DATA__
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      collectOfferStringsFromJson(parsed, 0, candidates);
    } catch {
      // Ignore malformed JSON
    }
  }

  const initDataMatch = html.match(/window\.__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/);
  if (initDataMatch) {
    try {
      const cleanJson = initDataMatch[1].replace(/:\s*undefined/g, ': null');
      const parsed = JSON.parse(cleanJson);
      collectOfferStringsFromJson(parsed, 0, candidates);
    } catch {
      // Ignore
    }
  }

  // 2. Inline promo/offer JSON strings
  for (const m of html.matchAll(
    /"(?:bankOffer|promoDescription|offerDescription|offerText|discountMessage|description)"\s*:\s*"([^"]{14,240})"/gi,
  )) {
    candidates.push(m[1]);
  }

  // 3. Clean HTML offer tags
  const cleanHtml = stripNonContentHtml(html);
  for (const m of cleanHtml.matchAll(/<(?:li|p|span|div)[^>]*>([^<]{16,220})<\/(?:li|p|span|div)>/gi)) {
    if (OFFER_SIGNAL_PATTERN.test(m[1])) {
      candidates.push(m[1]);
    }
  }

  return { status: 'ok', offers: normalizeOffersList(candidates) };
}

/**
 * Extracts real-time Bank, Card, Festival & EMI offers from Vijay Sales and Official Brand Store HTML.
 */
export function extractGenericRetailerOffersFromHtml(
  html: string,
  storeName: string,
  productName: string,
  targetSpecs?: TargetSpecs,
): { status: 'ok' | 'blocked' | 'mismatch'; offers: StoreDiscountOffer[] } {
  if (!html || html.length < 150) return { status: 'blocked', offers: [] };

  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('access denied') && html.length < 4000) {
    return { status: 'blocked', offers: [] };
  }

  const pageTitle = extractPageTitle(html);
  // Enforce variant check when the page title explicitly refers to a model name
  if (pageTitle && productName && pageTitle.length > 6) {
    const brandWord = productName.split(/\s+/)[0]?.toLowerCase() || '';
    if (brandWord && pageTitle.toLowerCase().includes(brandWord)) {
      const match = matchProductVariant(pageTitle, productName, targetSpecs);
      if (!match.matches) {
        return { status: 'mismatch', offers: [] };
      }
    }
  }

  const candidates: string[] = [];

  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      collectOfferStringsFromJson(JSON.parse(nextDataMatch[1]), 0, candidates);
    } catch {
      // Ignore malformed JSON
    }
  }

  for (const m of html.matchAll(
    /"(?:offerText|bankOffer|promoText|promotionText|discountText|benefitDescription|subtitle)"\s*:\s*"([^"]{14,240})"/gi,
  )) {
    candidates.push(m[1]);
  }

  const cleanHtml = stripNonContentHtml(html);
  for (const m of cleanHtml.matchAll(/<(?:li|p|span|div)[^>]*>([^<]{16,220})<\/(?:li|p|span|div)>/gi)) {
    if (OFFER_SIGNAL_PATTERN.test(m[1])) {
      candidates.push(m[1]);
    }
  }

  return { status: 'ok', offers: normalizeOffersList(candidates) };
}

async function fetchHtml(url: string, headers: Record<string, string>, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAmazonDirectUrl(productName: string, targetSpecs?: TargetSpecs): Promise<string | null> {
  const qTokens = [productName.replace(/\(.*?\)/g, '').trim()];
  if (targetSpecs?.storage && !qTokens[0].toLowerCase().includes(targetSpecs.storage.toLowerCase().replace(/\s+/g, ''))) {
    qTokens.push(targetSpecs.storage);
  }
  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(qTokens.join(' '))}`;
  const html = await fetchHtml(searchUrl, AMAZON_OFFER_HEADERS, 5000);
  if (!html || html.includes('validateCaptcha')) return null;

  const candidates: { asin: string; score: number }[] = [];
  const asinRegex = /data-asin="([A-Z0-9]{10})"[\s\S]{0,2500}?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  for (const m of html.matchAll(asinRegex)) {
    const asin = m[1];
    const title = decodeOfferText(m[2]);
    if (!asin || !title) continue;
    const match = matchProductVariant(title, productName, targetSpecs);
    if (match.matches) {
      candidates.push({ asin, score: match.score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return `https://www.amazon.in/dp/${candidates[0].asin}`;
}

async function resolveCromaDirectUrl(productName: string, targetSpecs?: TargetSpecs): Promise<string | null> {
  const clean = productName.replace(/\(.*?\)/g, '').trim();
  const searchUrl = `https://www.croma.com/searchB?q=${encodeURIComponent(clean)}`;
  const html = await fetchHtml(searchUrl, BROWSER_HEADERS, 5000);
  if (!html) return null;

  const candidates: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/href="(\/[a-z0-9-]+\/p\/[0-9]{5,8})"/gi)) {
    const pathUrl = m[1];
    const slugTitle = pathUrl.split('/p/')[0].replace(/[\/-]+/g, ' ').trim();
    const match = matchProductVariant(slugTitle, productName, targetSpecs);
    if (match.matches) {
      candidates.push({ url: `https://www.croma.com${pathUrl}`, score: match.score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

async function fetchCromaApiOffers(productUrl: string): Promise<StoreDiscountOffer[]> {
  const skuMatch = productUrl.match(/\/p\/([0-9]{5,8})/i);
  if (!skuMatch) return [];
  const sku = skuMatch[1];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      `https://api.croma.com/product/allchannels/v1/product/${sku}`,
      {
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'application/json',
          Origin: 'https://www.croma.com',
          Referer: productUrl,
        },
        signal: controller.signal,
      },
    );
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const rawStrings = collectOfferStringsFromJson(data);
    return normalizeOffersList(rawStrings);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDirectPageForOffers(
  store: CandidateStoreInput,
  productName: string,
  targetSpecs?: TargetSpecs,
): Promise<string> {
  const sLower = (store.store || store.storeSlug || '').toLowerCase();
  let url = await resolveDirectStoreUrl(store.url, store.store, productName);

  const urlLower = url.toLowerCase();
  if (sLower.includes('amazon') && (urlLower.includes('/s?') || urlLower.includes('/s/') || !urlLower.includes('/dp/'))) {
    const resolved = await resolveAmazonDirectUrl(productName, targetSpecs);
    if (resolved) url = resolved;
  } else if (sLower.includes('flipkart') && (urlLower.includes('/search') || !urlLower.includes('/p/itm'))) {
    const resolved = await resolveFlipkartDirectUrl(productName);
    if (resolved) url = resolved;
  } else if (sLower.includes('croma') && (urlLower.includes('/search') || !urlLower.includes('/p/'))) {
    const resolved = await resolveCromaDirectUrl(productName, targetSpecs);
    if (resolved) url = resolved;
  }

  // Final safety: reject if URL itself clearly points to an accessory or different generation
  const mismatch = checkProductUrlModelMismatch(url, productName);
  if (mismatch.isMismatch) {
    return store.url;
  }
  return url;
}

async function scrapeOffersForSingleStore(
  store: CandidateStoreInput,
  productName: string,
  targetSpecs?: TargetSpecs,
): Promise<StoreOffersEntry> {
  const now = new Date();
  const expires = new Date(now.getTime() + OFFERS_CACHE_TTL_SECONDS * 1000);
  const directUrl = await resolveDirectPageForOffers(store, productName, targetSpecs);
  const sLower = (store.storeSlug || store.store || '').toLowerCase();
  const urlLower = directUrl.toLowerCase();

  // Do not scrape offers from generic search result pages (no bank widgets exist there)
  const isSearchPage =
    urlLower.includes('/s?') ||
    urlLower.includes('/s/') ||
    urlLower.includes('/search?') ||
    urlLower.includes('/searchb?') ||
    urlLower.includes('searchvalue=');

  if (isSearchPage) {
    return {
      storeId: store.storeId,
      store: store.store,
      storeSlug: store.storeSlug,
      productUrl: directUrl,
      offers: [],
      source: 'unavailable',
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }

  if (sLower.includes('amazon') || urlLower.includes('amazon.')) {
    const html = await fetchHtml(directUrl, AMAZON_OFFER_HEADERS);
    if (!html) {
      return {
        storeId: store.storeId,
        store: store.store,
        storeSlug: store.storeSlug,
        productUrl: directUrl,
        offers: [],
        source: 'unavailable',
        fetchedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
    }
    const parsed = extractAmazonOffersFromHtml(html, productName, targetSpecs);
    return {
      storeId: store.storeId,
      store: store.store,
      storeSlug: store.storeSlug,
      productUrl: directUrl,
      offers: parsed.offers,
      source: parsed.status === 'ok' ? 'live_scraped' : 'unavailable',
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }

  if (sLower.includes('flipkart') || urlLower.includes('flipkart.com')) {
    const html = await fetchHtml(directUrl, BROWSER_HEADERS);
    if (!html) {
      return {
        storeId: store.storeId,
        store: store.store,
        storeSlug: store.storeSlug,
        productUrl: directUrl,
        offers: [],
        source: 'unavailable',
        fetchedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
    }
    const parsed = extractFlipkartOffersFromHtml(html, productName, targetSpecs);
    return {
      storeId: store.storeId,
      store: store.store,
      storeSlug: store.storeSlug,
      productUrl: directUrl,
      offers: parsed.offers,
      source: parsed.status === 'ok' ? 'live_scraped' : 'unavailable',
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }

  if (sLower.includes('croma') || urlLower.includes('croma.com')) {
    const [html, apiOffers] = await Promise.all([
      fetchHtml(directUrl, BROWSER_HEADERS),
      fetchCromaApiOffers(directUrl),
    ]);
    const htmlParsed = html ? extractCromaOffersFromHtml(html, productName, targetSpecs) : { status: 'blocked' as const, offers: [] };
    const merged = normalizeOffersList([
      ...apiOffers.map((o) => o.description),
      ...htmlParsed.offers.map((o) => o.description),
    ]);

    return {
      storeId: store.storeId,
      store: store.store,
      storeSlug: store.storeSlug,
      productUrl: directUrl,
      offers: merged,
      source: merged.length > 0 || htmlParsed.status === 'ok' ? 'live_scraped' : 'unavailable',
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }

  // Vijay Sales & Official Brand Stores
  const html = await fetchHtml(directUrl, BROWSER_HEADERS);
  if (!html) {
    return {
      storeId: store.storeId,
      store: store.store,
      storeSlug: store.storeSlug,
      productUrl: directUrl,
      offers: [],
      source: 'unavailable',
      fetchedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }
  const parsed = extractGenericRetailerOffersFromHtml(html, store.store, productName, targetSpecs);
  return {
    storeId: store.storeId,
    store: store.store,
    storeSlug: store.storeSlug,
    productUrl: directUrl,
    offers: parsed.offers,
    source: parsed.status === 'ok' ? 'live_scraped' : 'unavailable',
    fetchedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export function normalizeCanonicalStoreSlug(rawSlugOrName: string): string {
  const s = (rawSlugOrName || '').toLowerCase().trim();
  if (s.includes('amazon')) return 'amazon';
  if (s.includes('flipkart')) return 'flipkart';
  if (s.includes('croma')) return 'croma';
  if (s.includes('vijay')) return 'vijay_sales';
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'store';
}

/**
 * Looks up any recently cached SerpApi live store URLs for this product so offers cover
 * newly discovered stores (Flipkart, Vijay Sales, Brand Store) without making another SerpApi call.
 */
async function collectCandidateStores(
  productName: string,
  brandName: string,
  dbStores: CandidateStoreInput[] = [],
): Promise<CandidateStoreInput[]> {
  const bySlug = new Map<string, CandidateStoreInput>();
  const storesList = Array.isArray(dbStores) ? dbStores : [];

  for (const s of storesList) {
    const match = matchAllowedStore(s.store, brandName, productName);
    if (!match) continue;
    const key = match.key === 'brand' ? normalizeCanonicalStoreSlug(match.displayName) : match.key;
    bySlug.set(key, { ...s, storeSlug: key });
  }

  const cleanQuery = productName
    .replace(/\(.*?\)/g, '')
    .replace(/\b5g\b/gi, '')
    .replace(/\b4g\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const serpCacheKey = `serp_live::${cleanQuery.toLowerCase()}::${(brandName || '').toLowerCase()}`;

  const cachedSerp = await livePriceCache.get<SerpStoreRate[]>(serpCacheKey);
  if (Array.isArray(cachedSerp)) {
    for (const rate of cachedSerp) {
      const key =
        rate.storeSlug === 'brand'
          ? normalizeCanonicalStoreSlug(rate.store)
          : normalizeCanonicalStoreSlug(rate.storeSlug || rate.store);
      const existing = bySlug.get(key);
      const isSerpDirect = Boolean(rate.url && (rate.url.includes('/dp/') || rate.url.includes('/p/')));
      const isExistingSmartprix = Boolean(existing?.url?.includes('smartprix.com'));
      if (!existing || isSerpDirect || isExistingSmartprix) {
        bySlug.set(key, {
          storeId: rate.storeId,
          store: rate.store,
          storeSlug: key,
          url: rate.url,
        });
      }
    }
  }

  // Ensure Flipkart & Amazon are attempted dynamically if missing from DB/SerpApi
  if (!bySlug.has('amazon')) {
    bySlug.set('amazon', {
      storeId: 'amazon-offers',
      store: 'Amazon',
      storeSlug: 'amazon',
      url: `https://www.amazon.in/s?k=${encodeURIComponent(cleanQuery)}`,
    });
  }
  if (!bySlug.has('flipkart')) {
    bySlug.set('flipkart', {
      storeId: 'flipkart-offers',
      store: 'Flipkart',
      storeSlug: 'flipkart',
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(cleanQuery)}`,
    });
  }

  return Array.from(bySlug.values());
}

/**
 * Fetches & syncs real-time Bank, Credit Card, Cashback, Festival & EMI offers strictly keyed
 * to a single productId across all its verified stores, with a 30-minute freshness cache.
 * Completely independent from live price fetching & persistence.
 */
export async function getLiveOffersForProduct(
  product: { id: string; name: string; brand: string },
  dbStores: CandidateStoreInput[],
  targetSpecs?: TargetSpecs,
  opts: { forceRefresh?: boolean } = {},
): Promise<ProductLiveOffersResponse> {
  const cacheKey = `live_offers::${product.id}`;

  if (opts.forceRefresh) {
    await livePriceCache.evict(cacheKey);
  } else {
    const cached = await livePriceCache.get<ProductLiveOffersResponse>(cacheKey);
    if (cached && cached.productId === product.id) {
      const cachedMap: Record<string, StoreOffersEntry> = {};
      for (const [k, v] of Object.entries(cached.offersByStore)) {
        cachedMap[k] = { ...v, source: v.offers.length > 0 ? 'cache' : v.source };
      }
      return {
        ...cached,
        offersByStore: cachedMap,
        fromCache: true,
      };
    }
  }

  const inFlightKey = `${product.id}::${Boolean(opts.forceRefresh)}`;
  const existingPromise = inFlightOfferFetches.get(inFlightKey);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<ProductLiveOffersResponse> => {
    try {
      const candidates = await collectCandidateStores(product.name, product.brand, dbStores);
      const settled = await Promise.allSettled(
        candidates.map((store) => scrapeOffersForSingleStore(store, product.name, targetSpecs)),
      );

      const offersByStore: Record<string, StoreOffersEntry> = {};
      for (const res of settled) {
        if (res.status === 'fulfilled') {
          const entry = res.value;
          offersByStore[entry.storeSlug.toLowerCase()] = entry;
        }
      }

      const payload: ProductLiveOffersResponse = {
        productId: product.id,
        productName: product.name,
        offersByStore,
        fetchedAt: new Date().toISOString(),
        fromCache: false,
      };

      await livePriceCache.set(cacheKey, payload, OFFERS_CACHE_TTL_SECONDS);
      return payload;
    } finally {
      inFlightOfferFetches.delete(inFlightKey);
    }
  })();

  inFlightOfferFetches.set(inFlightKey, task);
  return task;
}
