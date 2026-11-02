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
  /**
   * Composition, colour, cut, details (EPIC 9), when the read brought them:
   * the storefront's reads do (products_public after 023, the server's own
   * reads always), and the title is written from them (Task 9.7).
   */
  attributes?: ProductAttributes;
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
  /** The customer account that placed it, when signed in (13.7, D-033). Absent for a guest. */
  userId?: string;
  /** Coupon and points on this order (13.7, D-031). Absent when neither was used nor earned. */
  loyalty?: OrderLoyalty;
}

/**
 * The loyalty side of an order, kept in `customer` like the pickup choice
 * (D-011) and the source (D-025), so no migration stands between the code and
 * the orders table. Amounts are denars; the item prices already carry them.
 */
export interface OrderLoyalty {
  couponCode?: string;
  /** What the coupon took off the goods. */
  couponDiscount?: number;
  /** Delivery the coupon waived. */
  shippingWaived?: number;
  pointsUsed?: number;
  /** Earned on this order, pending until it is delivered, paid and past the waiting period. */
  pointsEarned?: number;
}

export interface OrderItem {
  productId: string;
  /** The title the customer saw when ordering (Task 9.7: written from the attributes). */
  productName: string;
  /** The internal code (`products.name`), so the back office finds it on the shelf. Orders before 9.7 have none. */
  productCode?: string;
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

/** The attribute filters on a listing (Task 9.9), by their query parameter: `?color=blue,black`. */
export type FacetParam = 'color' | 'material' | 'fit';

export interface PaginatedResult {
  products: Product[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  filterMeta: {
    priceRange: { min: number; max: number };
    availableSizes: { size: string; count: number }[];
    /** With `categories`: how many products each of them has on the shelf,
     * counted before `type` narrows them — the chips of a group (2.4). */
    types?: { category: string; count: number }[];
    /** Colour, material and cut (9.9), counted like the sizes: before the customer's filters. */
    facets?: Partial<Record<FacetParam, { value: string; count: number }[]>>;
    /** How many products the page holds before the customer's filters ("5 од 23"). */
    unfilteredCount?: number;
  };
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  /** Raw categories to list (a group's, or one no group holds), matched
   * through their aliases: `pantaloni` is listed with `pants` (2.4). */
  categories?: readonly string[];
  /** One of `categories`, any spelling: the chip a customer chose. */
  type?: string;
  saleOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  /** Colour families, main fibres, cuts: any value within one filter, every filter across (9.9). */
  facets?: Partial<Record<FacetParam, string[]>>;
}
