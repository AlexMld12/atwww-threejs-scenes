'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PRODUCTS, productBySlug, type Product } from './catalog';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (slug: string, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
}

const CartContext = createContext<CartValue | null>(null);

/** Local cart (no store behind it yet): lines live in memory, checkout goes nowhere. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ slug: string; quantity: number }[]>([]);
  const [open, setOpen] = useState(false);

  const add = useCallback((slug: string, quantity = 1) => {
    setItems((list) => {
      const line = list.find((item) => item.slug === slug);
      if (!line) return [...list, { slug, quantity }];
      return list.map((item) => (item === line ? { ...item, quantity: item.quantity + quantity } : item));
    });
    setOpen(true);
  }, []);

  const setQuantity = useCallback((slug: string, quantity: number) => {
    setItems((list) =>
      quantity <= 0
        ? list.filter((item) => item.slug !== slug)
        : list.map((item) => (item.slug === slug ? { ...item, quantity } : item)),
    );
  }, []);

  // The skin reading's kit (its report fires `kelv:add-to-cart`): the three steps, K1 → K3.
  useEffect(() => {
    const onKit = () => {
      setItems((list) => {
        const bumped = list.map((item) =>
          PRODUCTS.some((p) => p.slug === item.slug) ? { ...item, quantity: item.quantity + 1 } : item,
        );
        const missing = PRODUCTS.filter((p) => !list.some((item) => item.slug === p.slug));
        return [...bumped, ...missing.map(({ slug }) => ({ slug, quantity: 1 }))];
      });
      setOpen(true);
    };
    document.addEventListener('kelv:add-to-cart', onKit);
    return () => document.removeEventListener('kelv:add-to-cart', onKit);
  }, []);

  const remove = useCallback((slug: string) => setItems((list) => list.filter((item) => item.slug !== slug)), []);

  const value = useMemo(() => {
    const lines = items.flatMap(({ slug, quantity }) => {
      const product = productBySlug(slug);
      return product ? [{ product, quantity }] : [];
    });
    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0),
      open,
      setOpen,
      add,
      setQuantity,
      remove,
    };
  }, [items, open, add, setQuantity, remove]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
