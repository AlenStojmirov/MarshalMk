/**
 * Stored sizes → the one order (owner, 2026-11-20).
 *
 *   npm run sizes:order          # preview, writes nothing
 *   npm run sizes:order apply    # writes
 *
 * S, M, L, XL, XXL, XXXL, XXXXL, XXXXXL, XXXXXXL, then numbers from the
 * smallest up (`sortShelf` in src/lib/sizes.ts). Every screen already reads
 * them in that order (`rowToProduct`); this puts the stored lists in it too,
 * so nothing that reads the rows raw sees `M L XL XXL S`.
 *
 * Only the order moves: labels, quantities, stock and sold[] are written back
 * as read, by compare-and-set (`orderShelf` in stock.ts), so a sale in the
 * same second is never lost. Idempotent: a second run finds nothing.
 *
 * A "Sync All" from Firebase writes the order too (inventory-sync.ts), so it
 * does not undo this.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { shelfInOrder, sortShelf } from '../src/lib/sizes';
import { orderShelf } from '../src/lib/stock';

interface Row {
  id: string;
  category: string | null;
  is_visible: boolean | null;
  sizes: { size: string; quantity: number }[] | null;
}

async function main() {
  const apply = process.argv.includes('apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('products').select('id, category, is_visible, sizes').range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const out = rows.filter((r) => !shelfInOrder(r.sizes ?? []));
  const onSite = out.filter((r) => r.is_visible !== false && (r.sizes ?? []).some((s) => s.quantity >= 1));
  console.log(`${rows.length} производи, ${out.length} со големини во погрешен ред (${onSite.length} на сајтот).`);
  for (const r of out.slice(0, 15)) {
    const before = (r.sizes ?? []).map((s) => s.size).join(' ');
    const after = sortShelf(r.sizes ?? []).map((s) => s.size).join(' ');
    console.log(`  ${r.id} [${r.category}]  ${before}  →  ${after}`);
  }
  if (out.length > 15) console.log(`  … и уште ${out.length - 15}`);

  if (!apply) {
    if (out.length) console.log('\nПреглед: ништо не е запишано. За запис: npm run sizes:order apply');
    return;
  }

  let changed = 0;
  const failed: string[] = [];
  for (const r of out) {
    const res = await orderShelf(sb, r.id);
    if (!res.ok) failed.push(`${r.id}: ${res.error}`);
    else if (res.changed) changed++;
  }
  console.log(`\nПодредени: ${changed}.${failed.length ? ` Не успеаја: ${failed.length}` : ''}`);
  for (const f of failed) console.log('  ' + f);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
