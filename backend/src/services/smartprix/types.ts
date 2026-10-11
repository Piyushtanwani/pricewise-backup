export interface SmartprixSearchParams {
  page?: number;
  sort?: string;
  brand?: string;
  query?: string;
  min_price?: number;
  max_price?: number;
}

export interface SmartprixDetailsParams {
  slug: string;
}

export interface SmartprixPriceHistoryParams {
  pid: string;
  range?: string;
}

export interface SmartprixPaginationParams {
  page?: number;
}

export interface SmartprixBrandItem {
  name: string;
  slug: string;
  count?: number;
  [key: string]: unknown;
}

export interface SmartprixRawProductItem {
  id?: string;
  pid?: string;
  name?: string;
  title?: string;
  slug?: string;
  brand?: string;
  price?: number | string;
  mrp?: number | string;
  rating?: number | string;
  spec_score?: number | string;
  specs?: string[] | Record<string, unknown>;
  image?: string;
  imageUrl?: string;
  store?: string;
  storeUrl?: string;
  [key: string]: unknown;
}

export interface SmartprixExecutionError {
  error: string | {
    status?: string;
    kind?: string;
    message?: string;
    upstream_status_code?: number;
    snippet?: string;
    [key: string]: unknown;
  };
  status_code?: number;
}
