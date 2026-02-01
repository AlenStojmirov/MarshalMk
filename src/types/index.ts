export interface ProductSize {
  size: string;
  quantity: number;
}

// Sold item tracking (for in-store sales per product)
export interface SoldItem {
  size: string;
  price: number;
  soldDate: string; // ISO date string YYYY-MM-DD
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
  category: string;
  imageUrl: string;
  images?: string[];
  stock: number;
  sizes?: ProductSize[];
  sold?: SoldItem[]; // Track sold items directly on product
  brand?: string;
  color?: string;
  featured: boolean;
  sale?: SaleInfo;
  createdAt: Date;
  updatedAt: Date;
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

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  size?: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

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
}

// In-store sales (products sold directly in store, not online)
export interface InStoreSaleItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  size?: string;
}

export interface InStoreSale {
  id: string;
  items: InStoreSaleItem[];
  total: number;
  saleDate: Date;
  notes?: string;
  createdAt: Date;
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
