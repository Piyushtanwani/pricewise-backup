import https from 'node:https';
import { env } from '../../config/env';
import { Throttle } from '../../utils/cache';
import {
  SmartprixBrandItem,
  SmartprixDetailsParams,
  SmartprixPriceHistoryParams,
  SmartprixSearchParams,
} from './types';

export class ParseBotError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(`[Parse.bot Smartprix] ${message}`);
    this.name = 'ParseBotError';
  }
}

// Keep request rate friendly to avoid hitting burst rate limits (429)
const throttle = new Throttle(500);
const REQUEST_TIMEOUT_MS = 120_000;


export class SmartprixClient {
  private readonly baseUrl: string;
  private readonly scraperId: string;
  private readonly snapshotVersion: string;

  constructor() {
    this.baseUrl = env.parseBot.baseUrl;
    this.scraperId = env.parseBot.scraperId;
    this.snapshotVersion = env.parseBot.snapshotVersion;
  }

  public isConfigured(): boolean {
    return Boolean(env.parseBot.apiKey && env.parseBot.apiKey.trim() !== '');
  }

  public missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.isConfigured()) missing.push('PARSE_API_KEY');
    return missing;
  }

  private getApiKey(): string {
    const key = env.parseBot.apiKey;
    if (!key || key.trim() === '') {
      throw new ParseBotError('PARSE_API_KEY is not configured in backend/.env', 401);
    }
    return key.trim();
  }

  private buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}/scraper/${this.scraperId}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        url.searchParams.set(key, String(value).trim());
      }
    }
    return url.toString();
  }

  private async executeGet<T>(endpoint: string, queryParams: Record<string, string | number | undefined> = {}): Promise<T> {
    const apiKey = this.getApiKey();
    const targetUrl = this.buildUrl(endpoint, queryParams);

    return throttle.run(async () => {
      let response: Response;
      try {
        const headers: Record<string, string> = {
          'X-API-Key': apiKey,
          'Accept': 'application/json',
        };
        if (this.snapshotVersion) {
          headers['API-Snapshot-Version'] = this.snapshotVersion;
        }

        response = await fetch(targetUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown network failure';
        throw new ParseBotError(`Network error while connecting to Parse.bot: ${message}`, 503);
      }

      const text = await response.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new ParseBotError(
          `Invalid JSON response received from ${endpoint} (HTTP ${response.status})`,
          response.status,
          { rawPreview: text.slice(0, 300) },
        );
      }

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status} from ${endpoint}`;
        if (data && typeof data === 'object') {
          const errObj = (data as { error?: unknown }).error;
          if (typeof errObj === 'string') errorMsg = errObj;
          else if (errObj && typeof errObj === 'object') {
            const inner = errObj as { message?: string; status?: string };
            errorMsg = inner.message || inner.status || JSON.stringify(errObj);
          }
        }
        throw new ParseBotError(errorMsg, response.status, data);
      }

      return data as T;
    });
  }



  /**
   * Search for smartphones with optional filters like brand, price range, and sort order.
   * Note from OpenAPI spec: sort cannot be combined with query.
   */
  public async searchSmartphones(params: SmartprixSearchParams = {}): Promise<unknown> {
    const query = params.query?.trim();
    let sort = params.sort?.trim();

    // Enforce OpenAPI rule: "Sort cannot be combined with the query parameter; when both are provided, results may be empty."
    if (query && sort) {
      sort = undefined;
    }

    return this.executeGet('search_smartphones', {
      page: params.page,
      sort,
      brand: params.brand?.trim(),
      query,
      min_price: params.min_price,
      max_price: params.max_price,
    });
  }

  /**
   * Get comprehensive details for a smartphone, including specs, variants, store prices, etc.
   * @param slug Product URL path from search results (e.g. '/mobiles/samsung-galaxy-s25-ultra-ppd1p8z4fzt4')
   */
  public async getSmartphoneDetails(params: SmartprixDetailsParams): Promise<unknown> {
    if (!params.slug || params.slug.trim() === '') {
      throw new ParseBotError('slug parameter is required to fetch smartphone details', 400);
    }
    return this.executeGet('get_smartphone_details', { slug: params.slug.trim() });
  }

  /**
   * Get historical price data for a product.
   * @param pid Product ID (e.g. 'pd1p8z4fzt4')
   * @param range Optional time range
   */
  public async getSmartphonePriceHistory(params: SmartprixPriceHistoryParams): Promise<unknown> {
    if (!params.pid || params.pid.trim() === '') {
      throw new ParseBotError('pid parameter is required to fetch price history', 400);
    }
    return this.executeGet('get_smartphone_price_history', {
      pid: params.pid.trim(),
      range: params.range?.trim(),
    });
  }

  /**
   * List all smartphone brands available on the site with product counts.
   */
  public async listBrands(): Promise<SmartprixBrandItem[] | unknown> {
    return this.executeGet('list_brands');
  }

  /**
   * List laptops available on the site (paginated).
   */
  public async listLaptops(page?: number): Promise<unknown> {
    return this.executeGet('list_laptops', { page });
  }

  /**
   * List tablets available on the site (paginated).
   */
  public async listTablets(page?: number): Promise<unknown> {
    return this.executeGet('list_tablets', { page });
  }

  /**
   * Get current deals and discounted products (paginated).
   */
  public async getDeals(page?: number): Promise<unknown> {
    return this.executeGet('get_deals', { page });
  }
}

export const smartprixClient = new SmartprixClient();
