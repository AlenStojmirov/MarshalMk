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

export interface RepriceLine {
  productId: string;
  size?: string | null;
  /** How many units of this line to reprice. */
  quantity: number;
  /** Price the entries were written with — this is how they are found. */
  oldUnitPrice: number;
  newUnitPrice: number;
  soldDate: string;
}

/**
 * Change the price on `sold[]` entries an order wrote, without touching stock.
 *
 * Used when a discount was given by hand after checkout: the goods left, so the
 * quantities stand, but the amount booked has to match what was actually
 * collected (docs/DECISIONS.md D-007).
 *
 * Entries are found by size + old price + date and only `quantity` of them are
 * changed — `sold[]` has no ids, and repricing every match would catch
 * unrelated sales of the same item on the same day.
 */
export async function repriceSoldEntries(
  sb: SupabaseClient,
  lines: RepriceLine[]
): Promise<StockResult> {
  if (lines.length === 0) return { ok: true, shortages: [] };

  const grouped = new Map<string, RepriceLine[]>();
  for (const l of lines) {
    const list = grouped.get(l.productId) ?? [];
    list.push(l);
    grouped.set(l.productId, list);
  }

  for (const [productId, group] of grouped) {
    let done = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt += 1) {
      const product = await readProduct(sb, productId);
      if (!product) break;

      const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
      const sold = [...(product.sold ?? [])];

      for (const line of group) {
        const wanted = norm(line.size);
        const oldPrice = round2(line.oldUnitPrice);
        let left = line.quantity;

        for (let i = 0; i < sold.length && left > 0; i += 1) {
          const s = sold[i];
          const match =
            norm(s.size) === wanted &&
            round2(Number(s.price) || 0) === oldPrice &&
            String(s.soldDate).slice(0, 10) === line.soldDate.slice(0, 10);
          if (!match) continue;
          sold[i] = { ...s, price: round2(line.newUnitPrice) };
          left -= 1;
        }
      }

      const stock = sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
      done = await casWrite(sb, productId, product.updated_at, { sizes, stock, sold });
    }

    if (!done) {
      return { ok: false, shortages: [], error: 'Could not reprice ' + productId };
    }
  }

  return { ok: true, shortages: [] };
}

export interface ReceiveLine {
  productId: string;
  size?: string | null;
  qty: number;
  unitCost: number;
}

/**
 * Add received goods to stock.
 *
 * Same compare-and-set as a reservation, because receiving and selling can land
 * in the same minute. A size that does not exist yet is created rather than
 * dropped — a delivery is often the first time a size is carried at all.
 *
 * Two fields ride along because receiving is the only moment they are knowable:
 * `purchase_price` becomes the newest cost, and `first_received_at` is set once
 * and never overwritten, since ageing has to run from the first arrival rather
 * than the latest one.
 */
export async function receiveIntoStock(
  sb: SupabaseClient,
  lines: ReceiveLine[],
  receivedOn: string
): Promise<StockResult> {
  if (lines.length === 0) return { ok: true, shortages: [] };

  const grouped = new Map<string, ReceiveLine[]>();
  for (const l of lines) {
    const list = grouped.get(l.productId) ?? [];
    list.push(l);
    grouped.set(l.productId, list);
  }

  for (const [productId, group] of grouped) {
    let done = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt += 1) {
      const { data, error } = await sb
        .from('products')
        .select('id, sizes, stock, sold, updated_at, first_received_at')
        .eq('id', productId)
        .maybeSingle();
      if (error) throw new Error('read ' + productId + ': ' + error.message);
      const product = data as (ProductState & { first_received_at: string | null }) | null;
      if (!product) {
        return { ok: false, shortages: [], error: 'Product not found: ' + productId };
      }

      const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
      for (const line of group) {
        const wanted = norm(line.size);
        const entry = sizes.find((s) => norm(s.size) === wanted);
        if (entry) {
          entry.quantity = (Number(entry.quantity) || 0) + line.qty;
        } else {
          sizes.push({ size: wanted, quantity: line.qty });
        }
      }

      const stock = sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
      const newest = group[group.length - 1];

      const { data: written, error: writeErr } = await sb
        .from('products')
        .update({
          sizes,
          stock,
          purchase_price: round2(newest.unitCost),
          first_received_at: product.first_received_at ?? receivedOn,
        })
        .eq('id', productId)
        .eq('updated_at', product.updated_at)
        .select('id');
      if (writeErr) throw new Error('write ' + productId + ': ' + writeErr.message);
      done = (written ?? []).length > 0;
    }

    if (!done) {
      return { ok: false, shortages: [], error: 'Could not receive ' + productId };
    }
  }

  return { ok: true, shortages: [] };
}

// ---------------------------------------------------------------------------
// Admin writes: a counter sale, a refund, a stock count (D-013)
// ---------------------------------------------------------------------------
//
// The three admin paths used to compute the new stock from the product object
// the page loaded — possibly minutes old — and write it back whole. Harmless
// while every sale was entered in Firebase; data loss once sales are entered
// here next to online orders that reserve stock. An order arriving while a
// POS screen is open would be undone by the next counter sale: its units back
// on the shelf, its `sold[]` entries overwritten by the stale list.
//
// So they read the row fresh and write with the same compare-and-set as the
// order API. A lost race retries against the new state; it never writes over it.

export interface AdminStockResult {
  ok: boolean;
  error?: string;
  /** The row as written, so the caller can show it without a refetch. */
  state?: { sizes: ProductSize[]; stock: number; sold: SoldItem[] };
}

const totalOf = (sizes: ProductSize[]) =>
  sizes.reduce((sum, s) => sum + Math.max(0, Number(s.quantity) || 0), 0);

/**
 * Take one unit off the shelf and record it in `sold[]`.
 *
 * Refuses when the size has nothing left. The old path clamped to zero and
 * recorded the sale anyway, which was a small untruth when stock was only ever
 * a mirror of Firebase — and an oversell now that an online order may have
 * reserved that very unit.
 */
export async function sellOneFromStock(
  sb: SupabaseClient,
  productId: string,
  size: string,
  entry: SoldItem
): Promise<AdminStockResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const product = await readProduct(sb, productId);
    if (!product) return { ok: false, error: 'Производот не е пронајден.' };

    const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
    const slot = sizes.find((s) => norm(s.size) === norm(size));
    const available = slot ? Number(slot.quantity) || 0 : 0;
    if (!slot || available < 1) {
      return { ok: false, error: `Нема залиха за големина ${size || '—'} — можеби е резервирана со online нарачка.` };
    }
    slot.quantity = available - 1;

    const state = { sizes, stock: totalOf(sizes), sold: [...(product.sold ?? []), entry] };
    if (await casWrite(sb, productId, product.updated_at, state)) return { ok: true, state };
  }
  return { ok: false, error: 'Производот се менуваше истовремено — обиди се повторно.' };
}

/**
 * Put one recorded unit back on the shelf.
 *
 * The entry is found by size, price and day in the fresh `sold[]`, never by the
 * index the page was showing: if anything was added or removed since the page
 * loaded, that index points at a different sale.
 */
export async function refundOneToStock(
  sb: SupabaseClient,
  productId: string,
  entry: SoldItem
): Promise<AdminStockResult> {
  const day = (d: string) => String(d).slice(0, 10);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const product = await readProduct(sb, productId);
    if (!product) return { ok: false, error: 'Производот не е пронајден.' };

    const sold = [...(product.sold ?? [])];
    const at = sold.findIndex(
      (s) =>
        norm(s.size) === norm(entry.size) &&
        Number(s.price) === Number(entry.price) &&
        day(s.soldDate) === day(entry.soldDate)
    );
    if (at < 0) return { ok: false, error: 'Таа продажба веќе не постои — можеби е веќе вратена.' };
    sold.splice(at, 1);

    const sizes = (product.sizes ?? []).map((s) => ({ ...s }));
    const slot = sizes.find((s) => norm(s.size) === norm(entry.size));
    if (slot) slot.quantity = (Number(slot.quantity) || 0) + 1;
    else sizes.push({ size: norm(entry.size), quantity: 1 });

    const state = { sizes, stock: totalOf(sizes), sold };
    if (await casWrite(sb, productId, product.updated_at, state)) return { ok: true, state };
  }
  return { ok: false, error: 'Производот се менуваше истовремено — обиди се повторно.' };
}

/**
 * Apply a stock count — the quantities someone actually counted on the shelf.
 *
 * `expected` is what the form showed when it was opened. If the shelf moved
 * since (a sale, a return, an online order), the count was taken against
 * numbers that are no longer true, and writing it would silently undo whatever
 * moved. So it is refused, and the form is reopened on the current figures.
 * `sold[]` is never touched here: a count changes what is on the shelf, not
 * what was sold.
 */
export async function applyStockCount(
  sb: SupabaseClient,
  productId: string,
  expected: ProductSize[],
  counted: ProductSize[]
): Promise<AdminStockResult> {
  const key = (sizes: ProductSize[]) =>
    JSON.stringify(
      [...sizes]
        .map((s) => [norm(s.size), Number(s.quantity) || 0] as const)
        .filter(([, q]) => q !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
    );

  const product = await readProduct(sb, productId);
  if (!product) return { ok: false, error: 'Производот не е пронајден.' };
  if (key(product.sizes ?? []) !== key(expected)) {
    return {
      ok: false,
      error: 'Залихата се смени додека формата беше отворена (продажба или нарачка). ' +
        'Пописот не е зачуван — отвори го производот повторно и внеси ги количините пак.',
    };
  }

  const sizes = counted.map((s) => ({ size: norm(s.size), quantity: Math.max(0, Number(s.quantity) || 0) }));
  const state = { sizes, stock: totalOf(sizes), sold: product.sold ?? [] };
  if (await casWrite(sb, productId, product.updated_at, state)) return { ok: true, state };
  return {
    ok: false,
    error: 'Залихата се смени токму при зачувувањето. Отвори го производот повторно.',
  };
}

/**
 * Rename size labels on one product — shelf and sales alike (Task 9.8).
 *
 * For the one-off move to canonical names (2XL → XXL) after the Firebase
 * switchover. Shelf entries that land on the same name are merged, their
 * quantities added; `sold[]` entries keep everything but the label. Stock is
 * unchanged by construction. Read fresh, compare-and-set, retried like the
 * other writers. `changed: false` when there was nothing to rename.
 */
export async function renameSizeLabels(
  sb: SupabaseClient,
  productId: string,
  rename: (label: string) => string
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const product = await readProduct(sb, productId);
    if (!product) return { ok: false, changed: false, error: 'Производот не е пронајден.' };

    const merged = new Map<string, number>();
    const order: string[] = [];
    let changed = false;
    for (const s of product.sizes ?? []) {
      const from = norm(s.size);
      const to = rename(from);
      if (to !== from) changed = true;
      if (!merged.has(to)) order.push(to);
      merged.set(to, (merged.get(to) ?? 0) + (Number(s.quantity) || 0));
    }
    const sold = (product.sold ?? []).map((e) => {
      const to = rename(norm(e.size));
      if (to !== norm(e.size)) changed = true;
      return { ...e, size: to };
    });
    if (!changed) return { ok: true, changed: false };

    const sizes = order.map((size) => ({ size, quantity: merged.get(size)! }));
    if (await casWrite(sb, productId, product.updated_at, { sizes, stock: totalOf(sizes), sold })) {
      return { ok: true, changed: true };
    }
  }
  return { ok: false, changed: false, error: 'Производот постојано се менуваше — пушти повторно.' };
}
