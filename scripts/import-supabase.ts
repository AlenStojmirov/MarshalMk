/* eslint-disable no-console */
/**
 * Import the JSON dumps produced by `export-firestore.ts` into Supabase.
 *
 * Usage (from project root):
 *   npm run migrate:import
 *
 * Reads:  migration-data/products.json
 *         migration-data/orders.json
 *         NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 *
 * Notes:
 *  - Uses the service-role key so it bypasses RLS.
 *  - Upserts by primary key, so it is safe to re-run.
 *  - Maps Firestore camelCase fields to Postgres snake_case columns.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IN_DIR = join(process.cwd(), 'migration-data');
const BATCH = 200;

function readJson<T>(file: string): T[] {
  const path = join(IN_DIR, file);
  if (!existsSync(path)) {
    console.warn(`(skip) ${path} not found`);
    return [];
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T[];
}

function toIso(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------
interface FirestoreProduct {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
  images?: string[];
  stock?: number;
  sizes?: unknown;
  sold?: unknown;
  brand?: string;
  color?: string;
  featured?: boolean;
  isVisible?: boolean;
  sale?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

function mapProduct(p: FirestoreProduct) {
  return {
    id: p.id,
    name: p.name ?? '',
    description: p.description ?? '',
    price: p.price ?? 0,
    category: p.category ?? '',
    image_url: p.imageUrl ?? '',
    images: p.images ?? [],
    stock: p.stock ?? 0,
    sizes: p.sizes ?? [],
    sold: p.sold ?? [],
    brand: p.brand ?? null,
    color: p.color ?? null,
    featured: p.featured ?? false,
    is_visible: p.isVisible !== false,
    sale: p.sale ?? null,
    created_at: toIso(p.createdAt),
    updated_at: toIso(p.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------
interface FirestoreOrder {
  id: string;
  orderNumber?: string;
  customer?: unknown;
  items?: unknown;
  subtotal?: number;
  shipping?: number;
  total?: number;
  status?: string;
  paymentMethod?: string;
  createdAt?: string;
  updatedAt?: string;
}

function mapOrder(o: FirestoreOrder) {
  // Drop the Firestore string id and let Supabase generate a uuid.
  // order_number is the stable business identifier.
  return {
    order_number: o.orderNumber ?? `ORD-MIGRATED-${o.id}`,
    customer: o.customer ?? {},
    items: o.items ?? [],
    subtotal: o.subtotal ?? 0,
    shipping: o.shipping ?? 0,
    total: o.total ?? o.subtotal ?? 0,
    status: o.status ?? 'pending',
    payment_method: o.paymentMethod ?? 'cash_on_delivery',
    created_at: toIso(o.createdAt),
    updated_at: toIso(o.updatedAt),
  };
}

async function upsertBatched(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn: string
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(slice as any, { onConflict: conflictColumn });
    if (error) {
      console.error(`Error upserting ${table} batch starting at ${i}:`, error);
      process.exit(1);
    }
    console.log(`  ${table}: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  const products = readJson<FirestoreProduct>('products.json').map(mapProduct);
  console.log(`Importing ${products.length} products…`);
  await upsertBatched('products', products, 'id');

  const orders = readJson<FirestoreOrder>('orders.json').map(mapOrder);
  console.log(`Importing ${orders.length} orders…`);
  await upsertBatched('orders', orders, 'order_number');

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
