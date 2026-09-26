import { Order, OrderItem, OrderOutcome, OrderStatus, Product, ProductFormData, ProductSize, SaleInfo, SoldItem, CustomerInfo, FiberShare, SizeAdvice, Measurements, ProductAttributes } from '@/types';

// ---------------------------------------------------------------------------
// Product row (DB) <-> Product (app)
// ---------------------------------------------------------------------------
export interface ProductRow {
  id: string;
  name: string;
  description: string;
  price: number | string;
  purchase_price: number | string | null;
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
  first_received_at: string | null;
  first_received_estimated: boolean | null;
  supplier_id: string | null;
  /** Absent until migration 006 has run. */
  no_reorder?: boolean | null;
  created_at: string;
  updated_at: string;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    price: Number(row.price) || 0,
    purchasePrice:
      row.purchase_price === null || row.purchase_price === undefined
        ? undefined
        : Number(row.purchase_price) || undefined,
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
    firstReceivedAt: row.first_received_at ? new Date(row.first_received_at) : undefined,
    firstReceivedEstimated: row.first_received_estimated ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    noReorder: row.no_reorder === true,
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
  if (data.purchasePrice !== undefined) out.purchase_price = data.purchasePrice;
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
  if (data.noReorder !== undefined) out.no_reorder = data.noReorder;
  // firstReceivedAt is written at receiving, never through the product form.
  return out;
}

// ---------------------------------------------------------------------------
// Product attributes row (DB) <-> ProductAttributes (app) — migration 010
// ---------------------------------------------------------------------------
export const PRODUCT_ATTRIBUTES = 'product_attributes';

export interface ProductAttributesRow {
  product_id: string;
  composition: FiberShare[] | null;
  color: string | null;
  pattern: string | null;
  fit: string | null;
  size_advice: SizeAdvice | null;
  details: Record<string, string | number | boolean> | null;
  measurements: Measurements | null;
  updated_at: string | null;
  updated_by: string | null;
}

export function rowToAttributes(row: ProductAttributesRow): ProductAttributes {
  return {
    productId: row.product_id,
    composition: row.composition ?? [],
    color: row.color ?? undefined,
    pattern: row.pattern ?? undefined,
    fit: row.fit ?? undefined,
    sizeAdvice: row.size_advice ?? undefined,
    details: row.details ?? {},
    measurements: row.measurements ?? {},
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

/**
 * Only the fields that are set, like productToRow, so an upsert from one part
 * of a form never blanks what another part wrote. An empty string clears a text field.
 * updated_at / updated_by are the trigger's.
 */
export function attributesToRow(
  data: Partial<Omit<ProductAttributes, 'updatedAt'>>
): Partial<ProductAttributesRow> {
  const out: Partial<ProductAttributesRow> = {};
  if (data.productId !== undefined) out.product_id = data.productId;
  if (data.composition !== undefined) out.composition = data.composition;
  if (data.color !== undefined) out.color = data.color || null;
  if (data.pattern !== undefined) out.pattern = data.pattern || null;
  if (data.fit !== undefined) out.fit = data.fit || null;
  if (data.sizeAdvice !== undefined) out.size_advice = data.sizeAdvice || null;
  if (data.details !== undefined) out.details = data.details;
  if (data.measurements !== undefined) out.measurements = data.measurements;
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
  /** Absent until migration 006 has run — read as "still open". */
  outcome?: OrderOutcome | null;
  outcome_at?: string | null;
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
    outcome: row.outcome ?? undefined,
    outcomeAt: row.outcome_at ? new Date(row.outcome_at) : undefined,
  };
}
