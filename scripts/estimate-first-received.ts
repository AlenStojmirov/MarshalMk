/* eslint-disable no-console */
/**
 * Estimate `first_received_at` for products that were here before receiving
 * existed (Task 2.3).
 *
 *   npm run ageing:estimate          # dry run, writes nothing
 *   npm run ageing:estimate apply    # writes
 *
 * Goods received from now on carry a real arrival date. The products already in
 * the shop never will, so ageing has nothing to measure from unless something
 * is inferred — and without ageing there is no clearance rule, no slow-mover
 * rule and no dead-stock figure.
 *
 * The estimate is the earliest of: the first recorded sale, and `created_at`.
 * A product must have been on the shelf before it could be sold, so the first
 * sale is an upper bound on arrival — which means every estimated age is a
 * *lower* bound. Stock is at least this old, possibly older. Erring that way is
 * deliberate: it under-flags rather than over-flags.
 *
 * `created_at` is the Firebase sync date rather than an arrival, which is why
 * it is only used when it is the earlier of the two, or when there are no sales
 * at all.
 *
 * Rows written this way are marked `first_received_estimated = true`, so an
 * estimate is never later mistaken for a measurement. Products that already
 * have a real date from a delivery are never touched.
 *
 * Requires supabase/migrations/005_ageing_and_snapshots.sql.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv[2] === 'apply';
const fmt = (n: number) => n.toLocaleString('mk-MK');

interface Row {
  id: string;
  category: string | null;
  created_at: string;
  first_received_at: string | null;
  first_received_estimated: boolean;
  purchase_price: number | string | null;
  sizes: Array<{ size: string; quantity: number }> | null;
  sold: Array<{ price?: number | string; soldDate?: string }> | null;
}

const dayOf = (iso: string) => iso.slice(0, 10);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { error: reachErr } = await sb.from('products').select('first_received_estimated').limit(1);
  if (reachErr) {
    console.error('\nКолоната не постои: ' + reachErr.message);
    console.error('Пушти supabase/migrations/005_ageing_and_snapshots.sql.\n');
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from('products')
      .select('id, category, created_at, first_received_at, first_received_estimated, purchase_price, sizes, sold')
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const units = (r: Row) =>
    (r.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);

  const measured = rows.filter((r) => r.first_received_at && !r.first_received_estimated);
  const already = rows.filter((r) => r.first_received_at && r.first_received_estimated);
  const missing = rows.filter((r) => !r.first_received_at);

  interface Plan { id: string; date: string; from: 'sale' | 'created'; units: number }
  const plan: Plan[] = [];

  for (const r of missing) {
    const saleDays = (r.sold ?? [])
      .map((s) => String(s.soldDate ?? ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
      .map((d) => d.slice(0, 10))
      .sort();

    const created = dayOf(r.created_at);
    const earliestSale = saleDays[0];

    // Whichever is older is the better guess at when the goods arrived.
    const date = earliestSale && earliestSale < created ? earliestSale : created;
    plan.push({
      id: r.id,
      date,
      from: earliestSale && earliestSale < created ? 'sale' : 'created',
      units: units(r),
    });
  }

  const now = Date.now();
  const ageOf = (d: string) => Math.floor((now - Date.parse(d)) / 86_400_000);
  const buckets = [
    { label: '0–30 дена', min: 0, max: 30 },
    { label: '31–90', min: 31, max: 90 },
    { label: '91–180', min: 91, max: 180 },
    { label: '181–365', min: 181, max: 365 },
    { label: 'над 365', min: 366, max: Infinity },
  ];

  console.log('СОСТОЈБА');
  console.log('  производи:                    ' + fmt(rows.length));
  console.log('  со измерен датум на прием:    ' + fmt(measured.length));
  console.log('  со претходна проценка:        ' + fmt(already.length));
  console.log('  без датум:                    ' + fmt(missing.length));
  console.log('');

  if (plan.length === 0) {
    console.log('Нема што да се процени.');
    return;
  }

  const fromSale = plan.filter((p) => p.from === 'sale').length;
  console.log('ПЛАН');
  console.log('  ќе се процени:                ' + fmt(plan.length));
  console.log('    од најрана продажба:        ' + fmt(fromSale));
  console.log('    од created_at:              ' + fmt(plan.length - fromSale));
  console.log('');
  console.log('  распределба по возраст (со залиха):');
  for (const b of buckets) {
    const inB = plan.filter((p) => p.units > 0 && ageOf(p.date) >= b.min && ageOf(p.date) <= b.max);
    const u = inB.reduce((a, p) => a + p.units, 0);
    console.log(
      '    ' + b.label.padEnd(12) + String(inB.length).padStart(4) + ' модели · ' +
      String(u).padStart(5) + ' парчиња'
    );
  }
  console.log('');
  console.log('  Проценката е долна граница — стоката е барем толку стара, можеби постара.');
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN — ништо не е запишано. Пушти со `apply`.');
    return;
  }

  let written = 0;
  for (const p of plan) {
    const { error } = await sb
      .from('products')
      .update({ first_received_at: p.date, first_received_estimated: true })
      .eq('id', p.id)
      .is('first_received_at', null); // never overwrite a measured date
    if (error) {
      console.error('  ' + p.id + ': ' + error.message);
      continue;
    }
    written += 1;
    if (written % 100 === 0) console.log('  … ' + written + '/' + plan.length);
  }

  console.log('');
  console.log('Запишани: ' + fmt(written));

  const { count: stillMissing } = await sb
    .from('products')
    .select('*', { count: 'exact', head: true })
    .is('first_received_at', null);
  console.log('Останати без датум: ' + fmt(stillMissing ?? 0));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('\nFailed:', err); process.exit(1); });
