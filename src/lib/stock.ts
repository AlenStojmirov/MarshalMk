/**
 * Stock reservation for online orders.
 *
 * With one or two pieces per variant, two customers ordering the last item
 * within the same minute is the exact failure this exists to prevent. The
 * Supabase JS client has no multi-statement transaction, so each product is
 * updated with a compare-and-set on `updated_at`: read, compute, then write
 * only if the row has not changed underneath. A lost race retries; it never
 * silently oversells.
 *
 * One update per product carries all three effects — variant quantities, the
 * `stock` total, and the `sold[]` entries — so a reservation cannot half-apply.
 *
 * `sold[]` is still the source of truth for reporting (docs/DECISIONS.md D-008),
 * which is why an online order writes there as well as to the ledger. That also
 * means staff must stop entering online orders by hand, or the sale lands twice
 * (D-007).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ProductSize, SoldItem } from '@/types';

const MAX_ATTEMPTS = 4;

export interface StockLine {
  productId: string;
  size?: string | null;
  /** Units ordered. Always positive. */
  quantity: number;
  /** Charged per unit — what goes into `sold[]` and the ledger. */
  unitPrice: number;
  /** YYYY-MM-DD. Matches the format the POS writes. */
  soldDate: string;
}

export interface Shortage {
  productId: string;
  size: string;
  requested: number;
  available: number;
}

export interface StockResult {
  ok: boolean;
  shortages: Shortage[];
  /** Human-readable reason when ok is false and nothing is short. */
  error?: string;
}

interface ProductState {
  id: string;
  sizes: ProductSize[] | null;
  stock: number | null;
  sold: SoldItem[] | null;
  updated_at: string;
}

const norm = (s: string | null | undefined) => String(s ?? '').trim();
const round2 = (n: number) => Math.round(n * 100) / 100;

function groupByProduct(lines: StockLine[]): Map<string, StockLine[]> {
  const out = new Map<string, StockLine[]>();
  for (const l of lines) {
    const list = out.get(l.productId) ?? [];
    list.push(l);
    out.set(l.productId, list);
  }
  return out;
}

async function readProduct(sb: SupabaseClient, id: string): Promise<ProductState | null> {
  const { data, error } = await sb
    .from('products')
    .select('id, sizes, stock, sold, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('read ' + id + ': ' + error.message);
  return (data as ProductState | null) ?? null;
}

/**
 * Write sizes/stock/sold only if the row has not changed since it was read.
 * Returns false when the compare-and-set lost, so the caller can retry.
 */
async function casWrite(
  sb: SupabaseClient,
  id: string,
  seenUpdatedAt: string,
  patch: { sizes: ProductSize[]; stock: number; sold: SoldItem[] }
): Promise<boolean> {
  const { data, error } = await sb
    .from('products')
    .update(patch)
    .eq('id', id)
    .eq('updated_at', seenUpdatedAt)
    .select('id');
  if (error) throw new Error('write ' + id + ': ' + error.message);
  return (data ?? []).length > 0;
}

/**
 * Reserve the ordered units and record them in `sold[]`.
 *
 * All-or-nothing across products: if a later product is short or keeps losing
 * the compare-and-set, the products already reserved are released before
 * returning, so a failed order leaves stock exactly as it was.
 */
export async function applyOrderToStock(
  sb: SupabaseClient,
  lines: StockLine[]
): Promise<StockResult> {
  const grouped = groupByProduct(lines);
  const applied: StockLine[] = [];

  for (const [productId, group] of grouped) {
    let done = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt += 1) {
      const product = await readProduct(sb, productId);
      if (!product) {
        await revertOrderFromStock(sb, applied);
        return { ok: false, shortages: [], error: 'Product not found: ' + productId };
      }

      const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
      const shortages: Shortage[] = [];

      for (const line of group) {
        const wanted = norm(line.size);
        const entry = sizes.find((s) => norm(s.size) === wanted);
        const available = entry ? Number(entry.quantity) || 0 : 0;
        if (available < line.quantity) {
          shortages.push({
            productId,
            size: wanted,
            requested: line.quantity,
            available,
          });
        }
      }

      if (shortages.length > 0) {
        await revertOrderFromStock(sb, applied);
        return { ok: false, shortages };
      }

      // Deduct, then append one sold[] entry per unit.
      const sold = [...(product.sold ?? [])];
      for (const line of group) {
        const wanted = norm(line.size);
        const entry = sizes.find((s) => norm(s.size) === wanted)!;
        entry.quantity = Math.max(0, (Number(entry.quantity) || 0) - line.quantity);
        for (let n = 0; n < line.quantity; n += 1) {
          sold.push({
            size: wanted,
            price: round2(line.unitPrice),
            soldDate: line.soldDate,
          });
        }
      }

      const stock = sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
      done = await casWrite(sb, productId, product.updated_at, { sizes, stock, sold });
    }

    if (!done) {
      await revertOrderFromStock(sb, applied);
      return {
        ok: false,
        shortages: [],
        error: 'Could not reserve ' + productId + ' — the product kept changing.',
      };
    }

    applied.push(...group);
  }

  return { ok: true, shortages: [] };
}

/**
 * Put the units back and remove the `sold[]` entries the order added.
 *
 * Entries are removed by matching size + price + date and taking that many —
 * `sold[]` has no ids, and removing by index would be wrong the moment anything
 * else touched the array. Missing entries are tolerated: a revert must never
 * fail halfway and leave stock wrong.
 */
export async function revertOrderFromStock(
  sb: SupabaseClient,
  lines: StockLine[]
): Promise<StockResult> {
  if (lines.length === 0) return { ok: true, shortages: [] };

  const grouped = groupByProduct(lines);

  for (const [productId, group] of grouped) {
    let done = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt += 1) {
      const product = await readProduct(sb, productId);
      if (!product) break; // nothing to put back

      const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
      let sold = [...(product.sold ?? [])];

      for (const line of group) {
        const wanted = norm(line.size);
        const entry = sizes.find((s) => norm(s.size) === wanted);
        if (entry) {
          entry.quantity = (Number(entry.quantity) || 0) + line.quantity;
        } else {
          sizes.push({ size: wanted, quantity: line.quantity });
        }

        const price = round2(line.unitPrice);
        let toRemove = line.quantity;
        sold = sold.filter((s) => {
          if (toRemove <= 0) return true;
          const match =
            norm(s.size) === wanted &&
            round2(Number(s.price) || 0) === price &&
            String(s.soldDate).slice(0, 10) === line.soldDate.slice(0, 10);
          if (match) {
            toRemove -= 1;
            return false;
          }
          return true;
        });
      }

      const stock = sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
      done = await casWrite(sb, productId, product.updated_at, { sizes, stock, sold });
    }
  }

  return { ok: true, shortages: [] };
}
