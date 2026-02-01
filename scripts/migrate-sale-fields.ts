/**
 * Migration script to add sale fields to existing products in Firestore
 *
 * This script:
 * 1. Adds default sale fields to all products that don't have them
 * 2. Optionally marks specific products as on sale
 *
 * Run with: npx tsx scripts/migrate-sale-fields.ts
 */

import { config } from 'dotenv';
// Load environment variables from .env.local
config({ path: '.env.local' });

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc
} from 'firebase/firestore';

// Firebase configuration - uses same config as the app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Products to mark as ON SALE (by ID)
// Modify this array with your actual product IDs and sale percentages
const PRODUCTS_ON_SALE: Array<{ id: string; percentageOff: number }> = [
  // Example: { id: 'product-id-1', percentageOff: 20 },
  // Example: { id: 'product-id-2', percentageOff: 30 },
];

interface SaleInfo {
  isActive: boolean;
  salePrice: number;
  percentageOff: number;
}

interface ProductData {
  price?: number;
  sale?: SaleInfo;
  [key: string]: unknown;
}

async function migrateSaleFields() {
  console.log('🚀 Starting sale fields migration...\n');

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);

  if (snapshot.empty) {
    console.log('❌ No products found in database.');
    return;
  }

  console.log(`📦 Found ${snapshot.docs.length} products in database.\n`);

  // Create a Set for quick lookup of products to mark on sale
  const saleProductIds = new Set(PRODUCTS_ON_SALE.map(p => p.id));
  const salePercentages = new Map(PRODUCTS_ON_SALE.map(p => [p.id, p.percentageOff]));

  // Firestore batch has a limit of 500 operations
  const BATCH_SIZE = 500;
  let batch = writeBatch(db);
  let operationCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let saleCount = 0;

  for (const docSnapshot of snapshot.docs) {
    const productId = docSnapshot.id;
    const data = docSnapshot.data() as ProductData;

    // Skip if product already has sale field
    if (data.sale !== undefined) {
      console.log(`⏭️  Skipping "${data.name || productId}" - already has sale field`);
      skippedCount++;
      continue;
    }

    const price = data.price || 0;
    let saleInfo: SaleInfo;

    // Check if this product should be on sale
    if (saleProductIds.has(productId)) {
      const percentageOff = salePercentages.get(productId) || 0;
      const salePrice = Math.round((price * (1 - percentageOff / 100)) * 100) / 100;

      saleInfo = {
        isActive: true,
        salePrice,
        percentageOff
      };
      saleCount++;
      console.log(`🏷️  Marking "${data.name || productId}" ON SALE: ${percentageOff}% off ($${price} → $${salePrice})`);
    } else {
      // Default: not on sale
      saleInfo = {
        isActive: false,
        salePrice: 0,
        percentageOff: 0
      };
      console.log(`✅ Adding default sale field to "${data.name || productId}"`);
    }

    // Add update to batch
    const productRef = doc(db, 'products', productId);
    batch.update(productRef, { sale: saleInfo });
    operationCount++;
    updatedCount++;

    // Commit batch if we hit the limit
    if (operationCount >= BATCH_SIZE) {
      console.log(`\n📤 Committing batch of ${operationCount} updates...`);
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    }
  }

  // Commit any remaining operations
  if (operationCount > 0) {
    console.log(`\n📤 Committing final batch of ${operationCount} updates...`);
    await batch.commit();
  }

  console.log('\n' + '='.repeat(50));
  console.log('✨ Migration completed successfully!');
  console.log('='.repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   - Total products: ${snapshot.docs.length}`);
  console.log(`   - Updated: ${updatedCount}`);
  console.log(`   - Skipped (already had sale field): ${skippedCount}`);
  console.log(`   - Marked on sale: ${saleCount}`);
}

// Run the migration
migrateSaleFields()
  .then(() => {
    console.log('\n👋 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
