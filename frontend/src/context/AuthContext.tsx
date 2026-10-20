import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { User } from '../types/user';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  wishlistIds: Set<string>;
  watchlistIds: Set<string>;
  isWishlisted: (productId: string) => boolean;
  isTracking: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<boolean>;
  toggleWatchlist: (productId: string) => Promise<boolean>;
  refreshSavedState: () => Promise<void>;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string }) => Promise<{ success: boolean; requireOtp: boolean; email: string; message: string }>;
  verifyOtp: (data: { email: string; otp: string }) => Promise<{ success: boolean; message: string }>;
  resendOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: (payload: { credential?: string; code?: string; redirectUri?: string; accessToken?: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  const refreshSavedState = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (!token) {
      setWishlistIds(new Set());
      setWatchlistIds(new Set());
      return;
    }

    try {
      const [wishRes, watchRes] = await Promise.all([
        api.getWishlist().catch(() => ({ items: [] })),
        api.getWatchlist().catch(() => ({ items: [] })),
      ]);

      const wIds = new Set<string>();
      for (const item of wishRes.items || []) {
        if (item.id) wIds.add(item.id);
        if ((item as any).productId) wIds.add((item as any).productId);
      }

      const tIds = new Set<string>();
      for (const item of watchRes.items || []) {
        if (item.id) tIds.add(item.id);
        if ((item as any).productId) tIds.add((item as any).productId);
      }

      setWishlistIds(wIds);
      setWatchlistIds(tIds);
    } catch {
      // Ignore background refresh errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (!token) {
      setUser(null);
      setWishlistIds(new Set());
      setWatchlistIds(new Set());
      setLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);
      await refreshSavedState();
    } catch {
      console.warn('Session expired or invalid, clearing local session.');
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      setUser(null);
      setWishlistIds(new Set());
      setWatchlistIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [refreshSavedState]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await api.login(credentials);
    setUser(res.user);
    await refreshSavedState();
  };

  const register = async (data: { name: string; email: string; password: string }) => {
    return await api.register(data);
  };

  const verifyOtp = async (data: { email: string; otp: string }) => {
    return await api.verifyOtp(data);
  };

  const resendOtp = async (email: string) => {
    return await api.resendOtp(email);
  };

  const loginWithGoogle = async (payload: { credential?: string; code?: string; redirectUri?: string; accessToken?: string }) => {
    const res = await api.googleAuth(payload);
    setUser(res.user);
    await refreshSavedState();
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setWishlistIds(new Set());
    setWatchlistIds(new Set());
  };

  const isWishlisted = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds]);
  const isTracking = useCallback((productId: string) => watchlistIds.has(productId), [watchlistIds]);

  const toggleWishlist = useCallback(async (productId: string): Promise<boolean> => {
    const currentlyWished = wishlistIds.has(productId);
    const next = !currentlyWished;

    // Optimistic update
    setWishlistIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(productId);
      else updated.delete(productId);
      return updated;
    });

    try {
      if (next) {
        await api.addToWishlist(productId);
      } else {
        await api.removeFromWishlist(productId);
      }
      return next;
    } catch (err) {
      // Rollback on failure
      setWishlistIds((prev) => {
        const rollback = new Set(prev);
        if (currentlyWished) rollback.add(productId);
        else rollback.delete(productId);
        return rollback;
      });
      throw err;
    }
  }, [wishlistIds]);

  const toggleWatchlist = useCallback(async (productId: string): Promise<boolean> => {
    const currentlyTracking = watchlistIds.has(productId);
    const next = !currentlyTracking;

    // Optimistic update
    setWatchlistIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(productId);
      else updated.delete(productId);
      return updated;
    });

    try {
      if (next) {
        await api.addToWatchlist(productId);
      } else {
        await api.removeFromWatchlist(productId);
      }
      return next;
    } catch (err) {
      // Rollback on failure
      setWatchlistIds((prev) => {
        const rollback = new Set(prev);
        if (currentlyTracking) rollback.add(productId);
        else rollback.delete(productId);
        return rollback;
      });
      throw err;
    }
  }, [watchlistIds]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        wishlistIds,
        watchlistIds,
        isWishlisted,
        isTracking,
        toggleWishlist,
        toggleWatchlist,
        refreshSavedState,
        login,
        register,
        verifyOtp,
        resendOtp,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
