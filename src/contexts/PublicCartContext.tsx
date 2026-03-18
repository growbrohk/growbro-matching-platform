/**
 * Cart context for public product checkout (brand pages)
 * Keyed by orgId - cart is per-brand
 * Persists to localStorage for guest checkout
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface PublicCartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  qty: number;
  unitPrice: number;
}

const STORAGE_KEY_PREFIX = 'growbro_public_cart_';

function getStorageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}${orgId}`;
}

function loadCartFromStorage(orgId: string): PublicCartItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCartToStorage(orgId: string, cart: PublicCartItem[]) {
  try {
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(cart));
  } catch {
    // ignore
  }
}

interface PublicCartContextValue {
  orgId: string | null;
  setOrgId: (id: string | null) => void;
  cart: PublicCartItem[];
  addItem: (item: Omit<PublicCartItem, 'qty'> & { qty?: number }) => void;
  updateItemQty: (index: number, delta: number) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  totalQty: number;
  total: number;
}

const PublicCartContext = createContext<PublicCartContextValue | null>(null);

export function PublicCartProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cart, setCart] = useState<PublicCartItem[]>([]);

  useEffect(() => {
    if (orgId) {
      setCart(loadCartFromStorage(orgId));
    } else {
      setCart([]);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId && cart.length >= 0) {
      saveCartToStorage(orgId, cart);
    }
  }, [orgId, cart]);

  const addItem = useCallback(
    (item: Omit<PublicCartItem, 'qty'> & { qty?: number }) => {
      if (!orgId) return;
      const qty = item.qty ?? 1;
      setCart((prev) => {
        const existing = prev.findIndex(
          (c) => c.productId === item.productId && c.variantId === item.variantId
        );
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], qty: next[existing].qty + qty };
          return next;
        }
        return [...prev, { ...item, qty }];
      });
    },
    [orgId]
  );

  const updateItemQty = useCallback((index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      const newQty = Math.max(0, item.qty + delta);
      if (newQty === 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...item, qty: newQty };
      }
      return next;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setCart((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  const value: PublicCartContextValue = {
    orgId,
    setOrgId,
    cart,
    addItem,
    updateItemQty,
    removeItem,
    clearCart,
    totalQty,
    total,
  };

  return (
    <PublicCartContext.Provider value={value}>
      {children}
    </PublicCartContext.Provider>
  );
}

export function usePublicCart() {
  const ctx = useContext(PublicCartContext);
  if (!ctx) {
    throw new Error('usePublicCart must be used within PublicCartProvider');
  }
  return ctx;
}
