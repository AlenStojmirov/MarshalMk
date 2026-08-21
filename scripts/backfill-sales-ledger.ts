/* eslint-disable no-console */
/**
 * Backfill `sales_ledger` from `products.sold[]` and `orders.items` (Task 0.1).
 *
 *   npx tsx scripts/backfill-sales-ledger.ts          # dry run, writes nothing
 *   npx tsx scripts/backfill-sales-ledger.ts apply    # writes
 *
 * The dry run builds the full row set in memory and prints the reconciliation
 * it has to satisfy. Nothing is written until `apply`, and `apply` saves a JSON
 * snapshot of the source data first — the ledger is derived, so that snapshot is
 * what makes the step reversible.
 *
 * Refuses to run twice: if backfill rows already exist it stops rather than
 * doubling the history.
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
const SOURCE_ORDERS = 'backfill:orders';

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
    productName?: string;
    price?: number | string;
    originalPrice?: number | string;
    quantity?: number;
    size?: string | null;
  }> | null;
}

async function pageAll<T>(sb: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
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
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- preflight: table reachable, and not already populated ---------------
  // Probe with a real column. A count with head:true returns no error when the
  // table is missing, so it cannot be used to test reachability.
  const { error: reachErr } = await sb.from('sales_ledger').select('id').limit(1);

  if (reachErr) {
    console.error(`\nsales_ledger не е достапна: ${reachErr.message}`);
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
    `sales_ledger: ${fmt(existing ?? 0)} редови, од кои ${fmt(alreadyBackfilled ?? 0)} од backfill\n`
  );

  if ((alreadyBackfilled ?? 0) > 0 && APPLY) {
    console.error('Веќе има backfill редови. Прекинувам за да не се удвои историјата.');
    console.error('Ако навистина треба повторно:');
    console.error("  delete from public.sales_ledger where source like 'backfill:%';\n");
    process.exit(1);
  }

  // --- source data ---------------------------------------------------------
  const products = await pageAll<ProductRow>(
    sb,
    'products',
    'id, name, category, purchase_price, sold'
  );
  const orders = await pageAll<OrderRow>(
    sb,
    'orders',
    'id, order_number, status, created_at, items'
  );

  const costOf = new Map(
    products.map((p) => [p.id, p.purchase_price === null ? null : Number(p.purchase_price)])
  );
  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const catOf = new Map(products.map((p) => [p.id, p.category]));

  // --- rows from products.sold[] -------------------------------------------
  const storeRows: SalesLedgerRow[] = [];
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

      storeRows.push(
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

  // --- rows from orders.items ----------------------------------------------
  // Cancelled orders are not sales. Nothing else is excluded.
  const liveOrders = orders.filter((o) => o.status !== 'cancelled');
  const onlineRows: SalesLedgerRow[] = [];

  for (const o of liveOrders) {
    for (const it of o.items ?? []) {
      const pid = it.productId;
      if (!pid) continue;
      const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
      const price = Number(it.price) || 0;
      const list = it.originalPrice === undefined ? null : Number(it.originalPrice);

      onlineRows.push(
        buildLedgerRow({
          occurredAt: o.created_at,
          channel: 'online',
          reason: reasonForPrice(price),
          orderId: o.id,
          orderNumber: o.order_number,
          productId: pid,
          productName: it.productName ?? nameOf.get(pid) ?? null,
          productCategory: catOf.get(pid) ?? null,
          size: it.size ?? null,
          qty,
          unitPrice: price,
          unitListPrice: list,
          unitCost: costOf.get(pid) ?? null,
          source: SOURCE_ORDERS,
        })
      );
    }
  }

  const all = [...storeRows, ...onlineRows];

  // --- what the numbers must add up to ------------------------------------
  const sum = (rows: SalesLedgerRow[]) =>
    rows.reduce((a, r) => a + Number(r.unit_price) * r.qty, 0);
  const units = (rows: SalesLedgerRow[]) => rows.reduce((a, r) => a + r.qty, 0);

  const byReason = (rows: SalesLedgerRow[]) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.reason, (m.get(r.reason) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const itemUnits = (o: OrderRow) =>
    (o.items ?? []).reduce((s, i) => s + Math.max(1, Math.round(Number(i.quantity) || 1)), 0);
  const itemValue = (o: OrderRow) =>
    (o.items ?? []).reduce(
      (s, i) => s + (Number(i.price) || 0) * Math.max(1, Math.round(Number(i.quantity) || 1)),
      0
    );

  const orderItemUnits = liveOrders.reduce((a, o) => a + itemUnits(o), 0);
  const orderItemValue = liveOrders.reduce((a, o) => a + itemValue(o), 0);

  console.log('ИЗВОР');
  console.log(`  products.sold[] записи:         ${fmt(soldTotalEntries)}`);
  console.log(`  без валиден датум (прескокнати): ${fmt(skippedNoDate)}`);
  console.log(`  вредност на датираните:         ${fmt(soldTotalValue)} ден.`);
  console.log(
    `  нарачки:                       ${fmt(orders.length)} (${fmt(orders.length - liveOrders.length)} откажани, исклучени)`
  );
  console.log(
    `  ставки во живи нарачки:        ${fmt(orderItemUnits)} парчиња · ${fmt(orderItemValue)} ден.`
  );
  console.log('');
  console.log('ЛЕДЖЕР ШТО СЕ ГРАДИ');
  console.log(
    `  store:  ${fmt(storeRows.length)} редови · ${fmt(units(storeRows))} парчиња · ${fmt(sum(storeRows))} ден.`
  );
  console.log(
    `  online: ${fmt(onlineRows.length)} редови · ${fmt(units(onlineRows))} парчиња · ${fmt(sum(onlineRows))} ден.`
  );
  console.log(`  вкупно: ${fmt(all.length)} редови`);
  console.log('');
  console.log('  по причина:');
  byReason(all).forEach(([r, n]) => console.log(`    ${r.padEnd(10)} ${fmt(n)}`));
  console.log('');

  // --- invariants ----------------------------------------------------------
  const problems: string[] = [];

  if (storeRows.length !== soldTotalEntries - skippedNoDate) {
    problems.push('store: број редови не одговара на број датирани записи');
  }
  if (Math.abs(sum(storeRows) - soldTotalValue) > 0.5) {
    problems.push(`store: вредност ${sum(storeRows)} vs извор ${soldTotalValue}`);
  }
  if (units(onlineRows) !== orderItemUnits) {
    problems.push(`online: парчиња ${units(onlineRows)} vs извор ${orderItemUnits}`);
  }
  if (Math.abs(sum(onlineRows) - orderItemValue) > 0.5) {
    problems.push(`online: вредност ${sum(onlineRows)} vs извор ${orderItemValue}`);
  }
  const badSales = all.filter((r) => r.reason === 'sale' && Number(r.unit_price) <= 0);
  if (badSales.length) {
    problems.push(`${badSales.length} редови со reason=sale и цена 0`);
  }
  const noCost = all.filter((r) => r.unit_cost === null).length;

  console.log('ПРОВЕРКИ');
  if (problems.length === 0) {
    console.log('  OK  сите збирови се совпаѓаат со изворот');
    console.log('  OK  нема reason=sale со цена 0');
  } else {
    problems.forEach((p) => console.log(`  ГРЕШКА  ${p}`));
  }
  console.log(
    `  ${noCost > 0 ? '!' : 'OK'}  без набавна цена: ${fmt(noCost)} редови${
      noCost > 0 ? ' (маржата за тие остана непозната)' : ''
    }`
  );
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
  const snapPath = join(dir, `pre-ledger-${stamp}.json`);
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
  console.log(`Снимка на изворот: ${snapPath}`);

  // --- write ---------------------------------------------------------------
  let written = 0;
  const errors: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const { error } = await sb.from('sales_ledger').insert(chunk);
    if (error) {
      errors.push(`${i}-${i + chunk.length}: ${error.message}`);
      continue;
    }
    written += chunk.length;
    console.log(`  ... ${written}/${all.length}`);
  }

  console.log('');
  console.log(`Запишани: ${fmt(written)}`);
  if (errors.length) {
    console.log(`Грешки: ${errors.length}`);
    errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
    process.exit(1);
  }

  // --- read back and reconcile against the source -------------------------
  const check = await pageAll<{
    channel: string;
    qty: number;
    unit_price: number | string;
    reason: string;
  }>(sb, 'sales_ledger', 'channel, qty, unit_price, reason');

  const dbStore = check.filter((r) => r.channel === 'store');
  const dbOnline = check.filter((r) => r.channel === 'online');
  const dbSum = (rows: typeof check) =>
    rows.reduce((a, r) => a + Number(r.unit_price) * Number(r.qty), 0);
  const mark = (ok: boolean) => (ok ? 'OK' : 'ГРЕШКА');

  console.log('');
  console.log('ПОВТОРНА ПРОВЕРКА ОД БАЗАТА');
  console.log(
    `  store:  ${fmt(dbStore.length)} редови · ${fmt(dbSum(dbStore))} ден. ${mark(
      Math.abs(dbSum(dbStore) - soldTotalValue) < 0.5
    )}`
  );
  console.log(
    `  online: ${fmt(dbOnline.length)} редови · ${fmt(dbSum(dbOnline))} ден. ${mark(
      Math.abs(dbSum(dbOnline) - orderItemValue) < 0.5
    )}`
  );
  console.log(
    `  sale со цена 0: ${check.filter((r) => r.reason === 'sale' && Number(r.unit_price) <= 0).length} ${mark(
      check.filter((r) => r.reason === 'sale' && Number(r.unit_price) <= 0).length === 0
    )}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nBackfill failed:', err);
    process.exit(1);
  });
