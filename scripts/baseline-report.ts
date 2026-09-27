/* eslint-disable no-console */
/**
 * Baseline report — READ ONLY.
 *
 * Reads Supabase and prints
 * the real numbers behind the inventory strategy: models per category, units and
 * capital tied in stock, sales velocity, the actual size curve, and realised
 * gross margin.
 *
 * Nothing is written to any database. Output goes to stdout and to
 * `docs/baseline-<today>.md`.
 *
 * Run with: npx tsx scripts/baseline-report.ts
 *
 * Cost comes from `products.purchase_price`, the same column the admin screens
 * read. The Firebase doubling is handled once, at sync (docs/DECISIONS.md D-002).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { canonicalSize } from '../src/lib/sizes';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Proposed 23 -> 9 consolidation from the strategy doc (Task 2.4). */
const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло',
  oversizeTshirts: 'Маици & Поло',
  polos: 'Маици & Поло',
  shirts: 'Кошули',
  shortSleevedShirt: 'Кошули',
  blouses: 'Кошули',
  cardigans: 'Плетиво',
  turtleNecks: 'Плетиво',
  halfZips: 'Плетиво',
  hoodies: 'Дуксери',
  fullZips: 'Дуксери',
  jeans: 'Фармерки',
  shortsJeans: 'Фармерки',
  pants: 'Панталони',
  cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили',
  coats: 'Јакни & Мантили',
  vests: 'Јакни & Мантили',
  suits: 'Свечено',
  blazers: 'Свечено',
  suitJackets: 'Свечено',
  belts: 'Аксесоари',
  accessories: 'Аксесоари',
  vaucer: 'Аксесоари',
};

/**
 * Categories that are not physical merchandise. Vouchers have no purchase cost
 * and no size run — counting them as stock distorts units and months-of-supply.
 */
const NON_MERCHANDISE = new Set(['vaucer']);

const groupOf = (category: string) => CATEGORY_GROUPS[category] ?? `(немапирано) ${category || '—'}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SizeEntry { size: string; quantity: number }
interface SoldEntry { size: string; price: number | string; soldDate: string }

interface ProductRow {
  id: string;
  name: string | null;
  category: string | null;
  price: number | string | null;
  stock: number | null;
  sizes: SizeEntry[] | null;
  sold: SoldEntry[] | null;
  brand: string | null;
  purchase_price: number | string | null;
  is_visible: boolean | null;
  created_at: string | null;
}

interface OrderRow {
  id: string;
  items: Array<{ quantity?: number; price?: number }> | null;
  subtotal: number | string | null;
  shipping: number | string | null;
  total: number | string | null;
  status: string;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number, decimals = 0): string =>
  n.toLocaleString('mk-MK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const pct = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;

/** Month key YYYY-MM from an ISO or YYYY-MM-DD string; null if unparseable. */
const monthKey = (dateStr: string | null | undefined): string | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
};

const daysAgo = (dateStr: string | null | undefined, now: number): number | null => {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / 86_400_000);
};

/** Markdown table from a header row and body rows. */
const table = (head: string[], rows: (string | number)[][]): string => {
  const sep = head.map(() => '---');
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(sep), ...rows.map(line)].join('\n');
};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Paginate — Supabase caps a single select at 1000 rows.
  const pageAll = async <T>(tableName: string, columns: string): Promise<T[]> => {
    const out: T[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await supabase
        .from(tableName)
        .select(columns)
        .range(from, from + size - 1);
      if (error) throw new Error(`${tableName}: ${error.message}`);
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < size) break;
    }
    return out;
  };

  const products = await pageAll<ProductRow>(
    // The cost lives in product_costs since migration 008; the view joins it in.
    'products_costed',
    'id, name, category, price, stock, sizes, sold, brand, purchase_price, is_visible, created_at'
  );
  const orders = await pageAll<OrderRow>(
    'orders',
    'id, items, subtotal, shipping, total, status, created_at'
  );

  return { products, orders };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function main() {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  console.log('Reading Supabase (read-only)…\n');
  const { products: allProducts, orders } = await loadSupabase();

  const vouchers = allProducts.filter((p) => NON_MERCHANDISE.has(p.category ?? ''));
  const products = allProducts.filter((p) => !NON_MERCHANDISE.has(p.category ?? ''));

  const out: string[] = [];
  const say = (line = '') => { out.push(line); console.log(line); };

  say(`# Baseline извештај — ${today}`);
  say();
  say('Read-only снимка на вистинските бројки. Служи за проверка на праговите во');
  say('`docs/BACKLOG.md` и стратешкиот документ, кои беа реконструирани од opex и profit.');
  say();
  if (vouchers.length) {
    const vUnits = vouchers.reduce((a, p) => a + (p.sizes ?? []).reduce((s, sz) => s + Math.max(0, num(sz.quantity)), 0), 0);
    say(`> Исклучени од сите пресметки: ${vouchers.length} ваучери (${vUnits} „парчиња") — немаат`);
    say('> набавна цена ниту големинска серија, па не се залиха.');
  }
  say();

  // ---- cost lookup ------------------------------------------------------
  // Cost comes from Supabase, the same column every admin screen reads.
  // It used to be read from Firebase and halved here, which worked only while
  // the two agreed: editing a purchase price in the admin writes to Supabase
  // alone, so this report would have kept quoting the stale Firebase figure.
  // The halving still happens, once, at sync (D-002).
  const costById = new Map(
    products.map((p) => [p.id, p.purchase_price === null ? null : num(p.purchase_price)])
  );
  const costOf = (productId: string): number | null => costById.get(productId) ?? null;

  // =======================================================================
  // 1. Products
  // =======================================================================
  const unitsOf = (p: ProductRow) =>
    (p.sizes ?? []).reduce((s, sz) => s + Math.max(0, num(sz.quantity)), 0);

  /** Storefront rule: visible AND at least one size with quantity >= 1. */
  const isLive = (p: ProductRow) =>
    p.is_visible !== false && (p.sizes ?? []).some((sz) => num(sz.quantity) >= 1);

  const withCost = products.filter((p) => costOf(p.id) !== null);
  const totalUnits = products.reduce((s, p) => s + unitsOf(p), 0);
  const liveProducts = products.filter(isLive);

  let stockCost = 0;
  let stockCostUnitsCovered = 0;
  let stockRetail = 0;
  for (const p of products) {
    const u = unitsOf(p);
    stockRetail += u * num(p.price);
    const c = costOf(p.id);
    if (c !== null) {
      stockCost += u * c;
      stockCostUnitsCovered += u;
    }
  }

  say('## 1. Производи и залиха');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Вкупно производи (модели) во Supabase', fmt(products.length)],
      ['Видливи (`is_visible ≠ false`)', `${fmt(products.filter((p) => p.is_visible !== false).length)}`],
      ['**Живи на storefront** (видливи И имаат залиха)', `**${fmt(liveProducts.length)}**`],
      ['Парчиња на залиха (сума од `sizes`)', fmt(totalUnits)],
      ['Просечно парчиња по модел', products.length ? (totalUnits / products.length).toFixed(1) : '—'],
      ['Вредност на залиха по продажна цена', `${fmt(stockRetail)} ден.`],
      ['Вредност на залиха по набавна', `${fmt(stockCost)} ден.`],
      ['Покриеност со набавна цена', `${fmt(withCost.length)} / ${fmt(products.length)} модели (${pct(withCost.length, products.length)})`],
      ['Парчиња покриени со набавна цена', `${fmt(stockCostUnitsCovered)} / ${fmt(totalUnits)} (${pct(stockCostUnitsCovered, totalUnits)})`],
    ]
  ));
  say();

  // ---- per group --------------------------------------------------------
  interface GroupStat {
    models: number; live: number; units: number; retail: number; cost: number; costUnits: number;
  }
  const groups = new Map<string, GroupStat>();
  const rawCats = new Map<string, number>();

  for (const p of products) {
    const cat = p.category ?? '';
    rawCats.set(cat, (rawCats.get(cat) ?? 0) + 1);

    const g = groupOf(cat);
    const st = groups.get(g) ?? { models: 0, live: 0, units: 0, retail: 0, cost: 0, costUnits: 0 };
    const u = unitsOf(p);
    st.models += 1;
    if (isLive(p)) st.live += 1;
    st.units += u;
    st.retail += u * num(p.price);
    const c = costOf(p.id);
    if (c !== null) { st.cost += u * c; st.costUnits += u; }
    groups.set(g, st);
  }

  say('### По консолидирана група (предлог 23 → 9)');
  say();
  say(table(
    ['Група', 'Модели', 'Живи', 'Парчиња', 'Парч./модел', 'Набавна вред.', '% од капитал'],
    [...groups.entries()]
      .sort((a, b) => b[1].units - a[1].units)
      .map(([g, s]) => [
        g,
        fmt(s.models),
        fmt(s.live),
        fmt(s.units),
        s.models ? (s.units / s.models).toFixed(1) : '—',
        `${fmt(s.cost)} ден.`,
        pct(s.cost, stockCost),
      ])
  ));
  say();

  say('<details><summary>Сурови категории во базата</summary>');
  say();
  say(table(
    ['Категорија (raw)', 'Модели', 'Група'],
    [...rawCats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => [c || '(празно)', fmt(n), groupOf(c)])
  ));
  say();
  say('</details>');
  say();

  // =======================================================================
  // 2. Sales history from sold[]
  // =======================================================================
  interface SaleFlat { productId: string; size: string; price: number; date: string; cost: number | null }
  const sales: SaleFlat[] = [];
  let undatedSales = 0;

  for (const p of products) {
    const c = costOf(p.id);
    for (const s of p.sold ?? []) {
      const key = monthKey(s.soldDate);
      if (!key) { undatedSales += 1; continue; }
      sales.push({ productId: p.id, size: String(s.size ?? ''), price: num(s.price), date: s.soldDate, cost: c });
    }
  }

  const paidSales = sales.filter((s) => s.price > 0);
  const zeroSales = sales.filter((s) => s.price <= 0);

  const byMonth = new Map<string, { units: number; revenue: number; cogs: number; costed: number }>();
  for (const s of paidSales) {
    const k = monthKey(s.date)!;
    const m = byMonth.get(k) ?? { units: 0, revenue: 0, cogs: 0, costed: 0 };
    m.units += 1;
    m.revenue += s.price;
    if (s.cost !== null) { m.cogs += s.cost; m.costed += 1; }
    byMonth.set(k, m);
  }

  const months = [...byMonth.keys()].sort().slice(-12);

  say('## 2. Продажба во дуќан (од `sold[]`)');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Вкупно записи во `sold[]`', fmt(sales.length + undatedSales)],
      ['Со валиден датум', fmt(sales.length)],
      ['Без валиден датум (игнорирани)', fmt(undatedSales)],
      ['Платени продажби (цена > 0)', fmt(paidSales.length)],
      ['**Со нулта цена** (→ `reason=personal`, D-005)', `**${fmt(zeroSales.length)}** (${pct(zeroSales.length, sales.length)})`],
    ]
  ));
  say();

  if (months.length) {
    say('### Последни 12 месеци');
    say();
    say(table(
      ['Месец', 'Парчиња', 'Приход', 'Просечна цена', 'COGS', 'Бруто маржа'],
      months.map((k) => {
        const m = byMonth.get(k)!;
        const margin = m.costed > 0 && m.revenue > 0
          ? `${(((m.revenue * (m.costed / m.units) - m.cogs) / (m.revenue * (m.costed / m.units))) * 100).toFixed(1)}%`
          : '—';
        return [
          k,
          fmt(m.units),
          `${fmt(m.revenue)} ден.`,
          m.units ? `${fmt(m.revenue / m.units)} ден.` : '—',
          m.costed ? `${fmt(m.cogs)} ден.` : '—',
          margin,
        ];
      })
    ));
    say();
  }

  // rolling windows
  const windows = [30, 90, 365];
  say('### Подвижни прозорци');
  say();
  say(table(
    ['Прозорец', 'Парчиња', 'Приход', 'Парчиња/месец'],
    windows.map((w) => {
      const inWin = paidSales.filter((s) => {
        const d = daysAgo(s.date, now);
        return d !== null && d >= 0 && d < w;
      });
      const rev = inWin.reduce((a, s) => a + s.price, 0);
      return [
        `${w} дена`,
        fmt(inWin.length),
        `${fmt(rev)} ден.`,
        fmt((inWin.length / w) * 30, 1),
      ];
    })
  ));
  say();

  // realised gross margin overall
  const costedSales = paidSales.filter((s) => s.cost !== null);
  if (costedSales.length) {
    const rev = costedSales.reduce((a, s) => a + s.price, 0);
    const cogs = costedSales.reduce((a, s) => a + (s.cost ?? 0), 0);
    say('### Остварена бруто маржа');
    say();
    say(table(
      ['Метрика', 'Вредност'],
      [
        ['Продажби со позната набавна цена', `${fmt(costedSales.length)} / ${fmt(paidSales.length)} (${pct(costedSales.length, paidSales.length)})`],
        ['Приход', `${fmt(rev)} ден.`],
        ['COGS', `${fmt(cogs)} ден.`],
        ['Бруто профит', `${fmt(rev - cogs)} ден.`],
        ['**Бруто маржа**', `**${pct(rev - cogs, rev)}**`],
        ['Markup', rev - cogs > 0 && cogs > 0 ? pct(rev - cogs, cogs) : '—'],
        ['Просечна набавна цена по парче', `${fmt(cogs / costedSales.length)} ден.`],
      ]
    ));
    say();
  }

  // ---- sales per group, with months-of-supply ---------------------------
  const last365 = paidSales.filter((s) => {
    const d = daysAgo(s.date, now);
    return d !== null && d >= 0 && d < 365;
  });

  const groupOfProduct = new Map(products.map((p) => [p.id, groupOf(p.category ?? '')]));
  const salesByGroup = new Map<string, { units: number; revenue: number; cogs: number }>();
  for (const s of last365) {
    const g = groupOfProduct.get(s.productId) ?? '(непознат)';
    const st = salesByGroup.get(g) ?? { units: 0, revenue: 0, cogs: 0 };
    st.units += 1;
    st.revenue += s.price;
    st.cogs += s.cost ?? 0;
    salesByGroup.set(g, st);
  }

  say('### Залиха vs. продажба по група (последни 365 дена)');
  say();
  say(table(
    ['Група', 'Парчиња на залиха', 'Продадени/год.', 'Месеци залиха', 'Бруто профит/год.', 'GMROI'],
    [...groups.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([g, st]) => {
        const sold = salesByGroup.get(g);
        const perMonth = (sold?.units ?? 0) / 12;
        const monthsSupply = perMonth > 0 ? st.units / perMonth : Infinity;
        const grossProfit = sold ? sold.revenue - sold.cogs : 0;
        const gmroi = st.cost > 0 ? grossProfit / st.cost : 0;
        return [
          g,
          fmt(st.units),
          fmt(sold?.units ?? 0),
          Number.isFinite(monthsSupply) ? fmt(monthsSupply, 1) : '∞',
          `${fmt(grossProfit)} ден.`,
          gmroi ? gmroi.toFixed(2) : '—',
        ];
      })
  ));
  say();
  say('> „Месеци залиха" = колку месеци трае тековната залиха при тековното темпо.');
  say('> Здраво е 3–4. Над 12 значи капитал што не се движи.');
  say();

  // =======================================================================
  // 3. Size curve
  // =======================================================================
  const sizeCount = new Map<string, number>();
  for (const s of paidSales) {
    const key = canonicalSize(s.size) || '(празно)';
    sizeCount.set(key, (sizeCount.get(key) ?? 0) + 1);
  }
  const LETTER_ORDER = ['S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL'];
  const letterRows = [...sizeCount.entries()].filter(([s]) => LETTER_ORDER.includes(s));
  const otherRows = [...sizeCount.entries()].filter(([s]) => !LETTER_ORDER.includes(s));
  const letterTotal = letterRows.reduce((a, [, n]) => a + n, 0);

  say('## 3. Вистинска големинска крива (од продадени парчиња)');
  say();
  if (letterRows.length) {
    say(table(
      ['Големина', 'Продадени', 'Удел', 'Претпоставка во стратегијата'],
      LETTER_ORDER.filter((s) => sizeCount.has(s)).map((s) => {
        const n = sizeCount.get(s)!;
        const assumed: Record<string, string> = { S: '10%', M: '22%', L: '28%', XL: '25%', XXL: '15%' };
        return [s, fmt(n), pct(n, letterTotal), assumed[s] ?? '—'];
      })
    ));
    say();
  }
  if (otherRows.length) {
    say('<details><summary>Нумерички и останати големини</summary>');
    say();
    say(table(
      ['Големина', 'Продадени'],
      otherRows.sort((a, b) => b[1] - a[1]).slice(0, 40).map(([s, n]) => [s, fmt(n)])
    ));
    say();
    say('</details>');
    say();
  }

  // =======================================================================
  // 4. Orders
  // =======================================================================
  // `subtotal` is product revenue and `total` is what the customer handed over
  // at the door. They differ by shipping, and shipping is not revenue: below the
  // threshold the 170 is collected and paid straight to the courier, above it
  // the courier is paid out of the item prices (D-006). Either way it nets to
  // zero, so every margin and AOV figure here is built on `subtotal`.
  const statusCount = new Map<string, number>();
  const ordersByMonth = new Map<string, { count: number; revenue: number }>();
  let shippingZero = 0;

  for (const o of orders) {
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
    if (num(o.shipping) === 0) shippingZero += 1;
    const k = monthKey(o.created_at);
    if (!k) continue;
    const m = ordersByMonth.get(k) ?? { count: 0, revenue: 0 };
    m.count += 1;
    m.revenue += num(o.subtotal);
    ordersByMonth.set(k, m);
  }

  const orderRevenue = orders.reduce((a, o) => a + num(o.subtotal), 0);
  const orderCollected = orders.reduce((a, o) => a + num(o.total), 0);
  const orderShipping = orders.reduce((a, o) => a + num(o.shipping), 0);

  say('## 4. Online нарачки');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Вкупно нарачки', fmt(orders.length)],
      ['Приход од производи (`subtotal`)', `${fmt(orderRevenue)} ден.`],
      ['Поштарина (`shipping`)', `${fmt(orderShipping)} ден.`],
      ['Наплатено на врата (`total`)', `${fmt(orderCollected)} ден.`],
      ['AOV по производи', orders.length ? `${fmt(orderRevenue / orders.length)} ден.` : '—'],
      ['Нарачки со `shipping = 0`', `${fmt(shippingZero)} / ${fmt(orders.length)} (${pct(shippingZero, orders.length)})`],
    ]
  ));
  say();
  say('> Поштарината не е приход. Под прагот се наплаќа и веднаш се плаќа на курирот;');
  say('> над прагот курирот се плаќа од цените на ставките (D-006). Во двата случаи');
  say('> нетира на нула, па AOV и маржата се мерат на `subtotal`, не на `total`.');
  if (shippingZero > 0) {
    say('>');
    say('> Нарачки со `shipping = 0` се однапред D-006. Пушти `npm run orders:shipping`.');
  }
  say();
  if (statusCount.size) {
    say(table(
      ['Статус', 'Нарачки', 'Удел'],
      [...statusCount.entries()].sort((a, b) => b[1] - a[1])
        .map(([s, n]) => [s, fmt(n), pct(n, orders.length)])
    ));
    say();
  }
  const oMonths = [...ordersByMonth.keys()].sort().slice(-12);
  if (oMonths.length) {
    say('### Нарачки по месец');
    say();
    say(table(
      ['Месец', 'Нарачки', 'Приход', 'AOV'],
      oMonths.map((k) => {
        const m = ordersByMonth.get(k)!;
        return [k, fmt(m.count), `${fmt(m.revenue)} ден.`, `${fmt(m.revenue / m.count)} ден.`];
      })
    ));
    say();
  }

  // =======================================================================
  // 5. Derived — the numbers the strategy assumed
  // =======================================================================
  const costed365 = last365.filter((s) => s.cost !== null);
  const annualCogsKnown = costed365.reduce((a, s) => a + (s.cost ?? 0), 0);
  // extrapolate to all sales if only part have cost
  const coverage = last365.length ? costed365.length / last365.length : 0;
  const annualCogs = coverage > 0 ? annualCogsKnown / coverage : 0;
  const turnover = stockCost > 0 && annualCogs > 0 ? annualCogs / stockCost : 0;

  say('## 5. Изведени метрики vs. претпоставки во стратегијата');
  say();
  say(table(
    ['Метрика', 'Вистинско', 'Претпоставено', 'Забелешка'],
    [
      ['Активни модели', fmt(liveProducts.length), '~120', 'живи на storefront'],
      ['Парчиња на залиха', fmt(totalUnits), '~600', ''],
      ['Парчиња продадени / месец (дуќан)', fmt(last365.length / 12, 1), '~170', 'просек 12 мес.'],
      ['Капитал во залиха (набавна)', `${fmt(stockCost)} ден.`, '~480.000 ден.', coverage < 1 ? `покриеност ${pct(costed365.length, last365.length)}` : ''],
      ['Годишен COGS', annualCogs ? `${fmt(annualCogs)} ден.` : '—', '~1.620.000 ден.', 'екстраполиран'],
      ['**Inventory turnover**', turnover ? `**${turnover.toFixed(2)}×**` : '—', '~3,4×', 'COGS ÷ залиха по набавна'],
      ['Days in inventory', turnover ? fmt(365 / turnover) : '—', '~107', ''],
    ]
  ));
  say();
  say('> Turnover тука користи **тековна** залиха, не просечна низ годината — вистинската');
  say('> бројка бара `inventory_snapshots` (Task 3.4). Ова е приближување.');
  say();

  // =======================================================================
  // 6. Where the trapped capital actually sits
  // =======================================================================
  const soldUnits365 = new Map<string, number>();
  for (const s of last365) {
    soldUnits365.set(s.productId, (soldUnits365.get(s.productId) ?? 0) + 1);
  }
  const soldEverIds = new Set(sales.map((s) => s.productId));

  const costValueOf = (list: ProductRow[]) =>
    list.reduce((a, p) => {
      const c = costOf(p.id);
      return a + (c === null ? 0 : unitsOf(p) * c);
    }, 0);

  const bucket = (label: string, list: ProductRow[]) => [
    label,
    fmt(list.length),
    fmt(list.reduce((a, p) => a + unitsOf(p), 0)),
    `${fmt(costValueOf(list))} ден.`,
    pct(costValueOf(list), stockCost),
  ];

  const inStock = products.filter((p) => unitsOf(p) > 0);
  const liveInStock = inStock.filter(isLive);
  const hiddenInStock = inStock.filter((p) => !isLive(p));
  const noSale365 = inStock.filter((p) => !soldUnits365.has(p.id));
  const noSaleEver = inStock.filter((p) => !soldEverIds.has(p.id));

  say('## 6. Каде точно е врзаниот капитал');
  say();
  say(table(
    ['Сегмент', 'Модели', 'Парчиња', 'Набавна вредност', '% од капитал'],
    [
      bucket('Со залиха — вкупно', inStock),
      bucket('↳ видливи на storefront', liveInStock),
      bucket('↳ скриени', hiddenInStock),
      bucket('Без ниту една продажба 365 дена', noSale365),
      bucket('Без ниту една продажба воопшто', noSaleEver),
    ]
  ));
  say();
  say('> „Скриени" = `is_visible = false` или нема ниту една големина со количина ≥ 1.');
  say('> Стока без продажба цела година е најдиректната дефиниција на мртов капитал.');
  say();

  // ---- size-run health --------------------------------------------------
  const CORE_SIZES = ['M', 'L', 'XL'];
  const sizeSet = (p: ProductRow) =>
    new Set((p.sizes ?? []).filter((sz) => num(sz.quantity) >= 1).map((sz) => canonicalSize(sz.size)));

  const letterModels = liveInStock.filter((p) => {
    const s = sizeSet(p);
    return LETTER_ORDER.some((l) => s.has(l));
  });
  const coreComplete = letterModels.filter((p) => {
    const s = sizeSet(p);
    return CORE_SIZES.every((c) => s.has(c));
  });
  const coreBroken = letterModels.filter((p) => {
    const s = sizeSet(p);
    return !CORE_SIZES.every((c) => s.has(c));
  });
  const onlyEdges = letterModels.filter((p) => {
    const s = sizeSet(p);
    return !CORE_SIZES.some((c) => s.has(c)) && (s.has('S') || s.has('XXL'));
  });

  say('### Здравје на големинските серии (само живи модели со буквени големини)');
  say();
  say(table(
    ['Состојба', 'Модели', 'Удел'],
    [
      ['Живи модели со буквени големини', fmt(letterModels.length), '100%'],
      ['Целосна core серија (M + L + XL)', fmt(coreComplete.length), pct(coreComplete.length, letterModels.length)],
      ['Скршена core серија', fmt(coreBroken.length), pct(coreBroken.length, letterModels.length)],
      ['Само рабни големини (S/XXL, без M-L-XL)', fmt(onlyEdges.length), pct(onlyEdges.length, letterModels.length)],
    ]
  ));
  say();
  say('> Купувач што не ја наоѓа својата големина е изгубена продажба која никаде не се');
  say('> запишува. Скршената серија е трошок што не се појавува во ниту еден извештај.');
  say();

  // =======================================================================
  // 7. Path to break-even
  // =======================================================================
  const revenue365 = last365.reduce((a, s) => a + s.price, 0);
  const monthlyRevenue = revenue365 / 12;
  const monthlyCogs = annualCogs / 12;
  const monthlyGross = monthlyRevenue - monthlyCogs;
  const marginPct = monthlyRevenue > 0 ? monthlyGross / monthlyRevenue : 0;
  const OPEX = 65_000;
  const net = monthlyGross - OPEX;
  const breakEvenRevenue = marginPct > 0 ? OPEX / marginPct : 0;
  const revenueGap = breakEvenRevenue - monthlyRevenue;
  const marginNeeded = monthlyRevenue > 0 ? OPEX / monthlyRevenue : 0;
  const monthsSupplyAll = monthlyCogs > 0 ? stockCost / monthlyCogs : 0;
  const healthyStock = monthlyCogs * 4;
  const excessCapital = Math.max(0, stockCost - healthyStock);

  say('## 7. Пат до нула');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Приход / месец', `${fmt(monthlyRevenue)} ден.`],
      ['COGS / месец', `${fmt(monthlyCogs)} ден.`],
      ['Бруто профит / месец', `${fmt(monthlyGross)} ден.`],
      ['Бруто маржа', `${(marginPct * 100).toFixed(1)}%`],
      ['Оперативни трошоци (наведени)', `−${fmt(OPEX)} ден.`],
      ['**Нето резултат / месец**', `**${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} ден.**`],
      ['Нето резултат / година', `${net >= 0 ? '+' : '−'}${fmt(Math.abs(net * 12))} ден.`],
    ]
  ));
  say();
  say('### Три лоста — секој сам по себе доволен за нула');
  say();
  say(table(
    ['Лост', 'Треба', 'Од сегашно', 'Реалност'],
    [
      [
        'Повеќе приход при иста маржа',
        `${fmt(breakEvenRevenue)} ден./мес.`,
        `+${fmt(revenueGap)} ден. (+${((revenueGap / monthlyRevenue) * 100).toFixed(0)}%)`,
        'Online каналот е речиси нула — тука е најголемиот необработен потенцијал',
      ],
      [
        'Повисока маржа при ист приход',
        `${(marginNeeded * 100).toFixed(1)}%`,
        `од ${(marginPct * 100).toFixed(1)}% (+${((marginNeeded - marginPct) * 100).toFixed(1)} п.п.)`,
        'Помалку попусти, повисока цена на брзите, преговор за набавна',
      ],
      [
        'Пониски трошоци при ист приход',
        `${fmt(monthlyGross)} ден./мес.`,
        `−${fmt(OPEX - monthlyGross)} ден. (−${(((OPEX - monthlyGross) / OPEX) * 100).toFixed(0)}%)`,
        'Најтешкиот лост во мал бизнис — киријата и платите се фиксни',
      ],
    ]
  ));
  say();
  say('### Врзан капитал');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Залиха по набавна цена', `${fmt(stockCost)} ден.`],
      ['Месеци залиха при тековно темпо', `${fmt(monthsSupplyAll, 1)}`],
      ['Здрава залиха (4 месеци)', `${fmt(healthyStock)} ден.`],
      ['**Вишок капитал**', `**${fmt(excessCapital)} ден.**`],
      ['Вишокот како месеци на opex', `${fmt(excessCapital / OPEX, 1)} месеци`],
      ['GMROI (вкупно)', stockCost > 0 ? (((monthlyGross * 12) / stockCost)).toFixed(2) : '—'],
    ]
  ));
  say();
  say('> GMROI под 1,0 значи дека секој денар во залиха враќа помалку од денар бруто');
  say('> профит годишно. Здраво за мода е 2,5–3,0.');
  say();

  // =======================================================================
  // 8. Discount leakage — realised price vs list price
  // =======================================================================
  const listPriceOf = new Map(products.map((p) => [p.id, num(p.price)]));
  let listValue = 0;
  let actualValue = 0;
  let comparable = 0;
  let discountedUnits = 0;
  for (const s of last365) {
    const list = listPriceOf.get(s.productId) ?? 0;
    if (list <= 0) continue;
    comparable += 1;
    listValue += list;
    actualValue += s.price;
    if (s.price < list * 0.98) discountedUnits += 1;
  }
  const leakage = listValue - actualValue;

  say('## 8. Истекување на маржа преку попусти');
  say();
  say(table(
    ['Метрика', 'Вредност'],
    [
      ['Продажби споредливи со тековната цена', `${fmt(comparable)} / ${fmt(last365.length)}`],
      ['Вредност по тековна цена од листа', `${fmt(listValue)} ден.`],
      ['Наплатено', `${fmt(actualValue)} ден.`],
      ['**Разлика**', `**${fmt(leakage)} ден.** (${pct(leakage, listValue)})`],
      ['Продадени под цена (>2% попуст)', `${fmt(discountedUnits)} (${pct(discountedUnits, comparable)})`],
      ['Разлика на месечна основа', `${fmt(leakage / 12)} ден./мес.`],
    ]
  ));
  say();
  say('> ⚠ Приближно: споредува историска продажна цена со **тековната** цена во каталогот.');
  say('> Ако цените се менувани, дел од разликата е промена на цена, не попуст. Точна');
  say('> бројка бара `unit_discount` во ledger-от (Task 0.1).');
  say();

  // =======================================================================
  // 9. Actionable clearance list
  // =======================================================================
  const deadRanked = noSale365
    .map((p) => {
      const c = costOf(p.id) ?? 0;
      const u = unitsOf(p);
      return { p, units: u, cost: c * u, list: num(p.price) * u };
    })
    .filter((r) => r.units > 0)
    .sort((a, b) => b.cost - a.cost);

  say('## 9. Листа за расчистување — нула продажби 365 дена');
  say();
  say(`Вкупно ${fmt(deadRanked.length)} модели · ${fmt(deadRanked.reduce((a, r) => a + r.units, 0))} парчиња · ${fmt(deadRanked.reduce((a, r) => a + r.cost, 0))} ден. набавна вредност`);
  say();
  say(table(
    ['#', 'ID', 'Категорија', 'Парч.', 'Набавна вред.', 'Продажна вред.', 'Видлив'],
    deadRanked.slice(0, 30).map((r, i) => [
      i + 1,
      r.p.id,
      r.p.category ?? '—',
      fmt(r.units),
      `${fmt(r.cost)} ден.`,
      `${fmt(r.list)} ден.`,
      isLive(r.p) ? 'да' : '**не**',
    ])
  ));
  say();
  if (deadRanked.length > 30) {
    say(`… и уште ${fmt(deadRanked.length - 30)} модели. Целосната листа е во излезот на скриптот.`);
    say();
  }

  // ---- is the leakage real discounting, or just price drift? -------------
  say('### Проверка: попусти или качени цени?');
  say();
  say('Ако разликата е од качување на цените, скорашните продажби ќе покажат помала');
  say('разлика од старите. Ако е од попусти, разликата е стабилна низ прозорците.');
  say();
  say(table(
    ['Прозорец', 'Продажби', 'Листа', 'Наплатено', 'Разлика', '% под цена'],
    [30, 90, 365].map((w) => {
      const win = paidSales.filter((s) => {
        const d = daysAgo(s.date, now);
        return d !== null && d >= 0 && d < w;
      });
      let lv = 0, av = 0, under = 0, n = 0;
      for (const s of win) {
        const list = listPriceOf.get(s.productId) ?? 0;
        if (list <= 0) continue;
        n += 1; lv += list; av += s.price;
        if (s.price < list * 0.98) under += 1;
      }
      return [
        `${w} дена`,
        fmt(n),
        `${fmt(lv)} ден.`,
        `${fmt(av)} ден.`,
        lv > 0 ? pct(lv - av, lv) : '—',
        pct(under, n),
      ];
    })
  ));
  say();

  // ---- write file -------------------------------------------------------
  const docsDir = join(process.cwd(), 'docs');
  mkdirSync(docsDir, { recursive: true });
  const outPath = join(docsDir, `baseline-${today}.md`);
  writeFileSync(outPath, out.join('\n') + '\n', 'utf8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Зачувано во: docs/baseline-${today}.md`);
  console.log('Ништо не е запишано во база — извештајот е read-only.');
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nBaseline report failed:', err);
    process.exit(1);
  });
