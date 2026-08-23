/* eslint-disable no-console */
/**
 * What to publish next — READ ONLY.
 *
 *   npm run publish:candidates
 *
 * 61% of the stock capital has never been on the storefront (docs/TURNAROUND.md,
 * action A3). "Photograph 207 products" is not a work list, so this splits them
 * into buckets that each imply a different action, and ranks each by what it
 * would actually return.
 *
 * Buckets
 * -------
 *   PUBLISH NOW   hidden, in stock, already has a usable image → flip the toggle
 *   NEEDS PHOTO   hidden, in stock, sells, but no image → photography queue
 *   CLEARANCE     hidden, in stock, never sold → A2, not worth photographing
 *
 * Ranking is tied-up retail value weighted by proven demand: a hidden product
 * that sold well in the shop is a safer bet online than a bigger pile that never
 * moved. Group GMROI only breaks ties, because it says how the category behaves,
 * not this product.
 *
 * Writes nothing. Output goes to stdout and docs/publish-candidates-<date>.md.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { readdirSync } from 'node:fs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { grossMargin } from '../src/lib/cost';

const fmt = (n: number, d = 0) =>
  n.toLocaleString('mk-MK', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 23 -> 9, same grouping the baseline report uses. */
const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло', oversizeTshirts: 'Маици & Поло', polos: 'Маици & Поло',
  shirts: 'Кошули', shortSleevedShirt: 'Кошули', blouses: 'Кошули',
  cardigans: 'Плетиво', turtleNecks: 'Плетиво', halfZips: 'Плетиво',
  hoodies: 'Дуксери', fullZips: 'Дуксери',
  jeans: 'Фармерки', shortsJeans: 'Фармерки',
  pants: 'Панталони', cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили', coats: 'Јакни & Мантили', vests: 'Јакни & Мантили',
  suits: 'Свечено', blazers: 'Свечено', suitJackets: 'Свечено',
  belts: 'Аксесоари', accessories: 'Аксесоари', vaucer: 'Аксесоари',
};
const NON_MERCHANDISE = new Set(['vaucer']);
const groupOf = (c: string) => CATEGORY_GROUPS[c] ?? c ?? '—';

interface Row {
  id: string;
  name: string | null;
  category: string | null;
  price: number | string;
  purchase_price: number | string | null;
  image_url: string | null;
  images: string[] | null;
  is_visible: boolean;
  sizes: Array<{ size: string; quantity: number }> | null;
  sold: Array<{ price?: number | string; soldDate?: string }> | null;
  sale: { isActive?: boolean; salePrice?: number } | null;
}

/** Local files override the stored url, so either counts as having an image. */
function localImageIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (const file of readdirSync(join(process.cwd(), 'public', 'images', 'products'))) {
      const ext = extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext)) continue;
      const m = /^(.+)-(\d+)$/.exec(file.slice(0, -ext.length));
      if (m) ids.add(m[1]);
    }
  } catch {
    // no directory yet — every product simply counts as having no local image
  }
  return ids;
}

function isUsableUrl(u: string | null): boolean {
  if (!u) return false;
  const s = u.trim();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from('products')
      .select('id, name, category, price, purchase_price, image_url, images, is_visible, sizes, sold, sale')
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  const localIds = localImageIds();
  const now = Date.now();
  const since = (days: number) => now - days * 86_400_000;

  const products = rows.filter((r) => !NON_MERCHANDISE.has(r.category ?? ''));

  const units = (r: Row) =>
    (r.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
  const effPrice = (r: Row) =>
    r.sale?.isActive && Number(r.sale.salePrice) > 0 ? Number(r.sale.salePrice) : Number(r.price);
  const cost = (r: Row) => (r.purchase_price === null ? undefined : Number(r.purchase_price));
  const soldIn = (r: Row, days: number) =>
    (r.sold ?? []).filter((s) => Number(s.price) > 0 && Date.parse(String(s.soldDate)) >= since(days)).length;
  const soldEver = (r: Row) => (r.sold ?? []).filter((s) => Number(s.price) > 0).length;
  const hasImage = (r: Row) =>
    localIds.has(r.id) || isUsableUrl(r.image_url) || (r.images ?? []).some(isUsableUrl);

  // group GMROI, used only as a tie-breaker
  const groupStats = new Map<string, { cost: number; profit: number }>();
  for (const r of products) {
    const g = groupOf(r.category ?? '');
    const st = groupStats.get(g) ?? { cost: 0, profit: 0 };
    const c = cost(r);
    if (c !== undefined) st.cost += units(r) * c;
    for (const s of r.sold ?? []) {
      const p = Number(s.price) || 0;
      if (p > 0 && Date.parse(String(s.soldDate)) >= since(365) && c !== undefined) {
        st.profit += p - c;
      }
    }
    groupStats.set(g, st);
  }
  const groupGmroi = (g: string) => {
    const st = groupStats.get(g);
    return st && st.cost > 0 ? st.profit / st.cost : 0;
  };

  interface Candidate {
    r: Row; u: number; retail: number; costValue: number;
    margin: number | null; s180: number; ever: number;
    group: string; score: number; image: boolean;
  }

  const hidden = products.filter((r) => r.is_visible === false && units(r) > 0);

  const candidates: Candidate[] = hidden.map((r) => {
    const u = units(r);
    const price = effPrice(r);
    const c = cost(r);
    const s180 = soldIn(r, 180);
    const ever = soldEver(r);
    const group = groupOf(r.category ?? '');
    // Tied-up retail value, weighted by proven demand. A product that has sold
    // recently is a safer bet online than a bigger pile that never moved.
    const demand = 1 + s180 * 1.5 + Math.min(ever, 10) * 0.3;
    return {
      r, u, retail: u * price, costValue: c === undefined ? 0 : u * c,
      margin: grossMargin(price, c), s180, ever, group,
      score: u * price * demand * (1 + groupGmroi(group) / 4),
      image: hasImage(r),
    };
  });

  const publishNow = candidates.filter((c) => c.image && c.ever > 0).sort((a, b) => b.score - a.score);
  const needsPhoto = candidates.filter((c) => !c.image && c.ever > 0).sort((a, b) => b.score - a.score);
  const clearance = candidates.filter((c) => c.ever === 0).sort((a, b) => b.costValue - a.costValue);
  const noImageNoSales = clearance.filter((c) => !c.image).length;

  const out: string[] = [];
  const say = (l = '') => { out.push(l); console.log(l); };
  const sum = (list: Candidate[], k: 'u' | 'retail' | 'costValue') =>
    list.reduce((a, c) => a + c[k], 0);

  const today = new Date(now).toISOString().slice(0, 10);
  say(`# Што да се објави следно — ${today}`);
  say();
  say('Скриени производи со залиха, поделени по дејство. Read-only.');
  say();
  say('| Кофа | Модели | Парчиња | Продажна вредност | Набавна |');
  say('|---|---|---|---|---|');
  say(`| **Објави сега** (има слика, се продавал) | ${publishNow.length} | ${fmt(sum(publishNow, 'u'))} | ${fmt(sum(publishNow, 'retail'))} ден. | ${fmt(sum(publishNow, 'costValue'))} ден. |`);
  say(`| **Треба фотографија** (се продавал) | ${needsPhoto.length} | ${fmt(sum(needsPhoto, 'u'))} | ${fmt(sum(needsPhoto, 'retail'))} ден. | ${fmt(sum(needsPhoto, 'costValue'))} ден. |`);
  say(`| **Расчистување** (никогаш не се продал) | ${clearance.length} | ${fmt(sum(clearance, 'u'))} | ${fmt(sum(clearance, 'retail'))} ден. | ${fmt(sum(clearance, 'costValue'))} ден. |`);
  say();
  say(`Од расчистувањето, ${noImageNoSales} немаат ниту слика — не вреди да се фотографираат.`);
  say();

  const table = (list: Candidate[], limit: number) => {
    say('| # | ID | Група | Парч. | Цена | Вредност | Маржа | Продадени 180д | Вкупно |');
    say('|---|---|---|---|---|---|---|---|---|');
    list.slice(0, limit).forEach((c, i) => {
      say(`| ${i + 1} | \`${c.r.id}\` | ${c.group} | ${c.u} | ${fmt(effPrice(c.r))} | ${fmt(c.retail)} | ${c.margin === null ? '—' : (c.margin * 100).toFixed(0) + '%'} | ${c.s180} | ${c.ever} |`);
    });
    say();
  };

  say('## 1. Објави сега — само прекинувачот во `/admin`');
  say();
  if (publishNow.length === 0) {
    say('Нема ниту еден. Секој скриен производ што се продавал бара фотографија.');
    say();
  } else {
    say(`${publishNow.length} модели · ${fmt(sum(publishNow, 'u'))} парчиња · **${fmt(sum(publishNow, 'retail'))} ден.** продажна вредност, без ниту една фотографија.`);
    say();
    table(publishNow, 40);
  }

  say('## 2. Редица за фотографирање');
  say();
  say('Рангирано по врзана вредност × докажана побарувачка. Почни од врвот — првите');
  say('десет носат најмногу по потрошен час.');
  say();
  table(needsPhoto, 40);

  say('## 3. Расчистување, не објавување');
  say();
  say('Никогаш не се продале. Фотографирањето тука е потрошено време — оди во A2.');
  say();
  table(clearance, 25);

  // group summary for the photography queue
  say('## Редица за фотографирање по група');
  say();
  const byGroup = new Map<string, { n: number; u: number; retail: number }>();
  needsPhoto.forEach((c) => {
    const st = byGroup.get(c.group) ?? { n: 0, u: 0, retail: 0 };
    st.n += 1; st.u += c.u; st.retail += c.retail;
    byGroup.set(c.group, st);
  });
  say('| Група | Модели | Парчиња | Продажна вредност | GMROI на групата |');
  say('|---|---|---|---|---|');
  [...byGroup.entries()].sort((a, b) => b[1].retail - a[1].retail).forEach(([g, st]) =>
    say(`| ${g} | ${st.n} | ${st.u} | ${fmt(st.retail)} ден. | ${groupGmroi(g).toFixed(2)} |`)
  );
  say();

  const dir = join(process.cwd(), 'docs');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `publish-candidates-${today}.md`);
  writeFileSync(path, out.join('\n') + '\n', 'utf8');
  console.log('='.repeat(60));
  console.log(`Зачувано во: docs/publish-candidates-${today}.md`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
