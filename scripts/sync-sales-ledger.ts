/* eslint-disable no-console */
/**
 * Sync `sales_ledger` with `products.sold[]` — idempotent, run as often as you like.
 *
 *   npm run ledger:sync                 # report drift, write nothing
 *   npm run ledger:sync apply           # insert what is missing
 *   npm run ledger:sync apply --prune   # also delete rows sold[] no longer has
 *
 * Supersedes the one-shot backfill (see git history). That script could only run
 * once; this one closes the gap that opens every day.
 *
 * Why this exists
 * ---------------
 * `sold[]` is still the source of truth. Nothing writes to the ledger live yet —
 * the POS writes to `sold[]` and the order API writes nothing — so the ledger
 * drifts from the moment it is filled. Until Tasks 0.2 and 0.3 land, this script
 * is what keeps it usable, and reports keep reading `sold[]` (docs/DECISIONS.md
 * D-008).
 *
 * How rows are matched
 * --------------------
 * `sold[]` entries have no id, and two identical sales on one day are perfectly
 * legitimate. So matching is a **multiset** comparison per product, keyed on
 * size + day + price. The difference in counts is what is missing or extra —
 * never a guess about which specific row is which.
 *
 * Extras are reported, not deleted, unless --prune is passed, and even then only
 * rows this tooling wrote. A row written live is never touched.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { buildLedgerRow, reasonForPrice, SalesLedgerRow, SalesReason } from '../src/lib/sales-ledger';

const APPLY = process.argv.includes('apply');
const PRUNE = process.argv.includes('--prune');

const SOURCE_SYNC = 'sync:sold-array';
/** Sources this tooling owns and may prune. Anything else was written live. */
const OWNED_SOURCES = ['backfill:sold-array', 'backfill:sold-array+order', SOURCE_SYNC, 'sync:sold-array+order'];

const fmt = (n: number, d = 0) =>
  n.toLocaleString('mk-MK', { minimumFractionDigits: d, maximumFractionDigits: d });

interface ProductRow {
  id: string;
  name: string | null;
  category: string | null;
  purchase_price: number | string | null;
  sold: Array<{ size?: string; price?: number | string; soldDate?: string; reason?: string }> | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  items: Array<{
    productId?: string;
    price?: number | string;
    quantity?: number;
    size?: string | null;
  }> | null;
}

interface LedgerRead {
  id: string;
  occurred_at: string;
  channel: string;
  reason: string;
  order_id: string | null;
  product_id: string;
  size: string | null;
  qty: number;
  unit_price: number | string;
  source: string;
}

async function pageAll<T>(sb: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(table + ': ' + error.message);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

const dayOf = (iso: string) => (iso ?? '').slice(0, 10);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Multiset key: two identical sales on one day are two legitimate entries. */
const cellKey = (size: string, day: string, price: number) =>
  String(size ?? '') + '|' + day + '|' + money(price);

/** YYYY-MM-DD (or a full ISO string) to midday UTC on that calendar day. */
function dayIso(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '');
  return m ? m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00.000Z' : null;
}

interface SoldCell {
  size: string;
  day: string;
  price: number;
  /**
   * Reasons recorded on the entries in this cell, in order (D-012). Two
   * zero-price units of the same size on the same day can have left for
   * different reasons, so the cell keeps one per entry, not one per cell.
   */
  reasons: Array<SalesReason | undefined>;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Probe with a real column — a count with head:true stays silent when the
  // table is missing, so it cannot be used to test reachability.
  const { error: reachErr } = await sb.from('sales_ledger').select('id').limit(1);
  if (reachErr) {
    console.error('\nsales_ledger не е достапна: ' + reachErr.message);
    console.error('Пушти supabase/migrations/002_sales_ledger.sql во Supabase SQL editor.\n');
    process.exit(1);
  }

  const products = await pageAll<ProductRow>(
    sb, 'products', 'id, name, category, purchase_price, sold'
  );
  const orders = await pageAll<OrderRow>(
    sb, 'orders', 'id, order_number, status, created_at, items'
  );
  const ledger = await pageAll<LedgerRead>(
    sb, 'sales_ledger', 'id, occurred_at, channel, reason, order_id, product_id, size, qty, unit_price, source'
  );

  const costOf = new Map(
    products.map((p) => [p.id, p.purchase_price === null ? null : Number(p.purchase_price)])
  );

  // --- index the ledger by product, then by multiset cell ------------------
  const ledgerByProduct = new Map<string, LedgerRead[]>();
  for (const r of ledger) {
    const list = ledgerByProduct.get(r.product_id) ?? [];
    list.push(r);
    ledgerByProduct.set(r.product_id, list);
  }

  // --- diff each product ---------------------------------------------------
  const toInsert: SalesLedgerRow[] = [];
  const extras: LedgerRead[] = [];
  let soldEntries = 0;
  let soldUndated = 0;

  for (const p of products) {
    const soldCounts = new Map<string, number>();
    const soldCells = new Map<string, SoldCell>();

    for (const s of p.sold ?? []) {
      soldEntries += 1;
      const iso = dayIso(String(s.soldDate ?? ''));
      if (!iso) {
        soldUndated += 1;
        continue;
      }
      const price = Number(s.price) || 0;
      const size = String(s.size ?? '');
      const day = dayOf(iso);
      const k = cellKey(size, day, price);
      soldCounts.set(k, (soldCounts.get(k) ?? 0) + 1);
      if (!soldCells.has(k)) soldCells.set(k, { size, day, price, reasons: [] });
      soldCells.get(k)!.reasons.push(s.reason as SalesReason | undefined);
    }

    const rows = ledgerByProduct.get(p.id) ?? [];
    const ledgerCounts = new Map<string, LedgerRead[]>();
    for (const r of rows) {
      // qty > 1 would come from a live online write; expand it so counts line up
      const k = cellKey(String(r.size ?? ''), dayOf(r.occurred_at), Number(r.unit_price));
      const list = ledgerCounts.get(k) ?? [];
      for (let n = 0; n < Math.max(1, Number(r.qty)); n += 1) list.push(r);
      ledgerCounts.set(k, list);
    }

    // missing: sold[] has more of this cell than the ledger
    for (const [k, want] of soldCounts) {
      const have = ledgerCounts.get(k)?.length ?? 0;
      const cell = soldCells.get(k)!;
      for (let n = 0; n < want - have; n += 1) {
        toInsert.push(
          buildLedgerRow({
            occurredAt: cell.day + 'T12:00:00.000Z',
            channel: 'store',
            // The newest entries are the ones missing, so take reasons from
            // the end; an entry without one falls back to D-005's 'personal'.
            reason: reasonForPrice(cell.price, cell.reasons[cell.reasons.length - 1 - n]),
            productId: p.id,
            productName: p.name,
            productCategory: p.category,
            size: cell.size || null,
            qty: 1,
            unitPrice: cell.price,
            // No record of the list price at the time, so a historical discount
            // cannot be reconstructed. Left null rather than guessed.
            unitListPrice: null,
            unitCost: costOf.get(p.id) ?? null,
            source: SOURCE_SYNC,
          })
        );
      }
    }

    // extra: the ledger has more of this cell than sold[] does
    for (const [k, list] of ledgerCounts) {
      const want = soldCounts.get(k) ?? 0;
      const seen = new Set<string>();
      let surplus = list.length - want;
      for (const r of list) {
        if (surplus <= 0) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        extras.push(r);
        surplus -= Math.max(1, Number(r.qty));
      }
    }
  }

  // --- report --------------------------------------------------------------
  const insertValue = toInsert.reduce((a, r) => a + Number(r.unit_price) * r.qty, 0);
  const extraValue = extras.reduce((a, r) => a + Number(r.unit_price) * Number(r.qty), 0);
  const prunable = extras.filter((r) => OWNED_SOURCES.includes(r.source));
  const notPrunable = extras.filter((r) => !OWNED_SOURCES.includes(r.source));

  console.log('СОСТОЈБА');
  console.log('  sold[] записи:            ' + fmt(soldEntries) + (soldUndated ? ' (' + fmt(soldUndated) + ' без датум, прескокнати)' : ''));
  console.log('  ledger редови:            ' + fmt(ledger.length));
  console.log('');
  console.log('РАЗИДУВАЊЕ');
  console.log('  недостасуваат во ledger:  ' + fmt(toInsert.length) + ' редови · ' + fmt(insertValue) + ' ден.');
  console.log('  вишок во ledger:          ' + fmt(extras.length) + ' редови · ' + fmt(extraValue) + ' ден.');
  if (notPrunable.length) {
    console.log('    од кои живо запишани:   ' + fmt(notPrunable.length) + ' — НЕ се бришат');
  }
  console.log('');

  if (toInsert.length) {
    const byDay = new Map<string, number>();
    toInsert.forEach((r) => {
      const d = dayOf(r.occurred_at);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    });
    console.log('  недостасуваат по ден:');
    [...byDay.entries()].sort().slice(-14).forEach(([d, n]) => console.log('    ' + d + '  ' + fmt(n)));
    console.log('');
  }

  if (extras.length) {
    console.log('  вишок (првите 10):');
    extras.slice(0, 10).forEach((r) =>
      console.log('    ' + r.product_id + ' · size=' + (r.size || '-') + ' · ' + dayOf(r.occurred_at) +
        ' · ' + money(Number(r.unit_price)) + ' · source=' + r.source)
    );
    console.log('  Вишок обично значи повратена или коригирана продажба во sold[].');
    console.log('');
  }

  if (!APPLY) {
    if (toInsert.length === 0 && extras.length === 0) {
      console.log('Ledger-от е усогласен со sold[]. Нема што да се прави.');
    } else {
      console.log('DRY RUN — ништо не е запишано. Пушти со `apply`' +
        (extras.length ? ' (и `--prune` за вишокот)' : '') + '.');
    }
    return;
  }

  // --- insert --------------------------------------------------------------
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await sb.from('sales_ledger').insert(chunk);
    if (error) throw new Error('insert ' + i + ': ' + error.message);
    inserted += chunk.length;
  }
  if (inserted) console.log('Вметнати: ' + fmt(inserted));

  // --- prune ---------------------------------------------------------------
  let pruned = 0;
  if (PRUNE && prunable.length) {
    for (let i = 0; i < prunable.length; i += CHUNK) {
      const ids = prunable.slice(i, i + CHUNK).map((r) => r.id);
      const { error } = await sb.from('sales_ledger').delete().in('id', ids);
      if (error) throw new Error('delete ' + i + ': ' + error.message);
      pruned += ids.length;
    }
    console.log('Избришани: ' + fmt(pruned));
  } else if (extras.length && !PRUNE) {
    console.log('Вишокот е оставен. Додади `--prune` за да се избрише.');
  }

  // --- attribute online orders onto the rows they produced -----------------
  // Orders never create rows — online sales are already entered into sold[] by
  // hand (D-007). This only labels the channel and links the order. Two passes:
  // exact on size and day, then exchanges within a week when unambiguous.
  const fresh = await pageAll<LedgerRead>(
    sb, 'sales_ledger', 'id, occurred_at, channel, reason, order_id, product_id, size, qty, unit_price, source'
  );
  const openRows = fresh.filter((r) => r.channel === 'store');

  interface Ref { orderId: string; orderNumber: string; productId: string; size: string; day: string; price: number }
  const refs: Ref[] = [];
  for (const o of orders.filter((x) => x.status !== 'cancelled')) {
    for (const it of o.items ?? []) {
      if (!it.productId) continue;
      const q = Math.max(1, Math.round(Number(it.quantity) || 1));
      for (let n = 0; n < q; n += 1) {
        refs.push({
          orderId: o.id,
          orderNumber: o.order_number,
          productId: it.productId,
          size: String(it.size ?? ''),
          day: dayOf(o.created_at),
          price: Number(it.price) || 0,
        });
      }
    }
  }

  const alreadyLinked = new Set(fresh.filter((r) => r.order_id).map((r) => r.order_id + '|' + r.id));
  const claimed = new Set<string>();
  const updates: Array<{ row: LedgerRead; ref: Ref; loose: number | null }> = [];

  const linkedPerOrder = new Map<string, number>();
  fresh.filter((r) => r.order_id).forEach((r) =>
    linkedPerOrder.set(r.order_id!, (linkedPerOrder.get(r.order_id!) ?? 0) + 1)
  );
  const refsPerOrder = new Map<string, number>();
  refs.forEach((r) => refsPerOrder.set(r.orderId, (refsPerOrder.get(r.orderId) ?? 0) + 1));

  for (const ref of refs) {
    // skip orders that are already fully attributed
    if ((linkedPerOrder.get(ref.orderId) ?? 0) >= (refsPerOrder.get(ref.orderId) ?? 0)) continue;

    let row = openRows.find(
      (r) =>
        !claimed.has(r.id) &&
        r.product_id === ref.productId &&
        String(r.size ?? '') === ref.size &&
        dayOf(r.occurred_at) === ref.day
    );
    let loose: number | null = null;

    if (!row) {
      const refTime = Date.parse(ref.day + 'T12:00:00.000Z');
      const cands = openRows.filter(
        (r) =>
          !claimed.has(r.id) &&
          r.product_id === ref.productId &&
          r.reason === 'sale' &&
          Math.abs(Date.parse(r.occurred_at) - refTime) / 86_400_000 <= 7
      );
      if (cands.length !== 1) continue;
      row = cands[0];
      loose = Math.round((Date.parse(row.occurred_at) - refTime) / 86_400_000);
    }

    claimed.add(row.id);
    if (!alreadyLinked.has(ref.orderId + '|' + row.id)) updates.push({ row, ref, loose });
  }

  let attributed = 0;
  for (const u of updates) {
    const patch: Record<string, unknown> = {
      channel: 'online',
      order_id: u.ref.orderId,
      order_number: u.ref.orderNumber,
      source: u.row.source.startsWith('backfill:') ? 'backfill:sold-array+order' : 'sync:sold-array+order',
    };
    // The order carries the quoted price and sold[] what was actually charged,
    // so the gap is a discount given by hand off-app (D-007 Q7). Keeping the
    // quoted figure is what makes that discount derivable.
    if (u.ref.price > Number(u.row.unit_price) + 0.5) {
      patch.unit_list_price = Math.round(u.ref.price * 100) / 100;
    }
    const { error } = await sb.from('sales_ledger').update(patch).eq('id', u.row.id);
    if (error) throw new Error('attribute ' + u.row.id + ': ' + error.message);
    attributed += 1;
    console.log('  канал → online: ' + u.ref.orderNumber + ' · ' + u.ref.productId +
      (u.loose !== null ? ' (замена, ' + (u.loose >= 0 ? '+' : '') + u.loose + ' дена)' : ''));
  }
  if (attributed) console.log('Припишани на online: ' + fmt(attributed));

  // --- reconcile from the table -------------------------------------------
  const after = await pageAll<{ qty: number; unit_price: number | string }>(
    sb, 'sales_ledger', 'qty, unit_price'
  );
  const afterSum = after.reduce((a, r) => a + Number(r.unit_price) * Number(r.qty), 0);

  let soldSum = 0;
  let soldCount = 0;
  for (const p of products) {
    for (const s of p.sold ?? []) {
      if (!dayIso(String(s.soldDate ?? ''))) continue;
      soldSum += Number(s.price) || 0;
      soldCount += 1;
    }
  }

  const okRows = after.length === soldCount;
  const okSum = Math.abs(afterSum - soldSum) < 0.5;
  console.log('');
  console.log('ПРОВЕРКА ОД БАЗАТА');
  console.log('  редови:   ' + fmt(after.length) + ' vs sold[] ' + fmt(soldCount) + '  ' + (okRows ? 'OK' : 'РАЗЛИКА'));
  console.log('  вредност: ' + fmt(afterSum) + ' vs ' + fmt(soldSum) + '  ' + (okSum ? 'OK' : 'РАЗЛИКА'));
  if (!okRows || !okSum) {
    console.log('  (разлика останува ако вишокот не е избришан — пушти со `--prune`)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSync failed:', err);
    process.exit(1);
  });
