export type ProviderId = 'amazon' | 'flipkart';

/** A single store listing normalised from a provider response. */
export interface StoreOffer {
  provider: ProviderId;
  externalId: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  productUrl: string;
  price: number | null;
  mrp: number | null;
  currency: string;
  inStock: boolean;
  shippingCost: number | null;
  specs: string[];
}

export interface StoreProvider {
  id: ProviderId;
  /** Matches Store.slug in the database. */
  storeSlug: string;
  storeName: string;
  isConfigured(): boolean;
  /** Names of the environment variables that are still empty. */
  missingConfig(): string[];
  search(query: string, limit: number): Promise<StoreOffer[]>;
  /** Fetches current offers for known store identifiers (ASINs / FSNs). Missing ids are omitted. */
  getOffers(externalIds: string[]): Promise<StoreOffer[]>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

/** Accepts numbers or numeric strings such as "₹1,29,999.00"; returns null for anything else. */
export const toPrice = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};
