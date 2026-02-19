/**
 * Script to manage product visibility and export products as JSON
 *
 * Commands:
 *   npx tsx scripts/manage-product-visibility.ts migrate          - Add isVisible field to all products (default: true)
 *   npx tsx scripts/manage-product-visibility.ts list              - List all products with visibility status
 *   npx tsx scripts/manage-product-visibility.ts show <productId>  - Make a product visible on website
 *   npx tsx scripts/manage-product-visibility.ts hide <productId>  - Hide a product from website
 *   npx tsx scripts/manage-product-visibility.ts export            - Export all products as JSON file
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  writeBatch,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { writeFileSync } from 'fs';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

interface ProductData {
  name?: string;
  price?: number;
  category?: string;
  isVisible?: boolean;
  sale?: { isActive: boolean; salePrice: number; percentageOff: number };
  sizes?: Array<{ size: string; quantity: number }>;
  [key: string]: unknown;
}

/**
 * Migrate: Add isVisible field to all products that don't have it
 */
async function migrate(db: ReturnType<typeof getFirestore>) {
  console.log('Starting isVisible migration...\n');

  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);

  if (snapshot.empty) {
    console.log('No products found in database.');
    return;
  }

  console.log(`Found ${snapshot.docs.length} products.\n`);

  const BATCH_SIZE = 500;
  let batch = writeBatch(db);
  let operationCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data() as ProductData;

    if (data.isVisible !== undefined) {
      console.log(`  Skipping "${data.name || docSnapshot.id}" - already has isVisible field`);
      skippedCount++;
      continue;
    }

    const productRef = doc(db, 'products', docSnapshot.id);
    batch.update(productRef, { isVisible: false });
    operationCount++;
    updatedCount++;
    console.log(`  Adding isVisible=true to "${data.name || docSnapshot.id}"`);

    if (operationCount >= BATCH_SIZE) {
      console.log(`\n  Committing batch of ${operationCount} updates...`);
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    console.log(`\n  Committing final batch of ${operationCount} updates...`);
    await batch.commit();
  }

  console.log('\n' + '='.repeat(50));
  console.log('Migration completed!');
  console.log('='.repeat(50));
  console.log(`  Total products: ${snapshot.docs.length}`);
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

/**
 * List: Show all products with their visibility status
 */
async function list(db: ReturnType<typeof getFirestore>) {
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);

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

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data() as ProductData;
    const isVisible = data.isVisible !== false; // default true if field missing
    if (isVisible) visibleCount++;
    else hiddenCount++;

    console.log(
      docSnap.id.padEnd(25) +
      (data.name || 'N/A').substring(0, 38).padEnd(40) +
      `${data.price || 0} den.`.padEnd(12) +
      (data.category || 'N/A').substring(0, 18).padEnd(20) +
      (isVisible ? 'YES' : 'HIDDEN')
    );
  });

  console.log('-'.repeat(105));
  console.log(`Total: ${snapshot.docs.length} | Visible: ${visibleCount} | Hidden: ${hiddenCount}`);
}

/**
 * Set visibility for a specific product
 */
async function setVisibility(
  db: ReturnType<typeof getFirestore>,
  productId: string,
  visible: boolean
) {
  const productRef = doc(db, 'products', productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.log(`Product "${productId}" not found.`);
    return;
  }

  const data = productSnap.data() as ProductData;

  await updateDoc(productRef, {
    isVisible: visible,
    updatedAt: Timestamp.now(),
  });

  const action = visible ? 'VISIBLE' : 'HIDDEN';
  console.log(`"${data.name || productId}" is now ${action} on the website.`);
}

/**
 * Export: Save all products as a JSON file
 */
async function exportProducts(db: ReturnType<typeof getFirestore>) {
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);

  if (snapshot.empty) {
    console.log('No products found.');
    return;
  }

  const products = snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      // Convert Firestore Timestamps to ISO strings for JSON
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    };
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `products-export-${timestamp}.json`;

  writeFileSync(filename, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`Exported ${products.length} products to ${filename}`);
}

function printUsage() {
  console.log('Usage:');
  console.log('  npx tsx scripts/manage-product-visibility.ts migrate          - Add isVisible to all products');
  console.log('  npx tsx scripts/manage-product-visibility.ts list              - List all products');
  console.log('  npx tsx scripts/manage-product-visibility.ts show <productId>  - Make product visible');
  console.log('  npx tsx scripts/manage-product-visibility.ts hide <productId>  - Hide product from website');
  console.log('  npx tsx scripts/manage-product-visibility.ts export            - Export products as JSON');
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'migrate':
      await migrate(db);
      break;

    case 'list':
      await list(db);
      break;

    case 'show':
      if (!args[1]) {
        console.log('Please provide a product ID.');
        console.log('  npx tsx scripts/manage-product-visibility.ts show <productId>');
        return;
      }
      await setVisibility(db, args[1], true);
      break;

    case 'hide':
      if (!args[1]) {
        console.log('Please provide a product ID.');
        console.log('  npx tsx scripts/manage-product-visibility.ts hide <productId>');
        return;
      }
      await setVisibility(db, args[1], false);
      break;

    case 'export':
      await exportProducts(db);
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
