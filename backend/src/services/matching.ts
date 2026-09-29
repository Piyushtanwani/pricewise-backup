/**
 * Naive cross-store product identity matching on titles. It is deliberately conservative:
 * model numbers, storage sizes and variant words (Pro, Max, Ultra...) must agree, because a
 * false merge corrupts price comparison far more than a missed one. GTIN matching should
 * replace this once providers return barcodes.
 */

const STOP_WORDS = new Set(['with', 'and', 'the', 'for', 'of', 'in', 'by', 'new', 'edition', 'latest', 'model']);
const VARIANT_WORDS = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'air', 'fe', 'neo', 'se', 'fold', 'flip']);

export const titleTokens = (title: string, brand?: string | null): Set<string> => {
  const brandTokens = new Set((brand ?? '').toLowerCase().split(/\s+/).filter(Boolean));
  const normalised = title
    .toLowerCase()
    // Join sizes such as "256 GB" or "5000 mAh" into one token so they compare as a unit.
    .replace(/(\d+(?:\.\d+)?)\s*(gb|tb|mb|mah|mp|hz|w|inch|in|cm|mm)\b/g, '$1$2')
    .replace(/[^a-z0-9.]+/g, ' ');
  return new Set(
    normalised
      .split(' ')
      .map((t) => t.replace(/^\.+|\.+$/g, ''))
      .filter((t) => t && !STOP_WORDS.has(t) && !brandTokens.has(t)),
  );
};

const hasDigit = (t: string) => /\d/.test(t);

/** Returns a 0..1 score; 0 when model/variant tokens conflict. */
export const titleSimilarity = (a: string, b: string, brand?: string | null): number => {
  const ta = titleTokens(a, brand);
  const tb = titleTokens(b, brand);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [shorter, longer] = ta.size <= tb.size ? [ta, tb] : [tb, ta];

  for (const t of shorter) {
    if (hasDigit(t) && !longer.has(t)) return 0;
  }
  const variantsA = [...ta].filter((t) => VARIANT_WORDS.has(t)).sort().join(',');
  const variantsB = [...tb].filter((t) => VARIANT_WORDS.has(t)).sort().join(',');
  if (variantsA !== variantsB) return 0;

  let shared = 0;
  for (const t of shorter) if (longer.has(t)) shared++;
  return shared / shorter.size;
};

export const MATCH_THRESHOLD = 0.7;
