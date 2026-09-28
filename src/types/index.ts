import type { OrderSource } from '@/lib/attribution';
export interface ProductSize {
  size: string;
  quantity: number;
}

/**
 * Why a unit left without being paid for. Only ever set when the price is 0 —
 * a unit sold for money is a sale and needs no reason (D-005, D-012).
 */
export type NonSaleReason = 'giveaway' | 'personal' | 'writeoff';

// Sold item tracking (for in-store sales per product)
export interface SoldItem {
  size: string;
  price: number;
  soldDate: string; // ISO date string YYYY-MM-DD
  /**
   * Present only on zero-price entries recorded after D-012. Older zero-price
   * entries have none and read as 'personal', which is what D-005 decided.
   */
  reason?: NonSaleReason;
}

// Sale information for products on discount
export interface SaleInfo {
  isActive: boolean;
  salePrice: number;
  percentageOff: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Real unit cost. Already corrected for the Firebase doubling — see lib/cost.ts. */
  purchasePrice?: number;
  category: string;
  imageUrl: string;
  images?: string[];
  stock: number;
  sizes?: ProductSize[];
  sold?: SoldItem[]; // Track sold items directly on product
  brand?: string;
  color?: string;
  featured: boolean;
  isVisible?: boolean;
  sale?: SaleInfo;
  /** When the goods first arrived. Ageing measures from here. */
  firstReceivedAt?: Date;
  /** True when firstReceivedAt was inferred, not recorded — such ages are lower bounds. */
  firstReceivedEstimated?: boolean;
  supplierId?: string;
  /** Owner's call: never suggest this in the reorder plan (migration 006). */
  noReorder?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** One fibre of a garment's composition. Keys and labels: src/lib/attributes.ts. */
export interface FiberShare {
  fiber: string;
  pct: number;
}

/** Does it run true to size? Stored as 'true' | 'larger' | 'smaller'. */
export type SizeAdvice = 'true' | 'larger' | 'smaller';

/** Centimetres, per size label: { M: { chest: 54, length: 72 } }. */
export type Measurements = Record<string, Record<string, number>>;

/**
 * What a product is made of, its colour and how it fits (EPIC 9, migration 010).
 * Kept in `product_attributes`, one row per product, apart from `products` until
 * Task 9.10 joins them.
 */
export interface ProductAttributes {
  productId: string;
  /** Empty until known; otherwise the shares add up to 100 (the database checks). */
  composition: FiberShare[];
  color?: string;
  pattern?: string;
  fit?: string;
  sizeAdvice?: SizeAdvice;
  /** Per-category fields: sleeve, collar, closure, leg length (32L), lining… */
  details: Record<string, string | number | boolean>;
  measurements: Measurements;
  updatedAt?: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export type ProductFormData = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'sizes'> & {
  sizes?: ProductSize[];
};

export type DeliveryMethod = 'courier' | 'pickup';

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Empty for store pickup — there is nothing to deliver to. */
  address: string;
  city: string;
  notes?: string;
  /**
   * Absent on every order placed before pickup existed, which were all
   * courier deliveries — so absent reads as 'courier' (see D-011).
   */
  deliveryMethod?: DeliveryMethod;
  /** Where the order came from: the answer at checkout and the tracked link (D-025). */
  source?: OrderSource;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  size?: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

/**
 * How an order ended (Task 0.5, migration 006). Separate from status: status is
 * where the order is in the workflow, outcome is whether it was paid for.
 */
export type OrderOutcome = 'delivered' | 'refused' | 'returned' | 'not_collected';

export interface Order {
  id: string;
  orderNumber: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentMethod: 'cash_on_delivery';
  createdAt: Date;
  updatedAt: Date;
  /** Null while the order is still open, and on every order before migration 006. */
  outcome?: OrderOutcome;
  outcomeAt?: Date;
}

export interface PaginatedResult {
  products: Product[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  filterMeta: {
    priceRange: { min: number; max: number };
    availableSizes: { size: string; count: number }[];
  };
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  category?: string;
  saleOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
}
