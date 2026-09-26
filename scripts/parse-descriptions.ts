/**
 * Old descriptions → product_attributes (Task 9.3).
 *
 *   npm run attributes:parse          # preview, writes nothing
 *   npm run attributes:parse apply    # writes
 *
 * Reads every product's `description` with parseDescription() and files the
 * composition, cut, leg length and "reversible" in `product_attributes`
 * (migration 010).
 *
 * Never overwrites a person: a field that already has a value in
 * product_attributes is left as it is, and only empty ones are filled. Run it
 * twice and the second run changes nothing.
 *
 * `products.description` is not touched. It stays until Task 9.10 decides.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { parseDescription, type ParsedDescription } from '../src/lib/parse-description';
import { formatComposition, FITS } from '../src/lib/attributes';
import { PRODUCT_ATTRIBUTES, type ProductAttributesRow } from '../src/lib/db-mappers';

interface Row {
  id: string;
  name: string | null;
  category: string | null;
  description: string | null;
  sizes: Array<{ quantity: number }> | null;
}

async function main() {
  const apply = process.argv.includes('apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('products').select('id, name, category, description, sizes').range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const { data: existingRows, error: attrError } = await sb.from(PRODUCT_ATTRIBUTES).select('*');
  if (attrError) {
    throw new Error(`product_attributes не е достапна (${attrError.message}). Пушти ја миграцијата 010.`);
  }
  const existing = new Map((existingRows as ProductAttributesRow[]).map((a) => [a.product_id, a]));

  const withText = rows.filter((r) => r.description?.trim());
  const parsed = withText.map((r) => ({ r, p: parseDescription(r.description) }));
  const inStock = (r: Row) => (r.sizes ?? []).some((s) => Number(s.quantity) >= 1);

  // Only what is empty on the stored row; a person's entry always wins.
  const plan = parsed.flatMap(({ r, p }) => {
    const cur = existing.get(r.id);
    const patch: Partial<ProductAttributesRow> = {};
    if (p.composition.length && !(cur?.composition?.length)) patch.composition = p.composition;
    if (p.fit && !cur?.fit) patch.fit = p.fit;
    const details = { ...(cur?.details ?? {}) };
    let detailsChanged = false;
    for (const [k, v] of Object.entries(p.details)) {
      if (details[k] === undefined) { details[k] = v; detailsChanged = true; }
    }
    if (detailsChanged) patch.details = details;
    return Object.keys(patch).length ? [{ r, p, patch, isNew: !cur }] : [];
  });

  const count = (f: (x: { r: Row; p: ParsedDescription }) => boolean) => parsed.filter(f).length;
  console.log(`Производи со опис: ${withText.length} (од ${rows.length}); со залиха: ${withText.filter(inStock).length}`);
  console.log(`  состав прочитан:        ${count((x) => x.p.composition.length > 0)}`);
  console.log(`  состав со грешка:       ${count((x) => x.p.compositionErrors.length > 0)}`);
  console.log(`  крој:                   ${count((x) => !!x.p.fit)}`);
  console.log(`  должина на ногавица:    ${count((x) => !!x.p.details.legLength)}`);
  console.log(`  двостран:               ${count((x) => !!x.p.details.reversible)}`);
  console.log(`  целосно прочитани:      ${count((x) => x.p.unparsed.length === 0 && x.p.compositionErrors.length === 0)}`);
  console.log('');

  const problems = parsed.filter((x) => x.p.unparsed.length || x.p.compositionErrors.length);
  if (problems.length) {
    console.log('Не е прочитано — за рачен внес:');
    for (const { r, p } of problems) {
      const why = [...p.compositionErrors, ...p.unparsed.map((u) => `„${u}“`)].join('; ');
      console.log(`  ${r.id.padEnd(28)} ${(r.name ?? '').padEnd(8)} ${inStock(r) ? '' : '(нема залиха) '}${why}`);
    }
    console.log('');
  }

  console.log(`За запишување: ${plan.length} производи (${plan.filter((x) => x.isNew).length} нови редови)`);
  for (const { r, patch } of plan.slice(0, 15)) {
    const bits = [
      patch.composition ? formatComposition(patch.composition) : '',
      patch.fit ? `крој: ${FITS[patch.fit]?.mk ?? patch.fit}` : '',
      patch.details?.legLength ? `должина: ${patch.details.legLength}` : '',
      patch.details?.reversible ? 'двостран' : '',
    ].filter(Boolean).join(' · ');
    console.log(`  ${r.id.padEnd(28)} ${bits}`);
  }
  if (plan.length > 15) console.log(`  … и уште ${plan.length - 15}`);
  console.log('');

  if (!apply) {
    console.log('Преглед — ништо не е запишано. `npm run attributes:parse apply` запишува.');
    return;
  }

  let written = 0;
  for (const { r, patch, isNew } of plan) {
    const q = isNew
      ? sb.from(PRODUCT_ATTRIBUTES).insert({ product_id: r.id, ...patch })
      : sb.from(PRODUCT_ATTRIBUTES).update(patch).eq('product_id', r.id);
    const { error } = await q;
    if (error) console.error(`  ${r.id}: ${error.message}`);
    else written += 1;
  }
  console.log(`Запишано: ${written} од ${plan.length}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
