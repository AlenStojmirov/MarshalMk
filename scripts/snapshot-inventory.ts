/* eslint-disable no-console */
/**
 * Capture today's inventory position (Task 3.4).
 *
 *   npm run snapshot          # show what would be captured
 *   npm run snapshot apply    # capture
 *
 * Turnover and GMROI need *average* inventory across a period, and an average
 * cannot be reconstructed afterwards — a week not captured is a week gone. Every
 * turnover figure so far has used current stock as a stand-in, which is why they
 * have all been approximations.
 *
 * One row per category per day, so a capture is about ten rows. Re-running on
 * the same day overwrites rather than duplicating, which makes it safe to call
 * from anything, on any schedule, as often as you like.
 *
 * Requires supabase/migrations/005_ageing_and_snapshots.sql.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const APPLY = process.argv[2] === 'apply';
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

/** Same 23 -> 9 grouping the reports use. */
const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло', oversizeTshirts: 'Маици & Поло', polos: 'Маици & Поло',
  shirts: 'Кошули', shortSleevedShirt: 'Кошули', blouses: 'Кошули',
  cardigans: 'Плетиво', turtleNecks: 'Плетиво', halfZips: 'Плетиво',
  hoodies: 'Дуксери', fullZips: 'Дуксери',
  jeans: 'Фармерки', shortsJeans: 'Фармерки',
  pants: 'Панталони', cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили', coats: 'Јакни & Мантили', vests: 'Јакни & Мантили',
  suits: 'Свечено', blazers: 'Свечено', suitJackets: 'Свечено',
  belts: 'Аксесоари', accessories: 'Аксесоари',
};
const NON_MERCHANDISE = new Set(['vaucer']);
const groupOf = (c: string) => CATEGORY_GROUPS[c] ?? c ?? '—';

interface Row {
  id: string;
  category: string | null;
  price: number | string;
  purchase_price: number | string | null;
  sizes: Array<{ size: string; quantity: number }> | null;
  sale: { isActive?: boolean; salePrice?: number } | null;
}

export interface SnapshotRow {
  taken_on: string;
  category: string;
  units: number;
  cost_value: number;
  retail_value: number;
  models: number;
}

/**
 * Build today's snapshot rows. Exported so the baseline report can capture one
 * as a side effect of being run — a snapshot people forget to take is worth
 * nothing.
 */
export async function buildSnapshot(sb: SupabaseClient, takenOn: string): Promise<SnapshotRow[]> {
  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from('products_costed') // cost joined in since migration 008
      .select('id, category, price, purchase_price, sizes, sale')
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const byGroup = new Map<string, SnapshotRow>();

  for (const r of rows) {
    if (NON_MERCHANDISE.has(r.category ?? '')) continue;
    const units = (r.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
    if (units === 0) continue;

    const g = groupOf(r.category ?? '');
    const price =
      r.sale?.isActive && Number(r.sale.salePrice) > 0 ? Number(r.sale.salePrice) : Number(r.price);
    const cost = r.purchase_price === null ? 0 : Number(r.purchase_price);

    const st = byGroup.get(g) ?? {
      taken_on: takenOn, category: g, units: 0, cost_value: 0, retail_value: 0, models: 0,
    };
    st.units += units;
    st.models += 1;
    st.cost_value = round2(st.cost_value + units * cost);
    st.retail_value = round2(st.retail_value + units * price);
    byGroup.set(g, st);
  }

  return [...byGroup.values()].sort((a, b) => b.cost_value - a.cost_value);
}

/** Capture today, overwriting today's rows rather than duplicating them. */
export async function captureSnapshot(sb: SupabaseClient, takenOn: string): Promise<number> {
  const snapshot = await buildSnapshot(sb, takenOn);
  if (snapshot.length === 0) return 0;
  const { error } = await sb
    .from('inventory_snapshots')
    .upsert(snapshot, { onConflict: 'taken_on,category' });
  if (error) throw new Error(error.message);
  return snapshot.length;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { error: reachErr } = await sb.from('inventory_snapshots').select('id').limit(1);
  if (reachErr) {
    console.error('\ninventory_snapshots не е достапна: ' + reachErr.message);
    console.error('Пушти supabase/migrations/005_ageing_and_snapshots.sql.\n');
    process.exit(1);
  }

  const takenOn = new Date().toISOString().slice(0, 10);
  const snapshot = await buildSnapshot(sb, takenOn);

  console.log('СНИМКА ' + takenOn);
  console.log('');
  console.log('  Група'.padEnd(24) + 'Модели'.padStart(8) + 'Парчиња'.padStart(10) + 'Набавна'.padStart(14) + 'Продажна'.padStart(14));
  for (const s of snapshot) {
    console.log(
      '  ' + s.category.padEnd(22) + String(s.models).padStart(8) + String(s.units).padStart(10) +
      fmt(s.cost_value).padStart(14) + fmt(s.retail_value).padStart(14)
    );
  }
  console.log('  ' + '-'.repeat(68));
  console.log(
    '  ' + 'ВКУПНО'.padEnd(22) +
    String(snapshot.reduce((a, s) => a + s.models, 0)).padStart(8) +
    String(snapshot.reduce((a, s) => a + s.units, 0)).padStart(10) +
    fmt(snapshot.reduce((a, s) => a + s.cost_value, 0)).padStart(14) +
    fmt(snapshot.reduce((a, s) => a + s.retail_value, 0)).padStart(14)
  );
  console.log('');

  const { count } = await sb
    .from('inventory_snapshots')
    .select('*', { count: 'exact', head: true });
  const { data: first } = await sb
    .from('inventory_snapshots')
    .select('taken_on')
    .order('taken_on', { ascending: true })
    .limit(1);
  const since = (first as Array<{ taken_on: string }> | null)?.[0]?.taken_on;

  console.log('  постоечки снимки: ' + fmt(count ?? 0) + (since ? ' · од ' + since : ''));
  console.log('');

  if (!APPLY) {
    console.log('Ништо не е запишано. Пушти со `apply`.');
    return;
  }

  const written = await captureSnapshot(sb, takenOn);
  console.log('Запишани ' + written + ' реда за ' + takenOn + '.');
  console.log('Повторно пуштање денес го препишува истиот ден, не додава.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('\nFailed:', err); process.exit(1); });
}
