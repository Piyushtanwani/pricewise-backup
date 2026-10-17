import type { Product } from './product';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  createdAt: string;
}

export interface ProfileStats {
  productsTracked: number;
  wishlistItems: number;
  alertsReceived: number;
  activeAlerts: number;
  savingsDiscovered: number;
}

export interface NotificationPrefs {
  priceDropEmail: boolean;
  priceDropInApp: boolean;
  priceDropPush: boolean;
  targetEmail: boolean;
  targetInApp: boolean;
  recommendationsInApp: boolean;
  weeklyDigest: boolean;
}

export interface WishlistItem extends Product {
  wishlistId: string;
  addedAt: string;
  addedPrice: number;
  change: number;
  changePercent: number;
}

export interface WishlistResponse {
  items: WishlistItem[];
  summary: {
    count: number;
    priceDrops: number;
    onSale: number;
    totalSavings: number;
  };
}

export interface WatchlistItem extends Product {
  watchlistId: string;
  trackedSince: string;
  currentPrice: number;
  targetPrice: number | null;
  distance: number | null;
  alertId: string | null;
  targetReached: boolean;
  nearTarget: boolean;
  priceDropped: boolean;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  summary: {
    count: number;
    nearTarget: number;
    priceDropped: number;
    targetReached: number;
  };
}

export interface AlertItem {
  id: string;
  product: Product;
  targetPrice: number;
  currentPrice: number;
  distance: number;
  channels: {
    email: boolean;
    inApp: boolean;
    push: boolean;
  };
  isActive: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  product: Product;
  prevPrice: number;
  newPrice: number;
  dropPercent: number;
  target: number | null;
  date: string;
  status: 'target' | 'drop';
  read: boolean;
}

export interface AlertsResponse {
  summary: {
    activeAlerts: number;
    priceDrops: number;
    targetReached: number;
    potentialSavings: number;
  };
  alerts: AlertItem[];
  events: AlertEvent[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  product: Product | null;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}
