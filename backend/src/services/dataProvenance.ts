/**
 * Data provenance and price verification service.
 * Distinguishes verified scraped prices from synthetic seed fixtures,
 * verifies price freshness, and ensures genuine price drop events.
 */

// 11 synthetic seed products originating from prisma/seed.ts (with mulberry32 generated history)
export const SYNTHETIC_PRODUCT_IDS = new Set<string>([
  '268d1167-c457-4df1-84ce-ff581baa72e3', // 55" C3 OLED evo 4K Smart TV
  '4511126f-7640-4f4b-94ac-ac38ece0b3f8', // Galaxy S25 Ultra 256GB Titanium Black
  'f1a7d974-a91f-4f86-8217-3ae3842300c5', // iPhone 16 Pro Max 256GB Natural Titanium
  '221d9eb2-44ed-48c3-b8c7-5ea7e0b0b9d5', // MacBook Air M3 13" 8GB 256GB Midnight
  'ef57ef25-9ba7-4767-8c55-1e51e6eb92fe', // Motorola Edge 50 Fusion 5G (8GB RAM + 128GB)
  '48f42ba0-b56f-49c4-bdfa-1cf69fff2bb8', // Motorola Moto G85 5G (8GB RAM + 128GB)
  '348b5c10-c51f-4146-b982-8fb229d136ca', // OnePlus 12R 5G (8GB RAM + 128GB)
  '35a92d18-ac9a-4412-869c-4d3b875dd380', // OnePlus Nord CE4 5G (8GB RAM + 128GB)
  'cddc2850-fa03-4c81-b46d-44d2073b7afb', // Pixel 9 Pro 128GB Obsidian
  '1875c715-b872-4939-9a89-dc537abd539a', // Vivo V40 5G (8GB RAM + 256GB)
  '2d0a29d9-6f0f-4024-bfda-d195b5fed705', // WH-1000XM5 Wireless Noise Cancelling Headphones
]);

// Known titles of seeded mock products
export const SYNTHETIC_PRODUCT_TITLES = [
  'wh-1000xm5 wireless noise cancelling headphones',
  'iphone 16 pro max 256gb natural titanium',
  'galaxy s25 ultra 256gb titanium black',
  'macbook air m3 13" 8gb 256gb midnight',
  'motorola edge 50 fusion 5g',
  'motorola moto g85 5g',
  'oneplus 12r 5g',
  'oneplus nord ce4 5g',
  'pixel 9 pro 128gb obsidian',
  'vivo v40 5g',
  '55" c3 oled evo 4k smart tv',
];

export interface ProvenanceProduct {
  id?: string;
  name?: string;
  stores?: Array<{
    externalId?: string | null;
    productUrl?: string | null;
  }>;
}

/**
 * Checks whether a product originates from synthetic/seed data rather than live scraping.
 */
export const isSyntheticProduct = (product: ProvenanceProduct | null | undefined): boolean => {
  if (!product) return false;

  if (product.id && SYNTHETIC_PRODUCT_IDS.has(product.id)) {
    return true;
  }

  const nameLower = (product.name || '').toLowerCase().trim();
  if (nameLower && SYNTHETIC_PRODUCT_TITLES.some((title) => nameLower.includes(title))) {
    // If it has no stores or all stores lack an external ID, treat as synthetic seed
    const stores = product.stores || [];
    const hasVerifiedStoreListing = stores.some((s) => Boolean(s.externalId));
    if (!hasVerifiedStoreListing) {
      return true;
    }
  }

  // If stores exist, check if all of them are mock seed listings (no externalId and search URL)
  if (product.stores && product.stores.length > 0) {
    const allLackExternalId = product.stores.every((s) => !s.externalId);
    const allSearchUrls = product.stores.every((s) => {
      const url = s.productUrl || '';
      return url.includes('/s?k=') || url.includes('/search?q=') || url.includes('/searchB?q=');
    });
    if (allLackExternalId && allSearchUrls) {
      return true;
    }
  }

  return false;
};

// Default freshness window: 7 days (168 hours) to accommodate periodic scrapers while excluding stale observations
export const DEFAULT_MAX_PRICE_AGE_HOURS = 168;

/**
 * Determines whether a price observation is fresh enough to warrant an alert.
 * Stale, missing, or future-dated observations are rejected.
 */
export const isPriceFresh = (
  lastCheckedAt: Date | string | null | undefined,
  maxAgeHours = DEFAULT_MAX_PRICE_AGE_HOURS,
): boolean => {
  if (!lastCheckedAt) return false;

  const date = typeof lastCheckedAt === 'string' ? new Date(lastCheckedAt) : lastCheckedAt;
  const time = date.getTime();
  if (Number.isNaN(time)) return false;

  const now = Date.now();
  // Reject future timestamps older than 5 minutes tolerance
  if (time > now + 5 * 60 * 1000) return false;

  const ageMs = now - time;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return ageMs <= maxAgeMs;
};

/**
 * Validates whether a price change represents a genuine verified price reduction.
 */
export const validatePriceDrop = (
  previousPrice: number | null | undefined,
  currentPrice: number,
): { isDrop: boolean; savings: number; savingsPercent: number | null } => {
  if (
    previousPrice === null ||
    previousPrice === undefined ||
    !Number.isFinite(previousPrice) ||
    !Number.isFinite(currentPrice) ||
    previousPrice <= currentPrice ||
    currentPrice <= 0
  ) {
    return { isDrop: false, savings: 0, savingsPercent: null };
  }

  const savings = previousPrice - currentPrice;
  const savingsPercent = Math.round((savings / previousPrice) * 100);
  return { isDrop: true, savings, savingsPercent };
};
