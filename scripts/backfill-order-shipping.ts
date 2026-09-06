/* eslint-disable no-console */
/**
 * Task 0.4 — put the shipping that was actually collected back into the record.
 *
 *   npm run orders:shipping         # show what would change, write nothing
 *   npm run orders:shipping apply   # write
 *
 * Checkout has always charged 170 ден. below the 3.000 threshold, but until
 * D-006 (2026-08-20) the API stored `shipping: 0` and `total: subtotal`. The
 * money changed hands at the door; only the row is wrong. This closes that gap
 * on the rows written before the fix.
 *
 * What this does NOT do is apply D-006 backwards. Above the threshold that
 * decision reduces the *item prices* to absorb the courier fee, and rewriting
 * what a product sold for months after the fact would corrupt the one number
 * every margin report is built on. Such orders are listed and left alone.
 *
 * Nothing here changes profit. Below the threshold the 170 is collected and
 * handed straight to the courier — it nets to zero. What it changes is the
 * record of what was collected, which is the number a cash count is checked
 * against.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { SHIPPING_CONFIG, getShippingCost } from '../src/config/shipping';

const APPLY = process.argv[2] === 'apply';
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  items: Array<{ price: number | string; quantity: number | string }>;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Недостасуваат NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY во .env.local');
    process.exit(1);
  }
  const db = createClient(url, key);

  const { data, error } = await db
    .from('orders')
    .select('id, order_number, created_at, items, subtotal, shipping, total')
    .order('created_at');
  if (error) throw error;

  const orders = (data ?? []) as OrderRow[];
  console.log(APPLY ? 'ПОШТАРИНА — запишува\n' : 'ПОШТАРИНА — само преглед, ништо не се запишува\n');
  console.log(`Нарачки: ${orders.length}`);
  console.log(
    `Праг за бесплатна достава: ${fmt(SHIPPING_CONFIG.freeShippingThreshold)} ден. · ` +
    `поштарина: ${fmt(SHIPPING_CONFIG.shippingCost)} ден.\n`
  );

  const fix: Array<{ o: OrderRow; gross: number; shipping: number; total: number }> = [];
  const manual: OrderRow[] = [];
  const ok: OrderRow[] = [];
  const mismatched: Array<{ o: OrderRow; gross: number }> = [];

  for (const o of orders) {
    const gross = round2(
      (o.items ?? []).reduce((a, i) => a + num(i.price) * num(i.quantity), 0)
    );

    if (num(o.shipping) !== 0) {
      ok.push(o);
      continue;
    }

    // A row written by the current API below the threshold always carries 170,
    // so `shipping = 0` together with a below-threshold basket can only be a
    // pre-D-006 row. Item prices were never reduced, so the stored subtotal is
    // the gross — and if it is not, something else is wrong and it is not this
    // script's business to guess.
    if (Math.abs(gross - num(o.subtotal)) > 1) {
      mismatched.push({ o, gross });
      continue;
    }

    const customerShipping = getShippingCost(gross);
    if (customerShipping === 0) {
      manual.push(o);
      continue;
    }

    fix.push({ o, gross, shipping: customerShipping, total: round2(gross + customerShipping) });
  }

  if (ok.length > 0) {
    console.log(`✓ ${ok.length} нарачки веќе имаат поштарина запишана — недопрени.\n`);
  }

  if (mismatched.length > 0) {
    console.log('⚠  Ставките не се собираат во `subtotal` — прескокнати, бараат рачен поглед:');
    for (const { o, gross } of mismatched) {
      console.log(
        `   ${o.order_number}  ставки=${fmt(gross)}  subtotal=${fmt(num(o.subtotal))}  ` +
        `total=${fmt(num(o.total))}`
      );
    }
    console.log('');
  }

  if (manual.length > 0) {
    console.log(
      `⚠  ${manual.length} нарачки над прагот со \`shipping = 0\`. Тука поштарината ја плати` +
      ` продавницата, и D-006 бара одбивање од цените на ставките.`
    );
    console.log('   Тоа не се прави наназад — би ја смениле цената по која производот е продаден.');
    for (const o of manual) {
      console.log(`   ${o.order_number}  ${String(o.created_at).slice(0, 10)}  total=${fmt(num(o.total))}`);
    }
    console.log('');
  }

  if (fix.length === 0) {
    console.log('Нема што да се поправи.');
    return;
  }

  console.log('За поправка (купувачот платил поштарина на врата):\n');
  console.log('   Нарачка              Датум        Производи    Поштарина      Total: сега → точно');
  for (const f of fix) {
    console.log(
      `   ${f.o.order_number.padEnd(20)} ${String(f.o.created_at).slice(0, 10)}   ` +
      `${fmt(f.gross).padStart(8)}    ${fmt(f.shipping).padStart(6)}      ` +
      `${fmt(num(f.o.total)).padStart(6)} → ${fmt(f.total)}`
    );
  }

  const added = fix.reduce((a, f) => a + f.shipping, 0);
  console.log('');
  console.log(`Вкупно ненаплатено во евиденција: ${fmt(added)} ден. низ ${fix.length} нарачки.`);
  console.log('Тоа е пари што поминале низ каса и веднаш заминале кај курирот — профитот');
  console.log('не се менува, точноста на записот се менува.\n');

  if (!APPLY) {
    console.log('Ништо не е запишано. Пушти со `apply`.');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const f of fix) {
    const { error: e } = await db
      .from('orders')
      .update({ shipping: f.shipping, total: f.total })
      .eq('id', f.o.id)
      .eq('shipping', 0); // compare-and-set: never overwrite a row fixed meanwhile
    if (e) {
      console.error(`   ✗ ${f.o.order_number}: ${e.message}`);
      failed += 1;
    } else {
      done += 1;
    }
  }

  console.log(`Запишани: ${done}${failed ? ` · неуспешни: ${failed}` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
