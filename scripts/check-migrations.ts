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

/** A table probe: select a column that only exists once the migration ran. */
const CHECKS: Array<{ migration: string; label: string; table: string; column: string }> = [
  { migration: '001', label: 'purchase_price на products',        table: 'products',            column: 'purchase_price' },
  { migration: '002', label: 'sales_ledger',                      table: 'sales_ledger',        column: 'unit_list_price' },
  { migration: '003', label: 'operating_expenses',                table: 'operating_expenses',  column: 'is_monthly_total' },
  { migration: '004', label: 'suppliers / purchases',             table: 'purchases',           column: 'received_at' },
  { migration: '004', label: 'first_received_at на products',     table: 'products',            column: 'first_received_at' },
  { migration: '005', label: 'first_received_estimated',          table: 'products',            column: 'first_received_estimated' },
  { migration: '005', label: 'inventory_snapshots',               table: 'inventory_snapshots', column: 'cost_value' },
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
  console.log('МИГРАЦИИ');
  for (const c of CHECKS) {
    const err = await probe(sb, c.table, c.column);
    if (err) missing += 1;
    console.log(
      '  ' + (err ? 'НЕМА' : 'ИМА ') + '  ' + c.migration + '  ' + c.label.padEnd(34) +
      (err ? '· ' + err.split('.')[0] : '')
    );
  }

  console.log('');
  if (missing === 0) {
    console.log('Сите миграции се пуштени.');
  } else {
    console.log(missing + ' проверки не поминаа.');
    console.log('Пушти supabase/migrations/RUN_ALL_PENDING.sql во Supabase SQL Editor.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('\nFailed:', err); process.exit(1); });
