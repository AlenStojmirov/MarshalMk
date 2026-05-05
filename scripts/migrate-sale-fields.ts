/* eslint-disable no-console */
/**
 * Add a default `sale` JSON object to every Supabase product that doesn't
 * have one yet. Optionally mark a fixed list of products as on sale.
 *
 * Run with: npx tsx scripts/migrate-sale-fields.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCTS_ON_SALE: Array<{ id: string; percentageOff: number }> = [
  // { id: 'product-id-1', percentageOff: 20 },
];

interface SaleInfo {
  isActive: boolean;
  salePrice: number;
  percentageOff: number;
}

async function migrateSaleFields() {
  console.log('Starting sale fields migration...\n');

  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, sale');

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    name: string | null;
    price: number | null;
    sale: SaleInfo | null;
  }>;

  if (rows.length === 0) {
    console.log('No products found.');
    return;
  }

  console.log(`Found ${rows.length} products.\n`);

  const saleMap = new Map(PRODUCTS_ON_SALE.map((p) => [p.id, p.percentageOff]));

  let updated = 0;
  let skipped = 0;
  let saleCount = 0;

  for (const row of rows) {
    if (row.sale !== null) {
      console.log(`Skipping "${row.name || row.id}" - already has sale field`);
      skipped++;
      continue;
    }

    const price = Number(row.price) || 0;
    let saleInfo: SaleInfo;

    if (saleMap.has(row.id)) {
      const percentageOff = saleMap.get(row.id) ?? 0;
      const salePrice = Math.round(price * (1 - percentageOff / 100) * 100) / 100;
      saleInfo = { isActive: true, salePrice, percentageOff };
      saleCount++;
      console.log(`Marking "${row.name || row.id}" ON SALE: ${percentageOff}% off (${price} -> ${salePrice})`);
    } else {
      saleInfo = { isActive: false, salePrice: 0, percentageOff: 0 };
      console.log(`Adding default sale field to "${row.name || row.id}"`);
    }

    const { error: updErr } = await supabase
      .from('products')
      .update({ sale: saleInfo })
      .eq('id', row.id);

    if (updErr) {
      console.error(`  Failed: ${updErr.message}`);
      continue;
    }
    updated++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('Migration completed.');
  console.log('='.repeat(50));
  console.log(`Total: ${rows.length} | Updated: ${updated} | Skipped: ${skipped} | On sale: ${saleCount}`);
}

migrateSaleFields()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
