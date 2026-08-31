'use client';

/**
 * Suppliers and goods received.
 *
 * Receiving is the only moment a batch's real cost and its arrival date exist.
 * Miss it and they are gone for that batch — and stock ageing, which every
 * clearance and slow-mover rule depends on, has nothing to measure from.
 * `products.created_at` cannot stand in: it is the Firebase sync date, not an
 * arrival.
 *
 * `unit_cost` is kept per line rather than only on the product, so margin on an
 * old sale stays right after a later batch arrives at a different price.
 * `products.purchase_price` holds the most recent cost and nothing more.
 */

import { supabase } from './supabase';
import { receiveIntoStock, ReceiveLine } from './stock';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  leadTimeDays: number;
  minOrderValue?: number;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
}

interface SupplierRow {
  id: string;
  name: string;
  lead_time_days: number;
  min_order_value: number | string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
}

const rowToSupplier = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  leadTimeDays: Number(r.lead_time_days) || 0,
  minOrderValue: r.min_order_value === null ? undefined : Number(r.min_order_value),
  paymentTerms: r.payment_terms ?? undefined,
  notes: r.notes ?? undefined,
  isActive: r.is_active,
});

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return ((data as SupplierRow[] | null) ?? []).map(rowToSupplier);
}

export async function addSupplier(input: {
  name: string;
  leadTimeDays?: number;
  minOrderValue?: number;
  paymentTerms?: string;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.from('suppliers').insert({
    name: input.name.trim(),
    lead_time_days: input.leadTimeDays ?? 14,
    min_order_value: input.minOrderValue ?? null,
    payment_terms: input.paymentTerms?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function updateSupplier(
  id: string,
  patch: Partial<{ name: string; leadTimeDays: number; minOrderValue: number; paymentTerms: string; notes: string; isActive: boolean }>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
  if (patch.minOrderValue !== undefined) row.min_order_value = patch.minOrderValue;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms?.trim() || null;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { error } = await supabase.from('suppliers').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export interface PurchaseLine {
  id?: string;
  productId: string;
  size?: string;
  qty: number;
  unitCost: number;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName?: string;
  orderedAt?: string;
  receivedAt: string;
  invoiceNo?: string;
  notes?: string;
  lines: PurchaseLine[];
  /** Days between ordering and arrival — the measured lead time, when both dates exist. */
  actualLeadDays?: number;
  totalUnits: number;
  totalCost: number;
}

interface PurchaseRow {
  id: string;
  supplier_id: string | null;
  ordered_at: string | null;
  received_at: string;
  invoice_no: string | null;
  notes: string | null;
  suppliers: { name: string } | null;
  purchase_lines: Array<{
    id: string;
    product_id: string;
    size: string | null;
    qty: number;
    unit_cost: number | string;
  }> | null;
}

const dayDiff = (from: string, to: string): number | undefined => {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.round((b - a) / 86_400_000);
};

function rowToPurchase(r: PurchaseRow): Purchase {
  const lines = (r.purchase_lines ?? []).map((l) => ({
    id: l.id,
    productId: l.product_id,
    size: l.size ?? undefined,
    qty: Number(l.qty) || 0,
    unitCost: Number(l.unit_cost) || 0,
  }));
  return {
    id: r.id,
    supplierId: r.supplier_id ?? undefined,
    supplierName: r.suppliers?.name,
    orderedAt: r.ordered_at ?? undefined,
    receivedAt: r.received_at,
    invoiceNo: r.invoice_no ?? undefined,
    notes: r.notes ?? undefined,
    lines,
    actualLeadDays: r.ordered_at ? dayDiff(r.ordered_at, r.received_at) : undefined,
    totalUnits: lines.reduce((a, l) => a + l.qty, 0),
    totalCost: Math.round(lines.reduce((a, l) => a + l.qty * l.unitCost, 0) * 100) / 100,
  };
}

export async function getPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*, suppliers(name), purchase_lines(*)')
    .order('received_at', { ascending: false });
  if (error) throw error;
  return ((data as PurchaseRow[] | null) ?? []).map(rowToPurchase);
}

export interface NewPurchase {
  supplierId?: string;
  orderedAt?: string;
  receivedAt: string;
  invoiceNo?: string;
  notes?: string;
  lines: PurchaseLine[];
}

/**
 * Record a delivery and put the goods on the shelf.
 *
 * Written in an order that cannot leave stock wrong: the purchase and its lines
 * go in first, then the stock moves. If the stock step fails the delivery is
 * rolled back rather than left as a record of goods that were never added —
 * a missing record is recoverable by re-entering it, phantom stock is not.
 */
export async function receivePurchase(input: NewPurchase): Promise<string> {
  if (input.lines.length === 0) throw new Error('Нема ставки за прием.');

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      supplier_id: input.supplierId ?? null,
      ordered_at: input.orderedAt ?? null,
      received_at: input.receivedAt,
      invoice_no: input.invoiceNo?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const purchaseId = (data as { id: string }).id;

  const { error: linesErr } = await supabase.from('purchase_lines').insert(
    input.lines.map((l) => ({
      purchase_id: purchaseId,
      product_id: l.productId,
      size: l.size?.trim() || null,
      qty: Math.max(1, Math.round(l.qty)),
      unit_cost: Math.round(l.unitCost * 100) / 100,
    }))
  );
  if (linesErr) {
    await supabase.from('purchases').delete().eq('id', purchaseId);
    throw linesErr;
  }

  const stockLines: ReceiveLine[] = input.lines.map((l) => ({
    productId: l.productId,
    size: l.size ?? null,
    qty: Math.max(1, Math.round(l.qty)),
    unitCost: l.unitCost,
  }));

  const result = await receiveIntoStock(supabase, stockLines, input.receivedAt);
  if (!result.ok) {
    await supabase.from('purchases').delete().eq('id', purchaseId);
    throw new Error(result.error ?? 'Стоката не можеше да се додаде на залиха.');
  }

  if (input.supplierId) {
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    await supabase
      .from('products')
      .update({ supplier_id: input.supplierId })
      .in('id', productIds);
  }

  return purchaseId;
}
