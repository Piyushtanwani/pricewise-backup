/**
 * Product Matcher Utility
 * 
 * Implements strict Jaccard similarity and token overlap checks before mapping
 * scraped store listings or search results to existing database Product entities.
 * Discards store search results that diverge or point to conflicting variants.
 */

const VARIANT_WORDS = new Set([
  'pro',
  'max',
  'plus',
  'ultra',
  'mini',
  'lite',
  'air',
  'fe',
  'neo',
  'se',
  'fold',
  'flip',
  'play',
  'power',
  'prime',
]);

const ACCESSORY_WORDS = new Set([
  'case',
  'cover',
  'glass',
  'protector',
  'tempered',
  'skin',
  'charger',
  'cable',
  'adapter',
  'pouch',
  'strap',
  'holder',
  'stand',
]);

/**
 * Tokenizes a title into a set of lowercased alphanumeric words with length > 2.
 */
export function tokenizeTitle(str: string): Set<string> {
  if (!str || typeof str !== 'string') return new Set();
  return new Set(
    str
      .toLowerCase()
      .replace(/[^\w\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Calculates Jaccard similarity (intersection over union) between two titles.
 */
export function calculateJaccardSimilarity(targetTitle: string, scrapedTitle: string): number {
  const targetTokens = tokenizeTitle(targetTitle);
  const scrapedTokens = tokenizeTitle(scrapedTitle);

  if (targetTokens.size === 0 || scrapedTokens.size === 0) return 0;

  let intersection = 0;
  targetTokens.forEach((token) => {
    if (scrapedTokens.has(token)) intersection++;
  });

  const union = new Set([...targetTokens, ...scrapedTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if a scraped title has a variant conflict (e.g. Pro vs Non-Pro, or conflicting storage size).
 */
export function hasVariantMismatch(targetTitle: string, scrapedTitle: string): boolean {
  const targetTokens = tokenizeTitle(targetTitle);
  const scrapedTokens = tokenizeTitle(scrapedTitle);

  // 1. Variant keywords conflict check (e.g., iPhone 15 vs iPhone 15 Pro)
  const targetVariants = [...targetTokens].filter((t) => VARIANT_WORDS.has(t)).sort();
  const scrapedVariants = [...scrapedTokens].filter((t) => VARIANT_WORDS.has(t)).sort();

  if (targetVariants.join(',') !== scrapedVariants.join(',')) {
    return true;
  }

  // 2. Storage capacity conflict check (e.g., 128GB vs 256GB vs 512GB)
  const extractStorage = (str: string): string | null => {
    const match = str.toLowerCase().match(/(\d+)\s*(?:gb|tb)(?!\s*ram)/i);
    return match ? match[1] : null;
  };

  const targetStorage = extractStorage(targetTitle);
  const scrapedStorage = extractStorage(scrapedTitle);
  if (targetStorage && scrapedStorage && targetStorage !== scrapedStorage) {
    return true;
  }

  // 3. Accessory check: If target is not an accessory but scraped title contains accessory terms
  const targetHasAccessory = [...targetTokens].some((t) => ACCESSORY_WORDS.has(t));
  const scrapedHasAccessory = [...scrapedTokens].some((t) => ACCESSORY_WORDS.has(t));
  if (!targetHasAccessory && scrapedHasAccessory) {
    return true;
  }

  return false;
}

/**
 * Strict Jaccard similarity / token overlap check before mapping a scraped store item
 * to an existing database Product entity.
 * 
 * Discards results that diverge too much from the primary product name or contain
 * conflicting hardware/model variants.
 */
export function isExactProductMatch(targetTitle: string, scrapedTitle: string, threshold = 0.65): boolean {
  if (!targetTitle || !scrapedTitle) return false;

  const tokenize = (str: string) =>
    new Set(str.toLowerCase().replace(/[^\w\s]/gi, '').split(/\s+/).filter((w) => w.length > 2));

  const targetTokens = tokenize(targetTitle);
  const scrapedTokens = tokenize(scrapedTitle);

  if (targetTokens.size === 0 || scrapedTokens.size === 0) return false;

  let intersection = 0;
  targetTokens.forEach((token) => {
    if (scrapedTokens.has(token)) intersection++;
  });

  const union = new Set([...targetTokens, ...scrapedTokens]).size;
  const similarity = union === 0 ? 0 : intersection / union;

  return similarity >= threshold;
}
