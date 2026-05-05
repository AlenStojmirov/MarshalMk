/* eslint-disable no-console */
/**
 * Manage product visibility in Supabase + export products to JSON.
 *
 * Commands:
 *   npx tsx scripts/manage-product-visibility.ts list              - List all products with visibility status
 *   npx tsx scripts/manage-product-visibility.ts show <productId>  - Make a product visible
 *   npx tsx scripts/manage-product-visibility.ts hide <productId>  - Hide a product
 *   npx tsx scripts/manage-product-visibility.ts export            - Export all products as JSON
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ProductRow {
  id: string;
  name: string | null;
  price: number | null;
  category: string | null;
  is_visible: boolean | null;
}

async function list() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, category, is_visible')
    .order('name', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as ProductRow[];

  console.log('\nAll products:\n');
  console.log(
    'ID'.padEnd(25) +
      'Name'.padEnd(40) +
      'Price'.padEnd(12) +
      'Category'.padEnd(20) +
      'Visible'
  );
  console.log('-'.repeat(105));

  let visibleCount = 0;
  let hiddenCount = 0;

  for (const row of rows) {
    const isVisible = row.is_visible !== false;
    if (isVisible) visibleCount++;
    else hiddenCount++;

    console.log(
      row.id.padEnd(25) +
        (row.name || 'N/A').substring(0, 38).padEnd(40) +
        `${row.price ?? 0} den.`.padEnd(12) +
        (row.category || 'N/A').substring(0, 18).padEnd(20) +
        (isVisible ? 'YES' : 'HIDDEN')
    );
  }

  console.log('-'.repeat(105));
  console.log(`Total: ${rows.length} | Visible: ${visibleCount} | Hidden: ${hiddenCount}`);
}

async function setVisibility(productId: string, visible: boolean) {
  const { data, error } = await supabase
    .from('products')
    .update({ is_visible: visible })
    .eq('id', productId)
    .select('id, name')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    console.log(`Product "${productId}" not found.`);
    return;
  }

  console.log(`"${data.name || productId}" is now ${visible ? 'VISIBLE' : 'HIDDEN'} on the website.`);
}

async function exportProducts() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) throw error;

  const products = data ?? [];
  if (products.length === 0) {
    console.log('No products found.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `products-export-${timestamp}.json`;

  writeFileSync(filename, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`Exported ${products.length} products to ${filename}`);
}

function printUsage() {
  console.log('Usage:');
  console.log('  npx tsx scripts/manage-product-visibility.ts list              - List all products');
  console.log('  npx tsx scripts/manage-product-visibility.ts show <productId>  - Make product visible');
  console.log('  npx tsx scripts/manage-product-visibility.ts hide <productId>  - Hide product');
  console.log('  npx tsx scripts/manage-product-visibility.ts export            - Export products as JSON');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      await list();
      break;
    case 'show':
      if (!args[1]) {
        console.log('Please provide a product ID.');
        return;
      }
      await setVisibility(args[1], true);
      break;
    case 'hide':
      if (!args[1]) {
        console.log('Please provide a product ID.');
        return;
      }
      await setVisibility(args[1], false);
      break;
    case 'export':
      await exportProducts();
      break;
    default:
      printUsage();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
