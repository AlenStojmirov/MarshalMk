/**
 * Script to replace a category on all products that have it
 *
 * Commands:
 *   npx tsx scripts/replace-category.ts list                              - List all categories with product counts
 *   npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory> - Replace category on all matching products
 *
 * Examples:
 *   npx tsx scripts/replace-category.ts list
 *   npx tsx scripts/replace-category.ts replace "Men's Clothing" "Men's Fashion"
 *   npx tsx scripts/replace-category.ts replace Shoes Footwear
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serviceAccountPath = resolve(__dirname, '..', 'service-account-key.json');
let serviceAccount: object;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
} catch {
  console.error('Error: Could not read service-account-key.json');
  console.error('Download it from Firebase Console → Project Settings → Service Accounts → Generate New Private Key');
  console.error(`Expected path: ${serviceAccountPath}`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
const db = getFirestore();

/**
 * List all unique categories with their product counts
 */
async function listCategories() {
  const snapshot = await db.collection('products').get();

  if (snapshot.empty) {
    console.log('No products found in database.');
    return;
  }

  const categoryCounts: Record<string, number> = {};

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const category = data.category || 'Uncategorized';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const sorted = Object.entries(categoryCounts).sort((a, b) => a[0].localeCompare(b[0]));

  console.log('\nAll categories:\n');
  console.log('Category'.padEnd(40) + 'Products');
  console.log('-'.repeat(55));

  for (const [category, count] of sorted) {
    console.log(category.padEnd(40) + count.toString());
  }

  console.log('-'.repeat(55));
  console.log(`Total: ${sorted.length} categories, ${snapshot.docs.length} products`);
}

/**
 * Replace old category with new category on all matching products
 */
async function replaceCategory(oldCategory: string, newCategory: string) {
  console.log(`\nReplacing category: "${oldCategory}" -> "${newCategory}"\n`);

  const snapshot = await db.collection('products').where('category', '==', oldCategory).get();

  if (snapshot.empty) {
    console.log(`No products found with category "${oldCategory}".`);
    console.log('\nRun "npx tsx scripts/replace-category.ts list" to see all categories.');
    return;
  }

  console.log(`Found ${snapshot.docs.length} product(s) with category "${oldCategory}".\n`);

  const BATCH_SIZE = 500;
  let batch = db.batch();
  let operationCount = 0;
  let updatedCount = 0;

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data();

    batch.update(docSnapshot.ref, {
      category: newCategory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    operationCount++;
    updatedCount++;
    console.log(`  Updating "${data.name || docSnapshot.id}": "${oldCategory}" -> "${newCategory}"`);

    if (operationCount >= BATCH_SIZE) {
      console.log(`\n  Committing batch of ${operationCount} updates...`);
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    console.log(`\n  Committing batch of ${operationCount} updates...`);
    await batch.commit();
  }

  console.log('\n' + '='.repeat(50));
  console.log('Category replacement completed!');
  console.log('='.repeat(50));
  console.log(`  Old category: "${oldCategory}"`);
  console.log(`  New category: "${newCategory}"`);
  console.log(`  Products updated: ${updatedCount}`);
}

function printUsage() {
  console.log('Usage:');
  console.log('  npx tsx scripts/replace-category.ts list                                - List all categories');
  console.log('  npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory>  - Replace category');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx scripts/replace-category.ts replace "Men\'s Clothing" "Men\'s Fashion"');
  console.log('  npx tsx scripts/replace-category.ts replace Shoes Footwear');
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
        console.log('Please provide both the old category and the new category.');
        console.log('  npx tsx scripts/replace-category.ts replace <oldCategory> <newCategory>');
        return;
      }
      await replaceCategory(args[1], args[2]);
      break;

    default:
      printUsage();
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
