import axios from 'axios';
import type {
  Product,
  CatalogMeta,
  ProductDetailResponse,
  PriceIntelligenceResponse,
  MarketIntelligenceSummary,
  AIChatResponse,
  StorePriceRow,
  PricePoint,
  PredictionPoint,
} from '../types/product';
import type {
  User,
  ProfileStats,
  NotificationPrefs,
  WishlistResponse,
  WatchlistResponse,
  AlertsResponse,
  NotificationsResponse,
} from '../types/user';

const normalizeApiBase = (url?: string): string => {
  if (!url || !url.trim()) return '/api';
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || (import.meta.env as any).API_URL);

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

// Global 401 interceptor: purge invalid/expired token
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  }
);

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

export interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  // ---------------------------------------------------------------- Auth
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', credentials);
    if (res.data?.token) {
      localStorage.setItem('token', res.data.token);
    }
    return res.data;
  },

  async register(data: { name: string; email: string; password: string }): Promise<{ success: boolean; requireOtp: boolean; email: string; message: string }> {
    const res = await apiClient.post<{ success: boolean; requireOtp: boolean; email: string; message: string }>('/auth/register', data);
    return res.data;
  },

  async verifyOtp(data: { email: string; otp: string }): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<{ success: boolean; message: string }>('/auth/verify-otp', data);
    return res.data;
  },

  async resendOtp(email: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<{ success: boolean; message: string }>('/auth/resend-otp', { email });
    return res.data;
  },

  async googleAuth(payload: { credential?: string; code?: string; redirectUri?: string; accessToken?: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/google', payload);
    if (res.data?.token) {
      localStorage.setItem('token', res.data.token);
    }
    return res.data;
  },

  async getMe(): Promise<{ user: User }> {
    const res = await apiClient.get<{ user: User }>('/auth/me');
    return res.data;
  },

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_token');
    apiClient.post('/auth/logout').catch(() => {});
  },

  // ---------------------------------------------------------------- Products
  async getProducts(params: ProductListParams = {}): Promise<ProductListResponse> {
    const res = await apiClient.get<ProductListResponse>('/products', { params });
    return res.data;
  },

  async getCatalogMeta(): Promise<CatalogMeta> {
    const res = await apiClient.get<CatalogMeta>('/products/meta');
    return res.data;
  },

  async getProduct(id: string, refresh = false): Promise<ProductDetailResponse> {
    const res = await apiClient.get<ProductDetailResponse>(`/products/${encodeURIComponent(id)}`, {
      params: refresh ? { refresh: 'true' } : undefined,
    });
    return res.data;
  },

  async getLiveStores(id: string, refresh = true): Promise<{ stores: StorePriceRow[]; bestDealUrl: string | null; source?: string }> {
    const res = await apiClient.get<{ stores: StorePriceRow[]; bestDealUrl: string | null; source?: string }>(
      `/products/${encodeURIComponent(id)}/live-stores`,
      { params: refresh ? { refresh: 'true' } : undefined }
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
    const res = await apiClient.get<{ items: Product[] } | Product[]>(`/products/${encodeURIComponent(id)}/alternatives`);
    if (Array.isArray(res.data)) return res.data;
    return (res.data as any)?.items || [];
  },

  async compareProducts(ids: string[]): Promise<{ products: ProductDetailResponse['product'][] }> {
    const res = await apiClient.get<{ products: ProductDetailResponse['product'][] }>('/products/compare', {
      params: { ids: ids.join(',') },
    });
    return res.data;
  },

  // ---------------------------------------------------------------- Intelligence
  async getMarketIntelligence(refresh = false): Promise<MarketIntelligenceSummary> {
    const res = await apiClient.get<MarketIntelligenceSummary>('/intelligence/market', {
      params: refresh ? { refresh: 'true' } : undefined,
    });
    return res.data;
  },

  async getPriceIntelligence(productId?: string, range?: string, store?: string): Promise<PriceIntelligenceResponse> {
    const res = await apiClient.get<PriceIntelligenceResponse>('/intelligence/price', {
      params: { productId, range, store },
    });
    return res.data;
  },

  async askAI(message: string, productIds?: string[], sessionId?: string): Promise<AIChatResponse> {
    const res = await apiClient.post<AIChatResponse>('/intelligence/ai', {
      message,
      productIds,
      sessionId,
    });
    return res.data;
  },

  // ---------------------------------------------------------------- Wishlist
  async getWishlist(): Promise<WishlistResponse> {
    const res = await apiClient.get<WishlistResponse>('/user/wishlist');
    return res.data;
  },

  async addToWishlist(productId: string): Promise<{ id: string; productId: string; addedPrice: number }> {
    const res = await apiClient.post('/user/wishlist', { productId });
    return res.data;
  },

  async removeFromWishlist(productId: string): Promise<void> {
    await apiClient.delete(`/user/wishlist/${encodeURIComponent(productId)}`);
  },

  // ---------------------------------------------------------------- Watchlist
  async getWatchlist(): Promise<WatchlistResponse> {
    const res = await apiClient.get<WatchlistResponse>('/user/watchlist');
    return res.data;
  },

  async addToWatchlist(productId: string): Promise<{ id: string; productId: string }> {
    const res = await apiClient.post('/user/watchlist', { productId });
    return res.data;
  },

  async removeFromWatchlist(productId: string): Promise<void> {
    await apiClient.delete(`/user/watchlist/${encodeURIComponent(productId)}`);
  },

  // ---------------------------------------------------------------- Alerts
  async getAlerts(): Promise<AlertsResponse> {
    const res = await apiClient.get<AlertsResponse>('/user/alerts');
    return res.data;
  },

  async createAlert(data: {
    productId: string;
    targetPrice: number;
    notifyEmail?: boolean;
    notifyInApp?: boolean;
    notifyPush?: boolean;
  }): Promise<{ id: string; productId: string; targetPrice: number }> {
    const res = await apiClient.post('/user/alerts', data);
    return res.data;
  },

  async updateAlert(
    alertId: string,
    data: { targetPrice?: number; isActive?: boolean }
  ): Promise<any> {
    const res = await apiClient.patch(`/user/alerts/${encodeURIComponent(alertId)}`, data);
    return res.data;
  },

  async deleteAlert(alertId: string): Promise<void> {
    await apiClient.delete(`/user/alerts/${encodeURIComponent(alertId)}`);
  },

  async setPriceAlert(data: {
    productId: string;
    targetPrice: number;
    email: string;
    userName?: string;
  }): Promise<{ success: boolean; message: string; alertId?: string }> {
    const res = await apiClient.post('/user/alerts/notify', data);
    return res.data;
  },

  async testPriceAlert(data: {
    productId: string;
    email: string;
    userName?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post('/user/alerts/test-email', data);
    return res.data;
  },

  // ---------------------------------------------------------------- Notifications
  async getNotifications(unreadOnly = false): Promise<NotificationsResponse> {
    const res = await apiClient.get<NotificationsResponse>('/user/notifications', {
      params: { unread: unreadOnly },
    });
    return res.data;
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    await apiClient.patch(`/user/notifications/${encodeURIComponent(notificationId)}/read`);
  },

  async markAllNotificationsRead(): Promise<{ updated: number }> {
    const res = await apiClient.post<{ updated: number }>('/user/notifications/read-all');
    return res.data;
  },

  // ---------------------------------------------------------------- Profile & Settings
  async getProfile(): Promise<{ user: User; stats: ProfileStats }> {
    const res = await apiClient.get<{ user: User; stats: ProfileStats }>('/user/profile');
    return res.data;
  },

  async updateProfile(data: { name?: string; phone?: string | null }): Promise<{ user: User }> {
    const res = await apiClient.patch<{ user: User }>('/user/profile', data);
    return res.data;
  },

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    await apiClient.put('/user/password', data);
  },

  async deleteAccount(): Promise<void> {
    await apiClient.delete('/user/profile');
    localStorage.removeItem('token');
    localStorage.removeItem('auth_token');
  },

  async getNotificationSettings(): Promise<NotificationPrefs> {
    const res = await apiClient.get<NotificationPrefs>('/user/settings/notifications');
    return res.data;
  },

  async updateNotificationSettings(data: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const res = await apiClient.put<NotificationPrefs>('/user/settings/notifications', data);
    return res.data;
  },

  // ---------------------------------------------------------------- Recommendations
  async getRecommendations(limit = 8): Promise<{ personalised: boolean; items: Product[] }> {
    const res = await apiClient.get<{ personalised: boolean; items: Product[] }>('/user/recommendations', {
      params: { limit },
    });
    return res.data;
  },
};
