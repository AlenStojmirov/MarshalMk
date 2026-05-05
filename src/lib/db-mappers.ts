import { Order, OrderItem, OrderStatus, Product, ProductFormData, ProductSize, SaleInfo, SoldItem, CustomerInfo } from '@/types';

// ---------------------------------------------------------------------------
// Product row (DB) <-> Product (app)
// ---------------------------------------------------------------------------
export interface ProductRow {
  id: string;
  name: string;
  description: string;
  price: number | string;
  category: string;
  image_url: string;
  images: string[] | null;
  stock: number;
  sizes: ProductSize[] | null;
  sold: SoldItem[] | null;
  brand: string | null;
  color: string | null;
  featured: boolean;
  is_visible: boolean;
  sale: SaleInfo | null;
  created_at: string;
  updated_at: string;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    price: Number(row.price) || 0,
    category: row.category ?? '',
    imageUrl: row.image_url ?? '',
    images: row.images ?? [],
    stock: row.stock ?? 0,
    sizes: row.sizes ?? [],
    sold: row.sold ?? [],
    brand: row.brand ?? undefined,
    color: row.color ?? undefined,
    featured: row.featured ?? false,
    isVisible: row.is_visible !== false,
    sale: row.sale ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

/**
 * Convert a partial Product / form payload to a partial DB row. Only the
 * fields that are explicitly set are returned, so this works for upserts
 * and partial updates alike.
 */
export function productToRow(
  data: Partial<ProductFormData> & { sold?: SoldItem[] }
): Partial<ProductRow> {
  const out: Partial<ProductRow> = {};
  if (data.name !== undefined) out.name = data.name;
  if (data.description !== undefined) out.description = data.description;
  if (data.price !== undefined) out.price = data.price;
  if (data.category !== undefined) out.category = data.category;
  if (data.imageUrl !== undefined) out.image_url = data.imageUrl;
  if (data.images !== undefined) out.images = data.images;
  if (data.stock !== undefined) out.stock = data.stock;
  if (data.sizes !== undefined) out.sizes = data.sizes;
  if (data.sold !== undefined) out.sold = data.sold;
  if (data.brand !== undefined) out.brand = data.brand ?? null;
  if (data.color !== undefined) out.color = data.color ?? null;
  if (data.featured !== undefined) out.featured = data.featured;
  if (data.isVisible !== undefined) out.is_visible = data.isVisible;
  if (data.sale !== undefined) out.sale = data.sale ?? null;
  return out;
}

// ---------------------------------------------------------------------------
// Order row (DB) <-> Order (app)
// ---------------------------------------------------------------------------
export interface OrderRow {
  id: string;
  order_number: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
  status: OrderStatus;
  payment_method: 'cash_on_delivery';
  created_at: string;
  updated_at: string;
}

export function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customer: row.customer,
    items: row.items ?? [],
    subtotal: Number(row.subtotal) || 0,
    shipping: Number(row.shipping) || 0,
    total: Number(row.total) || 0,
    status: row.status,
    paymentMethod: row.payment_method,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}
