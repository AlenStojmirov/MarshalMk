/* eslint-disable no-console */
/**
 * Which migrations have actually landed.
 *
 * DDL cannot go through PostgREST, so migrations are pasted into the Supabase
 * SQL editor by hand. This tells you what the database currently has, so
 * "did that one run?" is a question with an answer rather than a guess.
 *
 *   npm run migrations:check
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A table probe: select a column that only exists once the migration ran. */
const CHECKS: Array<{ migration: string; label: string; table: string; column: string }> = [
  { migration: '001', label: 'purchase_price на products',        table: 'products',            column: 'purchase_price' },
  { migration: '002', label: 'sales_ledger',                      table: 'sales_ledger',        column: 'unit_list_price' },
  { migration: '003', label: 'operating_expenses',                table: 'operating_expenses',  column: 'is_monthly_total' },
  { migration: '004', label: 'suppliers / purchases',             table: 'purchases',           column: 'received_at' },
  { migration: '004', label: 'first_received_at на products',     table: 'products',            column: 'first_received_at' },
  { migration: '005', label: 'first_received_estimated',          table: 'products',            column: 'first_received_estimated' },
  { migration: '005', label: 'inventory_snapshots',               table: 'inventory_snapshots', column: 'cost_value' },
  { migration: '006', label: 'исход на нарачка (outcome)',        table: 'orders',              column: 'outcome' },
  { migration: '006', label: 'marketing_optout',                  table: 'marketing_optout',    column: 'phone_norm' },
  { migration: '006', label: 'no_reorder на products',            table: 'products',            column: 'no_reorder' },
  { migration: '007', label: 'products_public (јавен поглед)',    table: 'products_public',     column: 'sizes' },
  { migration: '008', label: 'product_costs (набавна, само админ)', table: 'product_costs',      column: 'purchase_price' },
  { migration: '008', label: 'products_costed (поглед за админ)', table: 'products_costed',     column: 'purchase_price' },
  { migration: '010', label: 'product_attributes (состав, мерки)', table: 'product_attributes', column: 'size_advice' },
];

async function probe(sb: SupabaseClient, table: string, column: string) {
  const { error } = await sb.from(table).select(column).limit(1);
  return error ? error.message : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let missing = 0;
  const missingMigrations = new Set<string>();
  console.log('МИГРАЦИИ');
  for (const c of CHECKS) {
    const err = await probe(sb, c.table, c.column);
    if (err) {
      missing += 1;
      missingMigrations.add(c.migration);
    }
    console.log(
      '  ' + (err ? 'НЕМА' : 'ИМА ') + '  ' + c.migration + '  ' + c.label.padEnd(34) +
      (err ? '· ' + err.split('.')[0] : '')
    );
  }

  // 009 is policies and functions, which a column probe cannot see. The refund
  // function is called for a product that does not exist: it matches nothing
  // and removes nothing, but only answers once the migration has run.
  {
    const { error } = await sb.rpc('ledger_refund_one', {
      p_product_id: '__migration_probe__', p_size: null, p_unit_price: 0, p_day: '2000-01-01',
    });
    if (error) {
      missing += 1;
      missingMigrations.add('009');
    }
    console.log('  ' + (error ? 'НЕМА' : 'ИМА ') + '  009  ' + 'права по улога (функции за ledger)'.padEnd(34) +
      (error ? '· ' + error.message.split('.')[0] : ''));
  }

  // 011 is two read policies and the function they share. The policies cannot
  // be seen from here; the function can: it answers (false, for the service
  // role) only once the migration has run.
  {
    const { error } = await sb.rpc('is_marketing');
    if (error) {
      missing += 1;
      missingMigrations.add('011');
    }
    console.log('  ' + (error ? 'НЕМА' : 'ИМА ') + '  011  ' + 'улога маркетинг (само чита каталог)'.padEnd(34) +
      (error ? '· ' + error.message.split('.')[0] : ''));
  }

  // 007 is about what anon can NOT do, which the service role cannot see.
  // Probe with the key that ships in the storefront: it must not reach the
  // purchase price.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.from('products').select('purchase_price').limit(1);
    const leaks = !error && (data?.length ?? 0) > 0;
    if (leaks) {
      missing += 1;
      missingMigrations.add('007');
    }
    console.log('  ' + (leaks ? 'НЕМА' : 'ИМА ') + '  007  ' + 'anon не ја чита набавната цена'.padEnd(34) +
      (leaks ? '· јавниот клуч сè уште чита products' : ''));
  }
  console.log('');
  if (missing === 0) {
    console.log('Сите миграции се пуштени.');
  } else {
    console.log(missing + ' проверки не поминаа.');
    // Name the actual files: the message used to point at a RUN_ALL_PENDING.sql
    // that never existed.
    const files = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
      .filter((f) => [...missingMigrations].some((m) => f.startsWith(m + '_')))
      .sort();
    console.log('Пушти ги во Supabase SQL Editor, по ред:');
    for (const f of files) console.log('  supabase/migrations/' + f);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('\nFailed:', err); process.exit(1); });
