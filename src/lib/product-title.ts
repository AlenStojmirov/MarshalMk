/**
 * Titles and descriptions written from the attributes (Task 9.6).
 *
 * PREVIEW ONLY. Nothing on the storefront reads this yet: the site keeps
 * "Кошули - #BT045" from getProductDisplayName() until the owner decides on
 * Task 9.7 (owner, 2026-09-26). `products.name` stays the internal code
 * either way — nothing is renamed.
 *
 * The point is that a new product gets a good title without anyone thinking
 * about it: the noun comes from the category, then what tells two garments of
 * that category apart, then the cut and the colour, each in the form that
 * agrees with the noun — "бела кошула", "бел џемпер", "бели фармерки". The
 * supplier brand never appears.
 *
 *   Карирана кошула со долги ракави, слим крој, тегет
 *   Ленена кошула со кратки ракави, бела
 *   Фармерки, багги, светло сини
 */

import type { ProductAttributes } from '@/types';
import {
  COLORS, FITS, PATTERNS, SIZE_ADVICE, DETAIL_FIELDS, WEIGHTS,
  careFromComposition, formatComposition, isStretch, sortComposition, templateOf,
  type Forms, type Gender,
} from './attributes';

const adj = (stem: string, m = stem): Forms => ({ m, f: `${stem}а`, n: `${stem}о`, pl: `${stem}и` });

/**
 * Fibres worth naming in a title, as the adjective in front of the noun —
 * "ленена кошула", "волнен џемпер". Cotton is left out on purpose: nearly
 * everything is cotton, so it only tells apart (see DISAMBIGUATE).
 */
const FIBER_ADJ: Record<string, Forms> = {
  linen: adj('ленен', 'ленен'),
  wool: adj('волнен'),
  cashmere: adj('кашмирен'),
  silk: adj('свилен'),
  leather: adj('кожен'),
  cotton: adj('памучн', 'памучен'),
};
/** Share of the garment a fibre must have to be named. */
const FIBER_IN_TITLE_MIN = 50;

/** How a cut reads after the noun. */
const FIT_PHRASE: Record<string, string> = {
  slim: 'слим крој',
  regular: 'регуларен крој',
  relaxed: 'релакс крој',
  oversize: 'оверсајз',
  skinny: 'скини',
  straight: 'прав крој',
  wide: 'широк крој',
  baggy: 'багги',
};

/** Detail values that go into a title, per field. What is the norm is left out. */
const DETAIL_PHRASE: Record<string, Record<string, string>> = {
  sleeve: { short: 'со кратки ракави', long: 'со долги ракави', sleeveless: 'без ракави' },
  collar: { buttonDown: 'со button-down јака', mandarin: 'со кинеска јака', cuban: 'со кубанска јака' },
  neckline: { v: 'со V-изрез', hooded: 'со качулка', half_zip: 'со полу патент', turtle: 'со ролка' },
};

/** Categories where a sleeve length is the norm and saying it adds nothing. */
const SLEEVE_NORM: Record<string, string> = {
  tShirts: 'short', oversizeTshirts: 'short', polos: 'short', shortSleevedShirt: 'short',
  jackets: 'long', coats: 'long', hoodies: 'long', blouses: 'long', turtleNecks: 'long',
};

export interface GeneratedTitle {
  title: string;
  /** What the title would still like to know. Empty: nothing missing. */
  missing: string[];
}

const cap = (s: string) => (s ? s[0].toLocaleUpperCase('mk') + s.slice(1) : s);
const low = (s: string) => (s ? s[0].toLocaleLowerCase('mk') + s.slice(1) : s);

function mainFiber(a: ProductAttributes): { fiber: string; pct: number } | undefined {
  return a.composition.length ? sortComposition(a.composition)[0] : undefined;
}

export interface TitleOptions {
  /** Name the dominant fibre even when it is cotton — used to tell twins apart. */
  withCotton?: boolean;
  /** Name the pattern even when it is plain. */
  withPlain?: boolean;
}

export function generateTitle(category: string, a: ProductAttributes, opts: TitleOptions = {}): GeneratedTitle {
  const t = templateOf(category);
  const g: Gender = t.gender;
  const missing: string[] = [];

  // In front of the noun: the material, then a pattern that is an adjective.
  const before: string[] = [];
  const main = mainFiber(a);
  if (main && main.pct >= FIBER_IN_TITLE_MIN && FIBER_ADJ[main.fiber] && (main.fiber !== 'cotton' || opts.withCotton)) {
    before.push(FIBER_ADJ[main.fiber][g]);
  }
  const pattern = a.pattern ? PATTERNS[a.pattern] : undefined;
  const patternForm = pattern?.title[g] ?? '';
  const patternIsAdjective = a.pattern === 'checked';
  if (patternIsAdjective && patternForm) before.push(patternForm);

  let head = [...before, before.length ? low(t.noun) : t.noun].join(' ');

  // After the noun: what distinguishes garments of this category.
  const after: string[] = [];
  for (const field of ['sleeve', 'collar', 'neckline'] as const) {
    if (!t.details.includes(field)) continue;
    const v = a.details[field];
    if (typeof v !== 'string') {
      if (field === 'sleeve' && !SLEEVE_NORM[category]) missing.push(DETAIL_FIELDS.sleeve.label.toLowerCase());
      continue;
    }
    if (field === 'sleeve' && SLEEVE_NORM[category] === v) continue;
    const phrase = DETAIL_PHRASE[field]?.[v];
    if (phrase) after.push(phrase);
  }
  if (t.details.includes('hood') && a.details.hood === true && !after.some((p) => p.includes('качулка'))) after.push('со качулка');
  if (!patternIsAdjective && patternForm) after.push(patternForm);
  if (opts.withPlain && a.pattern === 'solid') after.push(adj('едноставн', 'едноставен')[g]);
  if (after.length) head += ' ' + after.join(' ');

  // Then, comma-separated: reversible, waterproof, cut, colour.
  const tail: string[] = [];
  if (a.details.reversible === true) tail.push(adj('двостран')[g]);
  if (a.details.waterproof === true) tail.push(adj('водоотпорн', 'водоотпорен')[g]);
  if (a.fit) tail.push(FIT_PHRASE[a.fit] ?? FITS[a.fit]?.mk ?? a.fit);
  else if (t.fits.length) missing.push('крој');
  const color = a.color ? COLORS[a.color] : undefined;
  if (color) tail.push(color.forms[g]);
  else missing.push('боја');

  return { title: cap([head, ...tail].join(', ')), missing };
}

/**
 * Titles for a whole catalogue, with twins told apart. Two products that read
 * the same are first given their material (cotton included), then "plain";
 * whatever still collides is reported, not numbered — a number tells the
 * customer nothing, and a twin usually means an attribute is missing.
 */
export function generateTitles(items: Array<{ id: string; category: string; attrs: ProductAttributes }>) {
  const out = new Map<string, GeneratedTitle & { twins: string[] }>();
  const passes: TitleOptions[] = [{}, { withCotton: true }, { withCotton: true, withPlain: true }];
  let pending = items;
  for (const [i, opts] of passes.entries()) {
    const titles = pending.map((it) => ({ it, g: generateTitle(it.category, it.attrs, opts) }));
    const byTitle = new Map<string, typeof titles>();
    titles.forEach((x) => byTitle.set(x.g.title, [...(byTitle.get(x.g.title) ?? []), x]));
    const next: typeof items = [];
    for (const group of byTitle.values()) {
      const last = i === passes.length - 1;
      if (group.length === 1 || last) {
        for (const x of group) out.set(x.it.id, { ...x.g, twins: group.length > 1 ? group.filter((y) => y !== x).map((y) => y.it.id) : [] });
      } else {
        next.push(...group.map((x) => x.it));
      }
    }
    pending = next;
    if (!pending.length) break;
  }
  return out;
}

/**
 * The description the customer would read: made of, cut, fit advice, the
 * details, care. Short lines, no marketing adjectives — the shop floor tells
 * facts, and so does this.
 */
export function generateDescription(category: string, a: ProductAttributes): string[] {
  const t = templateOf(category);
  const lines: string[] = [];
  if (a.composition.length) {
    lines.push(`Материјал: ${formatComposition(a.composition)}${isStretch(a.composition) ? ' — растеглив' : ''}.`);
  }
  const weight = typeof a.details.weight === 'string' ? WEIGHTS[a.details.weight]?.mk : undefined;
  if (weight) lines.push(`${cap(weight)}.`);
  if (a.fit) lines.push(`Крој: ${FITS[a.fit]?.mk ?? a.fit}.`);
  if (a.sizeAdvice) lines.push(SIZE_ADVICE[a.sizeAdvice].hint);

  const facts: string[] = [];
  for (const key of t.details) {
    const f = DETAIL_FIELDS[key];
    const v = a.details[key];
    if (!f || v === undefined || key === 'weight' || key === 'origin') continue;
    if (v === true) facts.push(f.label.toLowerCase());
    else if (typeof v === 'string' && f.options?.[v]) facts.push(`${f.label.toLowerCase()}: ${f.options[v]}`);
  }
  if (facts.length) lines.push(`${cap(facts.join(', '))}.`);
  const origin = typeof a.details.origin === 'string' ? DETAIL_FIELDS.origin.options?.[a.details.origin] : undefined;
  if (origin) lines.push(`Произведено во ${origin}.`);

  const care = careFromComposition(a.composition);
  if (care.length) lines.push(`Одржување: ${care.map(low).join('; ')}. Важи упатството на етикетата.`);
  return lines;
}
