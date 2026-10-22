/**
 * Retailer URL Sanitizer Utility
 * 
 * Preserves essential product identifiers (Amazon ASIN, Flipkart PID / ITM, Croma SKU)
 * while stripping volatile tracking bloat, affiliate query parameters, and session tokens
 * that cause deep-links to fail or fall back to generic store homepages.
 */

/**
 * URL parser to strictly retain required product identifiers
 * (like /dp/[A-Z0-9]{10} for Amazon or pid= for Flipkart) while discarding tracking bloat.
 */
export function sanitizeRetailerUrl(rawUrl: string, storeName = ''): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const sName = (storeName || '').toLowerCase();

    // Amazon URL sanitization (Keep ASIN, drop affiliate tracking except core routing)
    if (hostname.includes('amazon.') || sName.includes('amazon')) {
      const asinMatch =
        parsed.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
        parsed.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `https://${hostname}/dp/${asinMatch[1].toUpperCase()}`;
      }
    }

    // Flipkart URL sanitization (Keep base path and pid parameter if present)
    if (hostname.includes('flipkart.com') || sName.includes('flipkart')) {
      const pid = parsed.searchParams.get('pid');
      const cleanPath = parsed.pathname;
      if (pid) {
        return `https://${hostname}${cleanPath}?pid=${pid}`;
      }
      if (cleanPath.includes('/p/itm')) {
        return `https://${hostname}${cleanPath}`;
      }
    }

    // Croma URL sanitization (Keep SKU path, drop broken search terms and tracking)
    if (hostname.includes('croma.com') || sName.includes('croma')) {
      const skuMatch = parsed.pathname.match(/\/p\/([0-9]{5,8})/i);
      if (skuMatch) {
        return `https://${hostname}${parsed.pathname}`;
      }
    }

    // Vijay Sales URL sanitization
    if (hostname.includes('vijaysales.com') || sName.includes('vijay')) {
      if (parsed.pathname.includes('/p/') || parsed.pathname.includes('/item/')) {
        return `https://${hostname}${parsed.pathname}`;
      }
    }

    // Default fallback: return cleaned URL without tracking tokens
    const trackingKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'affid',
      'aff_id',
      'tag',
      'ref',
      'ref_',
      'ascsubtag',
    ];
    for (const key of trackingKeys) {
      parsed.searchParams.delete(key);
    }

    return parsed.toString();
  } catch (err) {
    console.error('Failed to parse retailer URL:', rawUrl);
    return rawUrl;
  }
}
