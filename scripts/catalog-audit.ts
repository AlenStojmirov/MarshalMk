/**
 * What each product is missing — READ ONLY.
 *
 *   npm run catalog:audit
 *
 * EPIC 9. A customer buying clothes online needs what the shop floor gives for
 * free: what it is made of, what colour it really is, and whether it will fit.
 * Measured 2026-09-26, of 291 products in stock: 210 had no description, the
 * other 81 carried only a fibre list typed ~30 different ways, none had a
 * colour and none had a single measurement. This turns that into a work list.
 *
 * Per product: photos, composition, colour, fit, size advice, measurements.
 * "Ready" means all of them — the computed form of `content_status` (BACKLOG 2.5).
 *
 * Order of work
 * -------------
 *   1 LIVE        on the storefront now — every gap is costing sales today
 *   2 IN SEASON   hidden, its season is opening or open (AW in autumn)
 *   3 ALL YEAR    hidden, no weather window
 *   4 WAITS       hidden, its season is closing or shut — SS in autumn waits
 *                 for February, as D-010 already says for photography
 *   5 CLEARANCE   hidden, never sold, here over CLEARANCE_AGE_DAYS — A2,
 *                 not worth photographing or measuring
 * Within a tier: stock value at cost, largest first — the most capital per
 * hour of work.
 *
 * Reads `product_attributes` (migration 010, Task 9.1) when it exists; before
 * that everything structured reads as missing and the fibre list is looked for
 * in the description instead, which is what Task 9.3 will parse.
 *
 * Writes nothing to the database. Output: stdout and docs/catalog-audit-<date>.md.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { NON_MERCHANDISE, phaseOf, type SeasonPhase } from '../src/lib/seasons';
import { getCategoryLabel } from '../src/lib/product-display';

/** Front, back, fabric detail, composition label. */
const FULL_PHOTO_SET = 4;
/** Hidden and never sold after this long → clearance, not content work. */
const CLEARANCE_AGE_DAYS = 90;
/** Nothing to measure: one size, or not a garment. */
const NO_MEASUREMENTS = new Set(['accessories', 'belts', 'vaucer']);

const fmt = (n: number) => n.toLocaleString('mk-MK', { maximumFractionDigits: 0 });

interface Row {
  id: string;
  name: string | null;
  category: string | null;
  description: string | null;
  color: string | null;
  price: number | string;
  purchase_price: number | string | null;
  image_url: string | null;
  images: string[] | null;
  is_visible: boolean;
  sizes: Array<{ size: string; quantity: number }> | null;
  sold: Array<{ price?: number | string }> | null;
  first_received_at: string | null;
  created_at: string | null;
}

/** Loose on purpose: the columns are fixed by Task 9.1, this only reads them. */
interface Attributes {
  product_id: string;
  composition?: Array<{ fiber: string; pct: number }> | null;
  color?: string | null;
  fit?: string | null;
  size_advice?: string | null;
  measurements?: Record<string, Record<string, number>> | null;
}

type Tier = 1 | 2 | 3 | 4 | 5;
const TIER_LABEL: Record<Tier, string> = {
  1: 'На сајтот',
  2: 'Скриен · сезоната се отвора',
  3: 'Скриен · целогодишно',
  4: 'Скриен · чека сезона',
  5: 'Расчистување',
};
const IN_SEASON: SeasonPhase[] = ['preseason', 'inseason'];

type CompositionState = 'structured' | 'in-description' | 'missing';

/** Local files override the stored url (product-images.ts), so count those first. */
function localImageCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  try {
    for (const file of readdirSync(join(process.cwd(), 'public', 'images', 'products'))) {
      const ext = extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext)) continue;
      const m = /^(.+)-(\d+)$/.exec(file.slice(0, -ext.length));
      if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  } catch {
    // no directory — every product counts as having no local image
  }
  return counts;
}

const isUsableUrl = (u: string | null | undefined) =>
  !!u && /^(https?:\/\/|\/)/.test(u.trim());

async function loadAttributes(sb: SupabaseClient): Promise<Map<string, Attributes> | null> {
  const { data, error } = await sb.from('product_attributes').select('*');
  if (error) return null; // migration 010 not run yet
  return new Map((data as Attributes[]).map((a) => [a.product_id, a]));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from('products_costed')
      .select('id, name, category, description, color, price, purchase_price, image_url, images, is_visible, sizes, sold, first_received_at, created_at')
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  const attrs = await loadAttributes(sb);
  const localImages = localImageCounts();
  const now = Date.now();

  const inStock = (r: Row) => (r.sizes ?? []).filter((s) => Number(s.quantity) >= 1);
  const products = rows.filter((r) => !NON_MERCHANDISE.has(r.category ?? '') && inStock(r).length > 0);

  const audited = products.map((r) => {
    const a = attrs?.get(r.id);
    const category = r.category ?? '';
    const sizes = inStock(r);
    const units = sizes.reduce((n, s) => n + Number(s.quantity), 0);
    const cost = r.purchase_price === null ? 0 : Number(r.purchase_price);

    const stored = [r.image_url, ...(r.images ?? [])].filter(isUsableUrl);
    const photos = localImages.get(r.id) ?? new Set(stored).size;

    const composition: CompositionState = a?.composition?.length
      ? 'structured'
      : /\d+\s*%/.test(r.description ?? '') ? 'in-description' : 'missing';
    const color = !!(a?.color || r.color?.trim());
    const fit = !!a?.fit;
    const sizeAdvice = !!a?.size_advice;
    const needsMeasurements = !NO_MEASUREMENTS.has(category);
    // Only the sizes on the shelf need measuring (Task 9.5).
    const measured = !needsMeasurements || sizes.every((s) => {
      const m = a?.measurements?.[s.size];
      return !!m && Object.keys(m).length > 0;
    });

    const ever = (r.sold ?? []).filter((s) => Number(s.price) > 0).length;
    const since = Date.parse(r.first_received_at ?? r.created_at ?? '') || now;
    const ageDays = (now - since) / 86_400_000;
    const phase = phaseOf(category);

    let tier: Tier;
    if (r.is_visible) tier = 1;
    else if (ever === 0 && ageDays > CLEARANCE_AGE_DAYS) tier = 5;
    else if (phase === 'always') tier = 3;
    else if (IN_SEASON.includes(phase)) tier = 2;
    else tier = 4;

    const missing: string[] = [];
    if (photos === 0) missing.push('слика');
    else if (photos < FULL_PHOTO_SET) missing.push(`слики ${photos}/${FULL_PHOTO_SET}`);
    if (composition !== 'structured') missing.push(composition === 'in-description' ? 'состав (во опис)' : 'состав');
    if (!color) missing.push('боја');
    if (!fit) missing.push('крој');
    if (!sizeAdvice) missing.push('совет за големина');
    if (!measured) missing.push('мерки');

    return {
      r, category, units, costValue: units * cost, photos, composition, color, fit,
      sizeAdvice, needsMeasurements, measured, tier, missing, ready: missing.length === 0,
    };
  });

  audited.sort((x, y) => x.tier - y.tier || y.costValue - x.costValue);

  const out: string[] = [];
  const say = (l = '') => { out.push(l); console.log(l); };
  const today = new Date(now).toISOString().slice(0, 10);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  const count = (list: typeof audited, f: (x: (typeof audited)[number]) => boolean) => list.filter(f).length;

  say(`# Каталог — што фали по производ · ${today}`);
  say();
  say(`Производи со залиха: **${audited.length}**. Read-only.`);
  if (!attrs) say('`product_attributes` (миграција 010) уште не постои — структурираните полиња се читаат како празни.');
  say();

  const n = audited.length;
  const withMeas = audited.filter((x) => x.needsMeasurements);
  say('## Колку фали');
  say();
  say('| Поле | Имаат | Фали |');
  say('|---|---|---|');
  say(`| Барем една слика | ${count(audited, (x) => x.photos > 0)} | ${pct(count(audited, (x) => x.photos === 0), n)} |`);
  say(`| Цел сет (${FULL_PHOTO_SET} слики) | ${count(audited, (x) => x.photos >= FULL_PHOTO_SET)} | ${pct(count(audited, (x) => x.photos < FULL_PHOTO_SET), n)} |`);
  say(`| Состав, структуриран | ${count(audited, (x) => x.composition === 'structured')} | ${pct(count(audited, (x) => x.composition !== 'structured'), n)} |`);
  say(`| └ состав само во опис (за парсерот, 9.3) | ${count(audited, (x) => x.composition === 'in-description')} | |`);
  say(`| Боја | ${count(audited, (x) => x.color)} | ${pct(count(audited, (x) => !x.color), n)} |`);
  say(`| Крој | ${count(audited, (x) => x.fit)} | ${pct(count(audited, (x) => !x.fit), n)} |`);
  say(`| Совет за големина | ${count(audited, (x) => x.sizeAdvice)} | ${pct(count(audited, (x) => !x.sizeAdvice), n)} |`);
  say(`| Мерки (${withMeas.length} што се мерат) | ${count(withMeas, (x) => x.measured)} | ${pct(count(withMeas, (x) => !x.measured), withMeas.length)} |`);
  say(`| **Спремен** (сè од горе) | **${count(audited, (x) => x.ready)}** | |`);
  say();
  say('Сликите се бројат, аглите не: од име на фајл не се гледа што е напред, назад или етикета.');
  say();

  say('## Редослед на работа');
  say();
  say('| # | Ниво | Модели | Парчиња | Набавна вредност | Спремни |');
  say('|---|---|---|---|---|---|');
  for (const t of [1, 2, 3, 4, 5] as Tier[]) {
    const list = audited.filter((x) => x.tier === t);
    const value = list.reduce((s, x) => s + x.costValue, 0);
    const units = list.reduce((s, x) => s + x.units, 0);
    say(`| ${t} | ${TIER_LABEL[t]} | ${list.length} | ${units} | ${fmt(value)} ден. | ${count(list, (x) => x.ready)} |`);
  }
  say();
  say(`Ниво 4 чека сезона (летното во есен — D-010). Ниво 5 никогаш не се продало за ${CLEARANCE_AGE_DAYS}+ дена: расчистување (A2), не содржина.`);
  say();

  say('## По категорија');
  say();
  say('| Категорија | Модели | Без слика | Без состав | во опис | Без боја | Без мерки |');
  say('|---|---|---|---|---|---|---|');
  const byCat = new Map<string, typeof audited>();
  audited.forEach((x) => byCat.set(x.category, [...(byCat.get(x.category) ?? []), x]));
  [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([c, list]) => {
    const meas = list[0].needsMeasurements ? String(count(list, (x) => !x.measured)) : '—';
    say(`| ${getCategoryLabel(c)} \`${c}\` | ${list.length} | ${count(list, (x) => x.photos === 0)} | ${count(list, (x) => x.composition !== 'structured')} | ${count(list, (x) => x.composition === 'in-description')} | ${count(list, (x) => !x.color)} | ${meas} |`);
  });
  say();

  // Sizes named two ways split the size curve (Task 9.8). Listed so it is seen.
  const labels = new Map<string, number>();
  products.forEach((r) => inStock(r).forEach((s) => labels.set(s.size, (labels.get(s.size) ?? 0) + 1)));
  const odd = ['2XL', '3XL', '4XL', '5XL', '6XL', 'kolicina', 'количина'].filter((l) => labels.has(l));
  if (odd.length) {
    say('## Големини под второ име (9.8)');
    say();
    say(odd.map((l) => `\`${l}\` ${labels.get(l)}`).join(' · ') + ' — на залиха, по производ.');
    say();
  }

  say('## Сите производи, по редослед');
  say();
  say('| # | ID | Шифра | Категорија | Ниво | Парч. | Набавна | Слики | Фали |');
  say('|---|---|---|---|---|---|---|---|---|');
  audited.forEach((x, i) => {
    say(`| ${i + 1} | \`${x.r.id}\` | ${x.r.name ?? ''} | ${getCategoryLabel(x.category)} | ${x.tier} | ${x.units} | ${fmt(x.costValue)} | ${x.photos} | ${x.ready ? '✓ спремен' : x.missing.join(', ')} |`);
  });
  say();

  const dir = join(process.cwd(), 'docs');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `catalog-audit-${today}.md`);
  writeFileSync(path, out.join('\n') + '\n', 'utf8');
  console.log('='.repeat(60));
  console.log(`Зачувано во: docs/catalog-audit-${today}.md`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
