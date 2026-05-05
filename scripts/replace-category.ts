/* eslint-disable no-console */
/**
 * Replace one category value with another across all products in Supabase.
 *
 * Commands:
 *   npx tsx scripts/replace-category.ts list
 *   npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory>
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

async function listCategories() {
  const { data, error } = await supabase.from('products').select('category');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ category: string | null }>;

  if (rows.length === 0) {
    console.log('No products found.');
    return;
  }

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const cat = r.category || 'Uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));

  console.log('\nAll categories:\n');
  console.log('Category'.padEnd(40) + 'Products');
  console.log('-'.repeat(55));
  for (const [category, count] of sorted) {
    console.log(category.padEnd(40) + count.toString());
  }
  console.log('-'.repeat(55));
  console.log(`Total: ${sorted.length} categories, ${rows.length} products`);
}

async function replaceCategory(oldCategory: string, newCategory: string) {
  console.log(`\nReplacing category: "${oldCategory}" -> "${newCategory}"\n`);

  const { data, error } = await supabase
    .from('products')
    .update({ category: newCategory })
    .eq('category', oldCategory)
    .select('id, name');

  if (error) throw error;

  const updated = data ?? [];
  if (updated.length === 0) {
    console.log(`No products found with category "${oldCategory}".`);
    console.log('Run "npx tsx scripts/replace-category.ts list" to see all categories.');
    return;
  }

  for (const row of updated as Array<{ id: string; name: string | null }>) {
    console.log(`  Updated "${row.name || row.id}"`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Category replacement completed.');
  console.log('='.repeat(50));
  console.log(`  Old: "${oldCategory}"`);
  console.log(`  New: "${newCategory}"`);
  console.log(`  Products updated: ${updated.length}`);
}

function printUsage() {
  console.log('Usage:');
  console.log('  npx tsx scripts/replace-category.ts list');
  console.log('  npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory>');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      await listCategories();
      break;
    case 'replace':
      if (!args[1] || !args[2]) {
        console.log('Please provide both the old and new category.');
        return;
      }
      await replaceCategory(args[1], args[2]);
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
