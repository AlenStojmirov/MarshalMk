/**
 * Sales ledger — the single record of units leaving the shop.
 *
 * One row per unit-line that left, from either channel. Replaces the role of
 * `products.sold[]`, which had no channel, no cost and no quantity, and could
 * not be aggregated in SQL.
 *
 * Two rules that keep the numbers honest:
 *  - Revenue is always `qty * unitPrice`. `unitPrice` is what was charged after
 *    any discount, for historical and new rows alike.
 *  - Only `reason: 'sale'` is revenue. Giveaways, personal use and write-offs
 *    are units leaving without income and must never read as demand (D-005).
 */

export type SalesChannel = 'store' | 'online';

export type SalesReason =
  | 'sale'
  | 'giveaway'
  | 'personal'
  | 'writeoff'
  | 'return';

/** DB row shape (snake_case), as stored. */
export interface SalesLedgerRow {
  id?: string;
  occurred_at: string;
  channel: SalesChannel;
  reason: SalesReason;
  order_id?: string | null;
  order_number?: string | null;
  product_id: string;
  product_name?: string | null;
  product_category?: string | null;
  size?: string | null;
  qty: number;
  unit_price: number | string;
  unit_list_price?: number | string | null;
  unit_cost?: number | string | null;
  vat_rate?: number | string | null;
  created_by?: string | null;
  source: string;
  created_at?: string;
}

/** App shape (camelCase). */
export interface SalesLedgerEntry {
  id: string;
  occurredAt: Date;
  channel: SalesChannel;
  reason: SalesReason;
  orderId?: string;
  orderNumber?: string;
  productId: string;
  productName?: string;
  productCategory?: string;
  size?: string;
  qty: number;
  unitPrice: number;
  unitListPrice?: number;
  unitCost?: number;
  vatRate?: number;
  source: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const optNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function rowToLedgerEntry(row: SalesLedgerRow): SalesLedgerEntry {
  return {
    id: row.id ?? '',
    occurredAt: new Date(row.occurred_at),
    channel: row.channel,
    reason: row.reason,
    orderId: row.order_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    productId: row.product_id,
    productName: row.product_name ?? undefined,
    productCategory: row.product_category ?? undefined,
    size: row.size ?? undefined,
    qty: num(row.qty) || 1,
    unitPrice: num(row.unit_price),
    unitListPrice: optNum(row.unit_list_price),
    unitCost: optNum(row.unit_cost),
    vatRate: optNum(row.vat_rate),
    source: row.source,
  };
}

export interface LedgerRowInput {
  occurredAt: Date | string;
  channel: SalesChannel;
  reason?: SalesReason;
  orderId?: string | null;
  orderNumber?: string | null;
  productId: string;
  productName?: string | null;
  productCategory?: string | null;
  size?: string | null;
  qty?: number;
  unitPrice: number;
  unitListPrice?: number | null;
  unitCost?: number | null;
  vatRate?: number | null;
  createdBy?: string | null;
  source: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build a ledger row. Used by the POS, the order API and the backfill so all
 * three agree on shape and rounding.
 */
export function buildLedgerRow(input: LedgerRowInput): SalesLedgerRow {
  const occurred =
    input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt);

  return {
    occurred_at: occurred.toISOString(),
    channel: input.channel,
    reason: input.reason ?? reasonForPrice(input.unitPrice),
    order_id: input.orderId ?? null,
    order_number: input.orderNumber ?? null,
    product_id: input.productId,
    product_name: input.productName ?? null,
    product_category: input.productCategory ?? null,
    size: input.size ?? null,
    qty: Math.max(1, Math.round(input.qty ?? 1)),
    unit_price: round2(Math.max(0, input.unitPrice)),
    unit_list_price:
      input.unitListPrice === null || input.unitListPrice === undefined
        ? null
        : round2(input.unitListPrice),
    unit_cost:
      input.unitCost === null || input.unitCost === undefined
        ? null
        : round2(input.unitCost),
    vat_rate: input.vatRate ?? null,
    created_by: input.createdBy ?? null,
    source: input.source,
  };
}

/**
 * A zero price is never a sale. Historical `sold[]` entries at price 0 mix
 * gifts, personal use and damaged stock and cannot be told apart, so they all
 * land on 'personal' (D-005). Since D-012 the POS asks which it was, and the
 * answer travels on the entry — pass it as `recorded` and it wins.
 */
export function reasonForPrice(unitPrice: number, recorded?: SalesReason): SalesReason {
  if (unitPrice > 0) return 'sale';
  return recorded && recorded !== 'sale' ? recorded : 'personal';
}

/** The three answers the POS offers at price 0, in the order it offers them. */
export const NON_SALE_REASONS = ['giveaway', 'personal', 'writeoff'] as const;

/** Revenue for one entry. Non-sale reasons bring in nothing. */
export function entryRevenue(entry: SalesLedgerEntry): number {
  if (entry.reason !== 'sale') return 0;
  return round2(entry.qty * entry.unitPrice);
}

/** Gross profit for one entry, or null when the cost was not recorded. */
export function entryGrossProfit(entry: SalesLedgerEntry): number | null {
  if (entry.reason !== 'sale') return null;
  if (entry.unitCost === undefined) return null;
  return round2(entry.qty * (entry.unitPrice - entry.unitCost));
}

/** Discount given per unit, or null when the list price was not recorded. */
export function entryUnitDiscount(entry: SalesLedgerEntry): number | null {
  if (entry.unitListPrice === undefined) return null;
  return round2(Math.max(0, entry.unitListPrice - entry.unitPrice));
}
