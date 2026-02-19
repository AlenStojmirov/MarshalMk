/**
 * Script to mark specific products as ON SALE in Firestore
 *
 * Usage:
 *   npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>
 *   npx tsx scripts/set-products-on-sale.ts product123 25
 *
 * Or modify PRODUCTS_TO_UPDATE array below and run without arguments
 */

import { config } from 'dotenv';
// Load environment variables from .env.local
config({ path: '.env.local' });

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Define products to put on sale here (if not using CLI arguments)
// Format: { id: 'product-id', percentageOff: 20 }
const PRODUCTS_TO_UPDATE: Array<{ id: string; percentageOff: number }> = [
  // Add your products here:
  // { id: 'SKU-001', percentageOff: 20 },
  // { id: 'SKU-002', percentageOff: 30 },
];

interface ProductData {
  name?: string;
  price?: number;
  [key: string]: unknown;
}

async function setProductOnSale(
  db: ReturnType<typeof getFirestore>,
  productId: string,
  percentageOff: number
) {
  const productRef = doc(db, 'products', productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.log(`❌ Product "${productId}" not found`);
    return false;
  }

  const data = productSnap.data() as ProductData;
  const price = data.price || 0;
  const salePrice = Math.round((price * (1 - percentageOff / 100)) * 100) / 100;

  await updateDoc(productRef, {
    sale: {
      isActive: true,
      salePrice,
      percentageOff
    }
  });

  console.log(`✅ "${data.name || productId}" is now ON SALE!`);
  console.log(`   Original: ${price} ден. → Sale: ${salePrice} ден. (${percentageOff}% off)`);
  return true;
}

async function removeProductFromSale(
  db: ReturnType<typeof getFirestore>,
  productId: string
) {
  const productRef = doc(db, 'products', productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.log(`❌ Product "${productId}" not found`);
    return false;
  }

  const data = productSnap.data() as ProductData;

  await updateDoc(productRef, {
    sale: {
      isActive: false,
      salePrice: 0,
      percentageOff: 0
    }
  });

  console.log(`✅ "${data.name || productId}" removed from sale`);
  return true;
}

async function listProducts(db: ReturnType<typeof getFirestore>) {
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);

  console.log('\n📦 Available products:\n');
  console.log('ID'.padEnd(25) + 'Name'.padEnd(40) + 'Price'.padEnd(10) + 'On Sale');
  console.log('-'.repeat(85));

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data() as ProductData & { sale?: { isActive: boolean } };
    const onSale = data.sale?.isActive ? '🏷️ YES' : 'No';
    console.log(
      docSnap.id.padEnd(25) +
      (data.name || 'N/A').substring(0, 38).padEnd(40) +
      `${data.price || 0} ден.`.padEnd(10) +
      onSale
    );
  });
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const args = process.argv.slice(2);

  // Handle CLI arguments
  if (args.length > 0) {
    const command = args[0];

    if (command === 'list') {
      await listProducts(db);
      return;
    }

    if (command === 'remove' && args[1]) {
      await removeProductFromSale(db, args[1]);
      return;
    }

    // Assume it's: <productId> <percentageOff>
    const productId = args[0];
    const percentageOff = parseInt(args[1], 10);

    if (!productId || isNaN(percentageOff)) {
      console.log('Usage:');
      console.log('  npx tsx scripts/set-products-on-sale.ts list');
      console.log('  npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>');
      console.log('  npx tsx scripts/set-products-on-sale.ts remove <productId>');
      console.log('\nExamples:');
      console.log('  npx tsx scripts/set-products-on-sale.ts SKU-001 25');
      console.log('  npx tsx scripts/set-products-on-sale.ts remove SKU-001');
      return;
    }

    await setProductOnSale(db, productId, percentageOff);
    return;
  }

  // No CLI args - use PRODUCTS_TO_UPDATE array
  if (PRODUCTS_TO_UPDATE.length === 0) {
    console.log('No products specified in PRODUCTS_TO_UPDATE array.');
    console.log('\nUsage:');
    console.log('  1. Add products to PRODUCTS_TO_UPDATE array in this script');
    console.log('  2. Or use CLI: npx tsx scripts/set-products-on-sale.ts <productId> <percentageOff>');
    console.log('\nTo see available products:');
    console.log('  npx tsx scripts/set-products-on-sale.ts list');
    return;
  }

  console.log(`🚀 Setting ${PRODUCTS_TO_UPDATE.length} products on sale...\n`);

  for (const product of PRODUCTS_TO_UPDATE) {
    await setProductOnSale(db, product.id, product.percentageOff);
  }

  console.log('\n✨ Done!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
