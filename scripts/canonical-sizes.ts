/**
 * Stored size labels → one name per size (Task 9.8).
 *
 *   npm run sizes:canonical          # preview, writes nothing
 *   npm run sizes:canonical apply    # writes
 *
 * 2XL → XXL, 3XL → XXXL, kolicina / количина → "Една големина".
 *
 * Safe before the Firebase switchover, since both matchers compare sizes
 * canonically: the sync's protection (salesMissingFromFirebase, D-012) and
 * the ledger sync. A later "Sync All" may bring back whatever labels Firebase
 * still holds — harmless now, because everything reads through
 * canonicalSize(); run this again afterwards to tidy.
 *
 * Order when renaming in Firebase too: rename there → Sync All → this, with
 * `apply` → npm run ledger:sync (0 new drift). This renames the ledger rows,
 * which the database refund function matches by exact size.
 *
 * Renamed together, so every matcher keeps finding its partner:
 *   products.sizes and products.sold  — renameSizeLabels() in stock.ts, CAS
 *   sales_ledger.size                 — refunds match ledger rows by size
 *   orders.items[].size               — cancelling an order finds its sold[]
 *                                       entries by size + price + day (D-009)
 * Idempotent: a second run finds nothing.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { storedCanonicalLabel } from '../src/lib/sizes';
import { renameSizeLabels } from '../src/lib/stock';

type Json = Record<string, unknown>;

async function main() {
  const apply = process.argv.includes('apply') || process.argv.includes('apply-after-switchover');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const differs = (label: unknown) => typeof label === 'string' && storedCanonicalLabel(label) !== label.trim();
  const tally = new Map<string, number>();
  const count = (from: string) => {
    const k = `${from.trim()} → ${storedCanonicalLabel(from)}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  };

  // products
  const products: Array<{ id: string; sizes: Json[] | null; sold: Json[] | null }> = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('products').select('id, sizes, sold').range(f, f + 999);
    if (error) throw new Error(error.message);
    products.push(...((data ?? []) as typeof products));
    if ((data ?? []).length < 1000) break;
  }
  const productHits = products.filter((p) =>
    (p.sizes ?? []).some((s) => differs(s.size)) || (p.sold ?? []).some((s) => differs(s.size)));
  let shelfLabels = 0, soldLabels = 0;
  for (const p of productHits) {
    for (const s of p.sizes ?? []) if (differs(s.size)) { shelfLabels++; count(String(s.size)); }
    for (const s of p.sold ?? []) if (differs(s.size)) { soldLabels++; count(String(s.size)); }
  }

  // ledger
  const ledger: Array<{ id: string; size: string | null }> = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('sales_ledger').select('id, size').range(f, f + 999);
    if (error) throw new Error(error.message);
    ledger.push(...((data ?? []) as typeof ledger));
    if ((data ?? []).length < 1000) break;
  }
  const ledgerHits = ledger.filter((r) => differs(r.size));

  // orders
  const { data: orders, error: oErr } = await sb.from('orders').select('id, items');
  if (oErr) throw new Error(oErr.message);
  const orderHits = ((orders ?? []) as Array<{ id: string; items: Json[] | null }>)
    .filter((o) => (o.items ?? []).some((i) => differs(i.size)));

  console.log(`Производи:  ${productHits.length} (${shelfLabels} на полица, ${soldLabels} во sold[])`);
  console.log(`Ledger:     ${ledgerHits.length} редови`);
  console.log(`Нарачки:    ${orderHits.length}`);
  for (const [k, n] of [...tally.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);
  console.log('');

  if (!apply) {
    console.log('Преглед — ништо не е запишано. `npm run sizes:canonical apply` запишува.');
    return;
  }

  let ok = 0;
  for (const p of productHits) {
    const r = await renameSizeLabels(sb, p.id, storedCanonicalLabel);
    if (r.ok) ok++;
    else console.error(`  ${p.id}: ${r.error}`);
  }
  console.log(`Производи преименувани: ${ok} од ${productHits.length}`);

  const byTarget = new Map<string, string[]>();
  for (const r of ledgerHits) {
    const to = storedCanonicalLabel(r.size!);
    byTarget.set(`${r.size}\u0000${to}`, [...(byTarget.get(`${r.size}\u0000${to}`) ?? []), r.id]);
  }
  let ledgerOk = 0;
  for (const [k, ids] of byTarget) {
    const [, to] = k.split('\u0000');
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('sales_ledger').update({ size: to }).in('id', ids.slice(i, i + 200));
      if (error) console.error(`  ledger ${to}: ${error.message}`);
      else ledgerOk += Math.min(200, ids.length - i);
    }
  }
  console.log(`Ledger редови: ${ledgerOk} од ${ledgerHits.length}`);

  let ordersOk = 0;
  for (const o of orderHits) {
    const items = (o.items ?? []).map((i) => (differs(i.size) ? { ...i, size: storedCanonicalLabel(String(i.size)) } : i));
    const { error } = await sb.from('orders').update({ items }).eq('id', o.id);
    if (error) console.error(`  order ${o.id}: ${error.message}`);
    else ordersOk++;
  }
  console.log(`Нарачки: ${ordersOk} од ${orderHits.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
