'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

// Inventory Firebase configuration (marshal-vin Realtime Database)
// We keep this single Firebase project for read-only inventory sync.
// All other persistence (products, orders, auth, storage) lives in Supabase.
const inventoryFirebaseConfig: Record<string, string> = {
  apiKey: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID || '',
  databaseURL: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL || '',
  storageBucket: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID || '',
};

export function isRealtimeDatabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL;
  return Boolean(url && url.length > 0);
}

function getInventoryApp(): FirebaseApp | null {
  if (!isRealtimeDatabaseConfigured()) return null;

  const existingApps = getApps();
  const inventoryApp = existingApps.find((app) => app.name === 'inventory');
  if (inventoryApp) return inventoryApp;

  return initializeApp(inventoryFirebaseConfig, 'inventory');
}

let rtdb: Database | null = null;
export function getRealtimeDatabase(): Database | null {
  if (rtdb) return rtdb;
  const inventoryApp = getInventoryApp();
  if (inventoryApp) {
    rtdb = getDatabase(inventoryApp);
  }
  return rtdb;
}
