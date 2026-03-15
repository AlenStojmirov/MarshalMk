/**
 * Script to batch-rename products using category + brand code format.
 *
 * Uses Firebase Admin SDK (bypasses security rules).
 * Reads brand codes from src/config/brand-codes.json and renames products
 * in Firestore to the format: "Jeans - #D001", "Shirt - #K002", etc.
 *
 * Commands:
 *   npx tsx scripts/rename-products.ts preview   - Show what names would change (dry run)
 *   npx tsx scripts/rename-products.ts apply      - Apply the renames to Firestore
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getAdminFirestore } from '../src/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load brand codes from JSON
const brandCodesPath = resolve(__dirname, '../src/config/brand-codes.json');
const brandCodesData = JSON.parse(readFileSync(brandCodesPath, 'utf-8'));
const brandCodes: Record<string, string> = brandCodesData.brands;

const CATEGORY_LABELS: Record<string, string> = {
  vaucer: "Voucher",
  hoodies: "Hoodies",
  tShirts: "T-Shirts",
  shirts: "Shirts",
  pants: "Pants",
  jackets: "Jackets",
  belts: "Belts",
  accessories: "Accessories",
  jeans: "Jeans",
  shortsJeans: "Short jeans",
  suits: "Suits",
  cardigans: "Cardigans",
  blazers: "Blazers",
  polos: "Polos",
  oversizeTshirts: "Oversize T-Shirts",
  blouses: "Blouses",
  vests: "Vests",
  coats: "Coats",
  turtleNecks: "Turtle Necks",
  suitJackets: "Suit Jackets",
  halfZips: "Half-Zips",
  fullZips: "Full-Zips",
  shortSleevedShirt: "Short-Sleeved Shirts",
  cargoTrousers: "Cargo Trousers"
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

interface ProductData {
  name?: string;
  brand?: string;
  category?: string;
  [key: string]: unknown;
}

async function main() {
  const db = getAdminFirestore();

  const args = process.argv.slice(2);
  const command = args[0];

  if (command !== 'preview' && command !== 'apply') {
    console.log('Usage:');
    console.log('  npx tsx scripts/rename-products.ts preview   - Dry run, show planned renames');
    console.log('  npx tsx scripts/rename-products.ts apply      - Apply renames to Firestore');
    return;
  }

  const isDryRun = command === 'preview';

  const snapshot = await db.collection('products').get();

  if (snapshot.empty) {
    console.log('No products found.');
    return;
  }

  console.log(`Found ${snapshot.docs.length} products.\n`);

  // Track sequence numbers per brand code
  const brandCounters: Record<string, number> = {};

  const renames: Array<{
    docId: string;
    oldName: string;
    newName: string;
    brand: string;
    category: string;
  }> = [];

  // Sort products by category then by existing name for consistent ordering
  const sortedDocs = [...snapshot.docs].sort((a, b) => {
    const aData = a.data() as ProductData;
    const bData = b.data() as ProductData;
    const catCompare = (aData.category || '').localeCompare(bData.category || '');
    if (catCompare !== 0) return catCompare;
    return (aData.name || '').localeCompare(bData.name || '');
  });

  for (const docSnapshot of sortedDocs) {
    const data = docSnapshot.data() as ProductData;
    const brand = data.brand || '';
    const category = data.category || '';
    const oldName = data.name || '';

    // Get brand code, fallback to "X" for unknown brands
    const brandCode = brand ? (brandCodes[brand] || 'X') : 'X';

    // Increment counter for this brand code
    if (!brandCounters[brandCode]) {
      brandCounters[brandCode] = 1;
    }
    const seq = brandCounters[brandCode]++;

    const label = getCategoryLabel(category);
    const padded = String(seq).padStart(3, '0');
    const newName = `#${brandCode}${padded}`;

    renames.push({
      docId: docSnapshot.id,
      oldName,
      newName,
      brand: brand || '(none)',
      category,
    });
  }

  // Print the plan
  console.log('ID'.padEnd(30) + 'Brand'.padEnd(15) + 'Old Name'.padEnd(40) + 'New Name');
  console.log('-'.repeat(115));

  for (const r of renames) {
    console.log(
      r.docId.substring(0, 28).padEnd(30) +
      r.brand.substring(0, 13).padEnd(15) +
      r.oldName.substring(0, 38).padEnd(40) +
      r.newName
    );
  }

  console.log('-'.repeat(115));
  console.log(`Total: ${renames.length} products to rename\n`);

  // Print brand code summary
  console.log('Brand code counters:');
  for (const [code, count] of Object.entries(brandCounters)) {
    const brandName = Object.entries(brandCodes).find(([, c]) => c === code)?.[0] || '(unknown)';
    console.log(`  ${code} (${brandName}): ${count - 1} products`);
  }

  if (isDryRun) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Run with "apply" to write these changes to Firestore.');
    return;
  }

  // Apply renames using Admin SDK batched writes
  console.log('\nApplying renames...');

  const BATCH_SIZE = 500;
  let batch = db.batch();
  let operationCount = 0;

  for (const r of renames) {
    const productRef = db.collection('products').doc(r.docId);
    batch.update(productRef, {
      name: r.newName,
      updatedAt: FieldValue.serverTimestamp(),
    });
    operationCount++;

    if (operationCount >= BATCH_SIZE) {
      console.log(`  Committing batch of ${operationCount} updates...`);
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    console.log(`  Committing final batch of ${operationCount} updates...`);
    await batch.commit();
  }

  console.log(`\nDone! Renamed ${renames.length} products.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
