/* eslint-disable no-console */
/**
 * Backfill `products.purchase_price` in Supabase from the Firebase RTDB inventory.
 *
 * Firebase stores `purchasePrice` doubled — the real cost is half of it. That
 * halving happens in exactly one place: `realPurchasePrice()` in src/lib/cost.ts
 * (see docs/DECISIONS.md D-002).
 *
 * Safer and narrower than "Sync All", which also rewrites sizes/sold/stock.
 * This only fills the cost column.
 *
 *   npx tsx scripts/backfill-purchase-price.ts          # dry run, writes nothing
 *   npx tsx scripts/backfill-purchase-price.ts apply    # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, goOffline } from 'firebase/database';
import { realPurchasePrice } from '../src/lib/cost';

const APPLY = process.argv[2] === 'apply';

const fmt = (n: number) => n.toLocaleString('mk-MK', { maximumFractionDigits: 0 });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Supabase side ---
  const rows: Array<{ id: string; purchase_price: number | string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products_costed') // cost joined in since migration 008
      .select('id, purchase_price')
      .range(from, from + 999);
    if (error) throw new Error(`Supabase: ${error.message}`);
    const batch = data ?? [];
    rows.push(...(batch as typeof rows));
    if (batch.length < 1000) break;
  }

  // --- Firebase side ---
  const app = initializeApp(
    {
      apiKey: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID,
      databaseURL: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL,
      storageBucket: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID,
    },
    'backfill-cost'
  );
  const db = getDatabase(app);
  const snap = await get(ref(db, 'products'));
  const inventory = (snap.exists() ? snap.val() : {}) as Record<string, { purchasePrice?: number }>;
  goOffline(db);

  // --- Plan ---
  const toSet: Array<{ id: string; cost: number }> = [];
  let alreadyCorrect = 0;
  let noFirebaseCost = 0;
  let notInFirebase = 0;

  for (const row of rows) {
    const inv = inventory[row.id];
    if (!inv) { notInFirebase += 1; continue; }

    const cost = realPurchasePrice(inv.purchasePrice);
    if (cost === undefined) { noFirebaseCost += 1; continue; }

    const current = row.purchase_price === null ? null : Number(row.purchase_price);
    if (current !== null && Math.abs(current - cost) < 0.01) { alreadyCorrect += 1; continue; }

    toSet.push({ id: row.id, cost: Math.round(cost * 100) / 100 });
  }

  console.log(`Производи во Supabase:        ${fmt(rows.length)}`);
  console.log(`Записи во Firebase:           ${fmt(Object.keys(inventory).length)}`);
  console.log('');
  console.log(`Ќе се постави набавна цена:   ${fmt(toSet.length)}`);
  console.log(`Веќе точни:                   ${fmt(alreadyCorrect)}`);
  console.log(`Нема цена во Firebase:        ${fmt(noFirebaseCost)}`);
  console.log(`Не постојат во Firebase:      ${fmt(notInFirebase)}`);
  console.log('');
  if (toSet.length) {
    const total = toSet.reduce((a, r) => a + r.cost, 0);
    console.log(`Просечна набавна цена:        ${fmt(total / toSet.length)} ден.`);
    console.log('Примери:');
    toSet.slice(0, 5).forEach((r) => console.log(`  ${r.id} → ${r.cost.toFixed(2)} ден.`));
    console.log('');
  }

  if (!APPLY) {
    console.log('DRY RUN — ништо не е запишано. Пушти со `apply` за да се запише.');
    return;
  }

  let written = 0;
  const errors: string[] = [];
  for (const r of toSet) {
    const { error } = await supabase
      .from('products')
      .update({ purchase_price: r.cost })
      .eq('id', r.id);
    if (error) { errors.push(`${r.id}: ${error.message}`); continue; }
    written += 1;
    if (written % 100 === 0) console.log(`  … ${written}/${toSet.length}`);
  }

  console.log('');
  console.log(`Запишани: ${fmt(written)}`);
  if (errors.length) {
    console.log(`Грешки: ${errors.length}`);
    errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Backfill failed:', err); process.exit(1); });
