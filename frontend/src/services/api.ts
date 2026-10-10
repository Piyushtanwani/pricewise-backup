import axios from 'axios';
import { products as mockProducts, priceHistoryData, predictionData as mockPredictionData } from '../data/mockData';

export interface Product {
  id: string;
  brand: string;
  name: string;
  image: string;
  rating: number;
  reviews: number;
  specs: string[];
  bestPrice: number;
  mrp: number;
  discount: number;
  bestStore: string;
  stores: number;
  trend: string;
  aiVerdict: string;
  verdictColor: string;
  category: string;
  priceHistory: number[];
}

export interface StorePriceRow {
  storeId: string;
  store: string;
  storeSlug: string;
  logoUrl?: string | null;
  price: number;
  mrp?: number | null;
  shipping: string;
  shippingCost?: number;
  availability: string;
  stockStatus?: string;
  diff: number;
  url: string;
  lastCheckedAt?: string;
}

export interface ProductDetailResponse {
  card: Product;
  description?: string;
  techSpecs?: Record<string, string>;
  images?: string[];
  storePrices: StorePriceRow[];
  stats: {
    lowest90?: number;
    highest90?: number;
    average90?: number;
    lowestEver?: number;
    allTimeLow?: number;
    allTimeHigh?: number;
    average30d?: number;
    currentDropPercent?: number;
    volatility?: string;
  };
  verdict: {
    label: string;
    color: string;
    description: string;
    explanation?: string;
    recommendation?: string;
    confidence?: string;
  };
  insights: Array<string | { type?: string; text?: string }>;
  userState?: {
    wishlisted?: boolean;
    tracking?: boolean;
    alert?: { id: string; targetPrice: number } | null;
  };
}

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export const getProducts = async (params: {
  q?: string;
  category?: string;
  brand?: string;
  store?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: Product[]; total: number }> => {
  try {
    const res = await api.get('/products', { params });
    if (res.data && Array.isArray(res.data.items) && res.data.items.length > 0) {
      return { items: res.data.items, total: res.data.total };
    }
  } catch (err) {
    console.warn('API /products failed or offline, falling back to mock data:', err);
  }

  // Fallback to local mock data filtered
  let items = [...mockProducts] as Product[];
  if (params.q) {
    const qLower = params.q.toLowerCase();
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(qLower) ||
        p.brand.toLowerCase().includes(qLower) ||
        p.category.toLowerCase().includes(qLower),
    );
  }
  if (params.category) {
    items = items.filter((p) => p.category.toLowerCase() === params.category?.toLowerCase());
  }
  return { items, total: items.length };
};

export const getProductById = async (id: string): Promise<ProductDetailResponse | null> => {
  try {
    const res = await api.get(`/products/${id}`);
    const data = res.data;
    if (data && (data.id || data.card?.id)) {
      const card: Product = data.card || {
        id: data.id,
        brand: data.brand || '',
        name: data.name || '',
        image: data.image || data.imageUrl || (data.images && data.images[0]) || '',
        rating: data.rating || 4.2,
        reviews: data.reviews || data.reviewCount || 0,
        specs: data.specs || [],
        bestPrice: data.bestPrice || 0,
        mrp: data.mrp || data.bestPrice || 0,
        discount: data.discount !== undefined ? data.discount : (data.discountPercent || 0),
        bestStore: data.bestStore || 'Amazon',
        stores: data.stores || (data.storePrices?.length || 1),
        trend: data.trend || 'stable',
        aiVerdict: data.aiVerdict || data.verdict?.label || 'Good time to buy',
        verdictColor: data.verdictColor || data.verdict?.color || 'green',
        category: data.category || 'Smartphones',
        priceHistory: data.priceHistory || [],
      };

      return {
        card,
        description: data.description || '',
        techSpecs: data.techSpecs || {},
        images: data.images && data.images.length > 0 ? data.images : [card.image],
        storePrices: data.storePrices || [],
        stats: data.stats || {
          lowestEver: card.bestPrice,
          highest90: card.mrp,
          average90: card.bestPrice,
          lowest90: card.bestPrice,
        },
        verdict: data.verdict || {
          label: card.aiVerdict,
          color: card.verdictColor,
          description: 'Based on verified retail price history and trends.',
        },
        insights: data.insights && data.insights.length > 0 ? data.insights : [
          `Lowest price found is ₹${card.bestPrice.toLocaleString('en-IN')} on ${card.bestStore}`,
        ],
        userState: data.userState,
      };
    }
  } catch (err) {
    console.warn(`API /products/${id} failed:`, err);
  }

  const p = mockProducts.find((item) => item.id === id);
  if (!p) return null;

  return {
    card: p as Product,
    description: '',
    techSpecs: {},
    images: [p.image],
    storePrices: [
      {
        storeId: 's1',
        store: p.bestStore,
        storeSlug: p.bestStore.toLowerCase(),
        logoUrl: null,
        price: p.bestPrice,
        mrp: p.mrp,
        shipping: 'Free',
        shippingCost: 0,
        availability: 'In Stock',
        stockStatus: 'IN_STOCK',
        diff: 0,
        url: '#',
        lastCheckedAt: new Date().toISOString(),
      },
    ],
    stats: {
      lowestEver: p.bestPrice,
      highest90: p.mrp,
      average90: p.bestPrice,
      lowest90: p.bestPrice,
    },
    verdict: {
      label: p.aiVerdict,
      color: p.verdictColor,
      description: 'Based on recent pricing history and availability.',
    },
    insights: [`Current price is ₹${p.bestPrice.toLocaleString('en-IN')}`],
  };
};

export const getProductHistory = async (
  id: string,
  range: string = '3M',
  store?: string,
): Promise<{ date: string; price: number; avg?: number }[]> => {
  try {
    const res = await api.get(`/products/${id}/history`, {
      params: { range, store },
    });
    if (res.data && Array.isArray(res.data.points) && res.data.points.length > 0) {
      return res.data.points;
    }
  } catch (err) {
    console.warn('API history failed, using mock points:', err);
  }
  return [];
};

export const getProductPrediction = async (id: string) => {
  try {
    const res = await api.get(`/products/${id}/prediction`);
    if (res.data && Array.isArray(res.data.points)) {
      return res.data;
    }
  } catch (err) {
    console.warn('API prediction failed:', err);
  }
  return null;
};

export const getProductAlternatives = async (id: string, limit: number = 4): Promise<Product[]> => {
  try {
    const res = await api.get(`/products/${id}/alternatives`, { params: { limit } });
    if (res.data && Array.isArray(res.data.items)) {
      return res.data.items;
    }
  } catch (err) {
    console.warn('API alternatives failed:', err);
  }
  return [];
};
