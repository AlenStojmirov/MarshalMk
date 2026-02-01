'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Product, CartItem } from '@/types';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number, selectedSize?: string) => void;
  removeFromCart: (productId: string, selectedSize?: string) => void;
  updateQuantity: (productId: string, quantity: number, selectedSize?: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'ecommerce-cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error('Failed to parse cart from localStorage:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, isLoaded]);

  const addToCart = (product: Product, quantity: number = 1, selectedSize?: string) => {
    setItems(currentItems => {
      // Find existing item with same product AND size
      const existingItem = currentItems.find(
        item => item.product.id === product.id && item.selectedSize === selectedSize
      );

      // Determine max stock based on size or total stock
      const maxStock = selectedSize && product.sizes
        ? product.sizes.find(s => s.size === selectedSize)?.quantity || 0
        : product.stock;

      if (existingItem) {
        return currentItems.map(item =>
          item.product.id === product.id && item.selectedSize === selectedSize
            ? { ...item, quantity: Math.min(item.quantity + quantity, maxStock) }
            : item
        );
      }

      return [...currentItems, { product, quantity: Math.min(quantity, maxStock), selectedSize }];
    });
  };

  const removeFromCart = (productId: string, selectedSize?: string) => {
    setItems(currentItems =>
      currentItems.filter(
        item => !(item.product.id === productId && item.selectedSize === selectedSize)
      )
    );
  };

  const updateQuantity = (productId: string, quantity: number, selectedSize?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId, selectedSize);
      return;
    }

    setItems(currentItems =>
      currentItems.map(item => {
        if (item.product.id === productId && item.selectedSize === selectedSize) {
          // Determine max stock based on size or total stock
          const maxStock = selectedSize && item.product.sizes
            ? item.product.sizes.find(s => s.size === selectedSize)?.quantity || 0
            : item.product.stock;

          return { ...item, quantity: Math.min(quantity, maxStock) };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
