/* eslint-disable no-console */
/**
 * Mark / unmark products as ON SALE in Supabase.
 *
 * Usage:
 *   npx tsx scripts/set-products-on-sale.ts list
 *   npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>
 *   npx tsx scripts/set-products-on-sale.ts remove <productId>
 *
 * Or modify PRODUCTS_TO_UPDATE below and run with no arguments.
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

const PRODUCTS_TO_UPDATE: Array<{ id: string; percentageOff: number }> = [
  // { id: 'SKU-001', percentageOff: 20 },
];

async function setProductOnSale(productId: string, percentageOff: number) {
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('id', productId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!product) {
    console.log(`Product "${productId}" not found`);
    return false;
  }

  const price = Number(product.price) || 0;
  const salePrice = Math.round(price * (1 - percentageOff / 100) * 100) / 100;

  const { error } = await supabase
    .from('products')
    .update({ sale: { isActive: true, salePrice, percentageOff } })
    .eq('id', productId);

  if (error) throw error;

  console.log(`"${product.name || productId}" is now ON SALE`);
  console.log(`   Original: ${price} ден. → Sale: ${salePrice} ден. (${percentageOff}% off)`);
  return true;
}

async function removeProductFromSale(productId: string) {
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', productId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!product) {
    console.log(`Product "${productId}" not found`);
    return false;
  }

  const { error } = await supabase
    .from('products')
    .update({ sale: { isActive: false, salePrice: 0, percentageOff: 0 } })
    .eq('id', productId);

  if (error) throw error;

  console.log(`"${product.name || productId}" removed from sale`);
  return true;
}

async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, sale')
    .order('name', { ascending: true });

  if (error) throw error;
  const rows = data ?? [];

  console.log('\nAvailable products:\n');
  console.log('ID'.padEnd(25) + 'Name'.padEnd(40) + 'Price'.padEnd(10) + 'On Sale');
  console.log('-'.repeat(85));

  for (const row of rows as Array<{ id: string; name: string | null; price: number | null; sale: { isActive?: boolean } | null }>) {
    const onSale = row.sale?.isActive ? 'YES' : 'No';
    console.log(
      row.id.padEnd(25) +
        (row.name || 'N/A').substring(0, 38).padEnd(40) +
        `${row.price ?? 0} ден.`.padEnd(10) +
        onSale
    );
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const command = args[0];

    if (command === 'list') {
      await listProducts();
      return;
    }

    if (command === 'remove' && args[1]) {
      await removeProductFromSale(args[1]);
      return;
    }

    const productId = args[0];
    const percentageOff = parseInt(args[1], 10);

    if (!productId || isNaN(percentageOff)) {
      console.log('Usage:');
      console.log('  npx tsx scripts/set-products-on-sale.ts list');
      console.log('  npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>');
      console.log('  npx tsx scripts/set-products-on-sale.ts remove <productId>');
      return;
    }

    await setProductOnSale(productId, percentageOff);
    return;
  }

  if (PRODUCTS_TO_UPDATE.length === 0) {
    console.log('No products specified in PRODUCTS_TO_UPDATE array.');
    console.log('\nUsage:');
    console.log('  1. Add products to PRODUCTS_TO_UPDATE array, or');
    console.log('  2. CLI: npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>');
    return;
  }

  console.log(`Setting ${PRODUCTS_TO_UPDATE.length} products on sale...\n`);
  for (const product of PRODUCTS_TO_UPDATE) {
    await setProductOnSale(product.id, product.percentageOff);
  }
  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
