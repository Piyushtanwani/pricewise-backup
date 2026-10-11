import axios from 'axios';
import type {
  Product,
  CatalogMeta,
  ProductDetailResponse,
  PriceIntelligenceResponse,
  AIChatResponse,
  StorePriceRow,
  PricePoint,
  PredictionPoint,
} from '../types/product';

const API_BASE = '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    indexes: null,
  },
});

// Attach JWT token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ProductListParams {
  q?: string;
  search?: string;
  category?: string | string[];
  brand?: string | string[];
  store?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  sort: string;
}

export const api = {
  // Products
  async getProducts(params: ProductListParams = {}): Promise<ProductListResponse> {
    const res = await apiClient.get<ProductListResponse>('/products', { params });
    return res.data;
  },

  async getCatalogMeta(): Promise<CatalogMeta> {
    const res = await apiClient.get<CatalogMeta>('/products/meta');
    return res.data;
  },

  async getProduct(id: string): Promise<ProductDetailResponse> {
    const res = await apiClient.get<ProductDetailResponse>(`/products/${encodeURIComponent(id)}`);
    return res.data;
  },

  async getLiveStores(id: string): Promise<{ stores: StorePriceRow[]; bestDealUrl: string | null }> {
    const res = await apiClient.get<{ stores: StorePriceRow[]; bestDealUrl: string | null }>(
      `/products/${encodeURIComponent(id)}/live-stores`
    );
    return res.data;
  },

  async getProductHistory(id: string, range?: string, store?: string): Promise<PricePoint[]> {
    const res = await apiClient.get<any>(`/products/${encodeURIComponent(id)}/history`, {
      params: { range, store },
    });
    return res.data?.points || (Array.isArray(res.data) ? res.data : []);
  },

  async getProductPrediction(id: string): Promise<PredictionPoint[]> {
    const res = await apiClient.get<any>(`/products/${encodeURIComponent(id)}/prediction`);
    return res.data?.points || (Array.isArray(res.data) ? res.data : []);
  },

  async getProductAlternatives(id: string): Promise<Product[]> {
    const res = await apiClient.get<Product[]>(`/products/${encodeURIComponent(id)}/alternatives`);
    return res.data;
  },

  async compareProducts(ids: string[]): Promise<{ products: ProductDetailResponse['product'][] }> {
    const res = await apiClient.get<{ products: ProductDetailResponse['product'][] }>('/products/compare', {
      params: { ids: ids.join(',') },
    });
    return res.data;
  },

  // Intelligence
  async getPriceIntelligence(productId?: string, range?: string, store?: string): Promise<PriceIntelligenceResponse> {
    const res = await apiClient.get<PriceIntelligenceResponse>('/intelligence/price', {
      params: { productId, range, store },
    });
    return res.data;
  },

  async askAI(message: string, productIds?: string[]): Promise<AIChatResponse> {
    const res = await apiClient.post<AIChatResponse>('/intelligence/ai', {
      message,
      productIds,
    });
    return res.data;
  },

  // User features
  async getWishlist(): Promise<any[]> {
    try {
      const res = await apiClient.get('/user/wishlist');
      return res.data;
    } catch {
      return [];
    }
  },

  async getWatchlist(): Promise<any[]> {
    try {
      const res = await apiClient.get('/user/watchlist');
      return res.data;
    } catch {
      return [];
    }
  },

  async getAlerts(): Promise<any[]> {
    try {
      const res = await apiClient.get('/user/alerts');
      return res.data;
    } catch {
      return [];
    }
  },

  async getNotifications(): Promise<any[]> {
    try {
      const res = await apiClient.get('/user/notifications');
      return res.data;
    } catch {
      return [];
    }
  },

  async getRecommendations(): Promise<Product[]> {
    try {
      const res = await apiClient.get('/user/recommendations');
      return res.data;
    } catch {
      return [];
    }
  },

  async setPriceAlert(data: { productId: string; targetPrice: number; email: string; userName?: string }): Promise<{ success: boolean; message: string; alertId?: string }> {
    const res = await apiClient.post('/user/alerts/notify', data);
    return res.data;
  },

  async testPriceAlert(data: { productId: string; email: string; userName?: string }): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post('/user/alerts/test-email', data);
    return res.data;
  },
};

