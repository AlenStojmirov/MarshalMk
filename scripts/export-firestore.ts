/* eslint-disable no-console */
/**
 * Export all Firestore data (products + orders) to local JSON files
 * so we can later import them into Supabase.
 *
 * Usage (from project root):
 *   npm run migrate:export
 *
 * Reads:  FIREBASE_SERVICE_ACCOUNT_KEY from .env.local
 * Writes: migration-data/products.json
 *         migration-data/orders.json
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Ensure .env.local is loaded (default dotenv reads .env)
loadEnv({ path: '.env.local' });

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in .env.local');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
}
const db = getFirestore();

const OUT_DIR = join(process.cwd(), 'migration-data');
mkdirSync(OUT_DIR, { recursive: true });

function normaliseValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normaliseValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseValue(v);
    }
    return out;
  }
  return value;
}

async function exportCollection(name: string): Promise<unknown[]> {
  console.log(`Exporting ${name}…`);
  const snap = await db.collection(name).get();
  const rows = snap.docs.map((d) => ({
    id: d.id,
    ...(normaliseValue(d.data()) as Record<string, unknown>),
  }));
  const file = join(OUT_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`  -> ${rows.length} docs written to ${file}`);
  return rows;
}

async function main() {
  await exportCollection('products');
  await exportCollection('orders');
  console.log('\nDone. Review the JSON files in migration-data/ before importing.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
