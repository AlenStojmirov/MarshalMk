import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getDatabase, Database } from 'firebase/database';

// Main Firebase configuration (marshalecom - for Firestore, Auth, Storage)
const mainFirebaseConfig: Record<string, string> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Inventory Firebase configuration (marshal-vin - for Realtime Database)
const inventoryFirebaseConfig: Record<string, string> = {
  apiKey: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID || "",
  databaseURL: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL || "",
  storageBucket: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID || ""
};

// Initialize main Firebase app
function getMainApp(): FirebaseApp {
  const existingApps = getApps();
  const mainApp = existingApps.find(app => app.name === '[DEFAULT]');
  if (mainApp) return mainApp;
  return initializeApp(mainFirebaseConfig);
}

// Initialize inventory Firebase app (separate project)
function getInventoryApp(): FirebaseApp | null {
  if (!isRealtimeDatabaseConfigured()) return null;

  const existingApps = getApps();
  const inventoryApp = existingApps.find(app => app.name === 'inventory');
  if (inventoryApp) return inventoryApp;

  return initializeApp(inventoryFirebaseConfig, 'inventory');
}

const app = getMainApp();

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Check if Inventory Realtime Database is configured
export function isRealtimeDatabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL;
  return Boolean(url && url.length > 0);
}

// Inventory Realtime Database - lazy initialization
let rtdb: Database | null = null;
export function getRealtimeDatabase(): Database | null {
  if (rtdb) return rtdb;

  const inventoryApp = getInventoryApp();
  if (inventoryApp) {
    rtdb = getDatabase(inventoryApp);
  }
  return rtdb;
}

export default app;
