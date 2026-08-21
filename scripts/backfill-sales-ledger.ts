/* eslint-disable no-console */
/**
 * Backfill `sales_ledger` from `products.sold[]` (Task 0.1).
 *
 *   npx tsx scripts/backfill-sales-ledger.ts          # dry run, writes nothing
 *   npx tsx scripts/backfill-sales-ledger.ts apply    # writes
 *
 * `products.sold[]` is the only source of rows. Online orders are entered into
 * it by hand, so `orders.items` duplicates rows that already exist — building
 * ledger rows from it would double-count (see docs/DECISIONS.md D-007).
 *
 * Orders are still read, but only to relabel the rows they produced as the
 * online channel and attach the order reference. No row is created from an
 * order.
 *
 * The dry run builds everything in memory and reconciles against the source
 * before writing; a mismatch aborts. `apply` saves a JSON snapshot of the
 * source first and re-reconciles from the table afterwards, and refuses to run
 * twice so re-running cannot double the history.
 *
 * Requires supabase/migrations/002_sales_ledger.sql to have been run.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildLedgerRow, reasonForPrice, SalesLedgerRow } from '../src/lib/sales-ledger';

const APPLY = process.argv[2] === 'apply';

const SOURCE_SOLD = 'backfill:sold-array';
const SOURCE_ATTRIBUTED = 'backfill:sold-array+order';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('mk-MK', { minimumFractionDigits: d, maximumFractionDigits: d });

interface ProductRow {
  id: string;
  name: string | null;
  category: string | null;
  purchase_price: number | string | null;
  sold: Array<{ size?: string; price?: number | string; soldDate?: string }> | null;
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

/** YYYY-MM-DD to midday UTC, so a date-only value cannot drift across a day. */
function dateOnlyToIso(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '');
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00.000Z';
}

const dayOf = (iso: string) => (iso ?? '').slice(0, 10);

const matchKey = (productId: string, size: string | null | undefined, day: string) =>
  productId + '|' + String(size ?? '') + '|' + day;

interface OrderItemRef {
  key: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  size: string;
  day: string;
  orderPrice: number;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- preflight -----------------------------------------------------------
  // Probe with a real column. A count with head:true returns no error when the
  // table is missing, so it cannot be used to test reachability.
  const { error: reachErr } = await sb.from('sales_ledger').select('id').limit(1);
  if (reachErr) {
    console.error('\nsales_ledger не е достапна: ' + reachErr.message);
    console.error('Пушти supabase/migrations/002_sales_ledger.sql во Supabase SQL editor.\n');
    process.exit(1);
  }

  const { count: existing } = await sb
    .from('sales_ledger')
    .select('*', { count: 'exact', head: true });
  const { count: alreadyBackfilled } = await sb
    .from('sales_ledger')
    .select('*', { count: 'exact', head: true })
    .like('source', 'backfill:%');

  console.log(
    'sales_ledger: ' + fmt(existing ?? 0) + ' редови, од кои ' +
    fmt(alreadyBackfilled ?? 0) + ' од backfill\n'
  );

  if ((alreadyBackfilled ?? 0) > 0 && APPLY) {
    console.error('Веќе има backfill редови. Прекинувам за да не се удвои историјата.');
    console.error('Ако навистина треба повторно:');
    console.error("  delete from public.sales_ledger where source like 'backfill:%';\n");
    process.exit(1);
  }

  // --- source data ---------------------------------------------------------
  const products = await pageAll<ProductRow>(
    sb, 'products', 'id, name, category, purchase_price, sold'
  );
  const orders = await pageAll<OrderRow>(
    sb, 'orders', 'id, order_number, status, created_at, items'
  );

  const costOf = new Map(
    products.map((p) => [p.id, p.purchase_price === null ? null : Number(p.purchase_price)])
  );

  // --- rows, every one of them from products.sold[] ------------------------
  const rows: SalesLedgerRow[] = [];
  let skippedNoDate = 0;
  let soldTotalEntries = 0;
  let soldTotalValue = 0;

  for (const p of products) {
    for (const s of p.sold ?? []) {
      soldTotalEntries += 1;
      const price = Number(s.price) || 0;

      const iso = dateOnlyToIso(String(s.soldDate ?? ''));
      if (!iso) {
        skippedNoDate += 1;
        continue;
      }
      soldTotalValue += price;

      rows.push(
        buildLedgerRow({
          occurredAt: iso,
          channel: 'store',
          reason: reasonForPrice(price),
          productId: p.id,
          productName: p.name,
          productCategory: p.category,
          size: s.size ?? null,
          qty: 1,
          unitPrice: price,
          // The list price at the time is recorded nowhere, so a historical
          // discount cannot be reconstructed. Left null rather than guessed
          // from today's price.
          unitListPrice: null,
          unitCost: costOf.get(p.id) ?? null,
          source: SOURCE_SOLD,
        })
      );
    }
  }

  // --- relabel the rows that came from an online order ---------------------
  // Matched on product + size + calendar day. Price is deliberately not part of
  // the key: the recorded price often differs from the order price, and sold[]
  // is the figure the shop actually books.
  const liveOrders = orders.filter((o) => o.status !== 'cancelled');

  const orderRefs: OrderItemRef[] = [];
  for (const o of liveOrders) {
    for (const it of o.items ?? []) {
      if (!it.productId) continue;
      const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
      for (let n = 0; n < qty; n += 1) {
        orderRefs.push({
          key: matchKey(it.productId, it.size, dayOf(o.created_at)),
          orderId: o.id,
          orderNumber: o.order_number,
          productId: it.productId,
          size: String(it.size ?? ''),
          day: dayOf(o.created_at),
          orderPrice: Number(it.price) || 0,
        });
      }
    }
  }

  const unmatched: OrderItemRef[] = [];
  const priceGaps: Array<{ ref: OrderItemRef; recorded: number }> = [];
  let attributed = 0;

  for (const ref of orderRefs) {
    const row = rows.find(
      (r) => r.channel === 'store' && matchKey(r.product_id, r.size, dayOf(r.occurred_at)) === ref.key
    );
    if (!row) {
      unmatched.push(ref);
      continue;
    }
    row.channel = 'online';
    row.order_id = ref.orderId;
    row.order_number = ref.orderNumber;
    row.source = SOURCE_ATTRIBUTED;
    attributed += 1;
    const recorded = Number(row.unit_price);
    if (Math.abs(recorded - ref.orderPrice) > 0.5) priceGaps.push({ ref, recorded });
  }

  // --- reporting -----------------------------------------------------------
  const sum = (rs: SalesLedgerRow[]) => rs.reduce((a, r) => a + Number(r.unit_price) * r.qty, 0);
  const byReason = (rs: SalesLedgerRow[]) => {
    const m = new Map<string, number>();
    rs.forEach((r) => m.set(r.reason, (m.get(r.reason) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const storeRows = rows.filter((r) => r.channel === 'store');
  const onlineRows = rows.filter((r) => r.channel === 'online');

  console.log('ИЗВОР — само products.sold[]');
  console.log('  записи:                          ' + fmt(soldTotalEntries));
  console.log('  без валиден датум (прескокнати):  ' + fmt(skippedNoDate));
  console.log('  вредност на датираните:          ' + fmt(soldTotalValue) + ' ден.');
  console.log('');
  console.log('ЛЕДЖЕР ШТО СЕ ГРАДИ');
  console.log('  вкупно: ' + fmt(rows.length) + ' редови · ' + fmt(sum(rows)) + ' ден.');
  console.log('    store:  ' + fmt(storeRows.length) + ' · ' + fmt(sum(storeRows)) + ' ден.');
  console.log('    online: ' + fmt(onlineRows.length) + ' · ' + fmt(sum(onlineRows)) + ' ден. (препознаени, не додадени)');
  console.log('');
  console.log('  по причина:');
  byReason(rows).forEach(([r, n]) => console.log('    ' + r.padEnd(10) + fmt(n)));
  console.log('');

  console.log('ПРИПИШУВАЊЕ НА КАНАЛ — нарачките не создаваат редови');
  console.log('  ставки во живи нарачки: ' + fmt(orderRefs.length));
  console.log('  препознаени во sold[]:  ' + fmt(attributed));
  console.log('  НЕ најдени:             ' + fmt(unmatched.length));
  unmatched.forEach((u) =>
    console.log('    ' + u.orderNumber + ' · ' + u.productId + ' · size=' + (u.size || '-') +
      ' · ' + u.day + ' · цена во нарачка ' + fmt(u.orderPrice))
  );
  if (priceGaps.length) {
    console.log('');
    console.log('  ! цената во sold[] се разликува од цената во нарачката:');
    priceGaps.forEach((g) => {
      const pctOff = g.ref.orderPrice > 0
        ? ((1 - g.recorded / g.ref.orderPrice) * 100).toFixed(1)
        : '-';
      console.log('    ' + g.ref.orderNumber + ' · ' + g.ref.productId +
        ' · нарачка ' + fmt(g.ref.orderPrice) + ' -> запишано ' + fmt(g.recorded) +
        ' (' + pctOff + '% помалку)');
    });
    console.log('  Ledger-от зема запишаното во sold[] — тоа е бројката што дуќанот книжи.');
  }
  console.log('');

  // --- invariants ----------------------------------------------------------
  const problems: string[] = [];
  if (rows.length !== soldTotalEntries - skippedNoDate) {
    problems.push('број редови не одговара на број датирани записи');
  }
  if (Math.abs(sum(rows) - soldTotalValue) > 0.5) {
    problems.push('вредност ' + sum(rows) + ' vs извор ' + soldTotalValue);
  }
  const badSales = rows.filter((r) => r.reason === 'sale' && Number(r.unit_price) <= 0);
  if (badSales.length) problems.push(badSales.length + ' редови со reason=sale и цена 0');
  const noCost = rows.filter((r) => r.unit_cost === null).length;

  console.log('ПРОВЕРКИ');
  if (problems.length === 0) {
    console.log('  OK  збировите се совпаѓаат со sold[]');
    console.log('  OK  нема reason=sale со цена 0');
    console.log('  OK  ниту еден ред не е создаден од orders — нема удвојување');
  } else {
    problems.forEach((p) => console.log('  ГРЕШКА  ' + p));
  }
  console.log('  ' + (noCost > 0 ? '!' : 'OK') + '  без набавна цена: ' + fmt(noCost) + ' редови');
  console.log('');

  if (problems.length > 0) {
    console.error('Има неусогласености — не запишувам.');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('DRY RUN — ништо не е запишано. Пушти со `apply`.');
    return;
  }

  // --- snapshot the source before writing ---------------------------------
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = join(process.cwd(), 'docs', 'snapshots');
  mkdirSync(dir, { recursive: true });
  const snapPath = join(dir, 'pre-ledger-' + stamp + '.json');
  writeFileSync(
    snapPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        products: products.map((p) => ({ id: p.id, sold: p.sold })),
        orders,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('Снимка на изворот: ' + snapPath);

  // --- write ---------------------------------------------------------------
  let written = 0;
  const errors: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb.from('sales_ledger').insert(chunk);
    if (error) {
      errors.push(i + '-' + (i + chunk.length) + ': ' + error.message);
      continue;
    }
    written += chunk.length;
    console.log('  ... ' + written + '/' + rows.length);
  }

  console.log('');
  console.log('Запишани: ' + fmt(written));
  if (errors.length) {
    console.log('Грешки: ' + errors.length);
    errors.slice(0, 5).forEach((e) => console.log('  ' + e));
    process.exit(1);
  }

  // --- read back and reconcile --------------------------------------------
  const check = await pageAll<{
    channel: string;
    qty: number;
    unit_price: number | string;
    reason: string;
  }>(sb, 'sales_ledger', 'channel, qty, unit_price, reason');

  const dbSum = check.reduce((a, r) => a + Number(r.unit_price) * Number(r.qty), 0);
  const zeroSales = check.filter((r) => r.reason === 'sale' && Number(r.unit_price) <= 0).length;
  const mark = (ok: boolean) => (ok ? 'OK' : 'ГРЕШКА');

  console.log('');
  console.log('ПОВТОРНА ПРОВЕРКА ОД БАЗАТА');
  console.log('  редови: ' + fmt(check.length) + ' ' + mark(check.length === rows.length));
  console.log('  вредност: ' + fmt(dbSum) + ' ден. ' + mark(Math.abs(dbSum - soldTotalValue) < 0.5));
  console.log('  online: ' + fmt(check.filter((r) => r.channel === 'online').length));
  console.log('  sale со цена 0: ' + zeroSales + ' ' + mark(zeroSales === 0));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nBackfill failed:', err);
    process.exit(1);
  });
