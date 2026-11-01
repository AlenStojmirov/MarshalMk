/**
 * Titles and descriptions written from the attributes (Task 9.6, live in 9.7).
 *
 * The storefront shows these titles (productTitle in product-display.ts) once
 * a product has its colour and cut; until then the old "Кошули - #BT045".
 * `products.name` stays the internal code — nothing is renamed, and the back
 * office keeps showing the code.
 *
 * The point is that a new product gets a good title without anyone thinking
 * about it: the noun comes from the category, then what tells two garments of
 * that category apart, then the cut and the colour, each in the form that
 * agrees with the noun — "бела кошула", "бел џемпер", "бели фармерки". The
 * supplier brand never appears, nor any other brand typed into a name.
 *
 *   Карирана кошула со кратки ракави, слим крој, тегет
 *   Тенка поло блуза, слим крој, црна
 *   Пуфер јакна со качулка, регуларен крој, маслинеста
 *   Фармерки, багги, светло сини
 *
 * A title depends on its own product only (9.7). The preview of 9.6 told twins
 * apart by naming cotton or "plain" when two products read the same, which
 * made one product's title change when another was added — a page Google has
 * indexed would be renamed by an unrelated delivery. Twins are now shown in
 * the back office (/admin/catalog → "Ист наслов"), and the cure is the
 * attribute that really tells them apart: the type of a jacket, the cloth of
 * a shirt, the neckline of a top.
 */

import type { ProductAttributes } from '@/types';
import {
  COLORS, FITS, PATTERNS, SIZE_ADVICE, DETAIL_FIELDS, WEIGHTS,
  careFromComposition, formatComposition, isStretch, sortComposition, templateOf,
  type Forms, type Gender,
} from './attributes';

export type TitleLanguage = 'mk' | 'en';

const adj = (stem: string, m = stem): Forms => ({ m, f: `${stem}а`, n: `${stem}о`, pl: `${stem}и` });
const same = (w: string): Forms => ({ m: w, f: w, n: w, pl: w });

/** A word in front of the noun, in Macedonian (agreeing) and English. */
interface Before { mk: Forms; en: string }
/** A type that is a noun of its own: a parka is not "a parka jacket". */
interface Noun { mk: string; gender: Gender; en: string }

/**
 * Fibres worth naming in a title — "ленена кошула", "волнен џемпер". Cotton is
 * left out on purpose: nearly everything is cotton, so it tells nothing.
 */
const FIBER_BEFORE: Record<string, Before> = {
  linen: { mk: adj('ленен', 'ленен'), en: 'linen' },
  wool: { mk: adj('волнен'), en: 'wool' },
  cashmere: { mk: adj('кашмирен'), en: 'cashmere' },
  silk: { mk: adj('свилен'), en: 'silk' },
  leather: { mk: adj('кожн', 'кожен'), en: 'leather' },
};
/** Share of the garment a fibre must have to be named. */
const FIBER_IN_TITLE_MIN = 50;

/** details.jacketType: most are a word in front of "јакна", three are nouns of their own. */
const JACKET_TYPE: Record<string, Before | Noun> = {
  puffer: { mk: same('пуфер'), en: 'puffer' },
  quilted: { mk: adj('штепан'), en: 'quilted' },
  bomber: { mk: same('бомбер'), en: 'bomber' },
  denim: { mk: same('џинс'), en: 'denim' },
  leather: { mk: adj('кожн', 'кожен'), en: 'leather' },
  softshell: { mk: same('софтшел'), en: 'softshell' },
  parka: { mk: 'Парка', gender: 'f', en: 'Parka' },
  coat: { mk: 'Палто', gender: 'n', en: 'Overcoat' },
  shacket: { mk: 'Кошула-јакна', gender: 'f', en: 'Overshirt' },
};

/** details.fabric, on shirts and trousers. */
const FABRIC: Record<string, Before> = {
  oxford: { mk: same('оксфорд'), en: 'Oxford' },
  poplin: { mk: same('поплин'), en: 'poplin' },
  flannel: { mk: adj('фланелск', 'фланелски'), en: 'flannel' },
  corduroy: { mk: adj('кадифен'), en: 'corduroy' },
  denim: { mk: same('џинс'), en: 'denim' },
  satin: { mk: adj('сатенск', 'сатенски'), en: 'satin' },
  muslin: { mk: same('муслин'), en: 'muslin' },
  chino: { mk: same('чино'), en: 'chino' },
};

/** Knitwear says how thick it is — "тенка блуза" is how the shop floor tells them apart. */
const KNIT = new Set(['blouses', 'dzemper', 'halfZips', 'fullZips', 'cardigans', 'turtleNecks']);
const KNIT_WEIGHT: Record<string, Before> = {
  light: { mk: adj('тенк', 'тенок'), en: 'fine-knit' },
  heavy: { mk: adj('дебел'), en: 'chunky' },
};

/** How a cut reads after the noun. */
const FIT_PHRASE: Record<string, { mk: string; en: string }> = {
  slim: { mk: 'слим крој', en: 'slim fit' },
  regular: { mk: 'регуларен крој', en: 'regular fit' },
  relaxed: { mk: 'релакс крој', en: 'relaxed fit' },
  oversize: { mk: 'оверсајз', en: 'oversized' },
  skinny: { mk: 'скини', en: 'skinny' },
  straight: { mk: 'прав крој', en: 'straight leg' },
  wide: { mk: 'широк крој', en: 'wide leg' },
  baggy: { mk: 'багги', en: 'baggy' },
};

/**
 * Detail values that go into a title, per field: Macedonian after the noun
 * ("со кратки ракави"), English in front of it ("short-sleeve"). What is the
 * norm is left out.
 */
const DETAIL_PHRASE: Record<string, Record<string, { mk: string; en: string }>> = {
  sleeve: {
    short: { mk: 'со кратки ракави', en: 'short-sleeve' },
    long: { mk: 'со долги ракави', en: 'long-sleeve' },
    sleeveless: { mk: 'без ракави', en: 'sleeveless' },
  },
  collar: {
    buttonDown: { mk: 'со button-down јака', en: 'button-down' },
    mandarin: { mk: 'со кинеска јака', en: 'mandarin-collar' },
    cuban: { mk: 'со кубанска јака', en: 'Cuban-collar' },
  },
  neckline: {
    v: { mk: 'со V-изрез', en: 'V-neck' },
    hooded: { mk: 'со качулка', en: 'hooded' },
    half_zip: { mk: 'со полу патент', en: 'half-zip' },
    turtle: { mk: 'со ролка', en: 'roll-neck' },
  },
};

/** A polo collar on a top or a jumper is a kind of its own: "поло блуза". */
const POLO_NECK = new Set(['blouses', 'dzemper']);

/**
 * Categories where a sleeve length is the norm and saying it adds nothing. A
 * shirt is long-sleeved unless it says otherwise, so a shirt without the field
 * filled in still gets a whole title.
 */
const SLEEVE_NORM: Record<string, string> = {
  tShirts: 'short', oversizeTshirts: 'short', polos: 'short', shortSleevedShirt: 'short',
  shirts: 'long', blouses: 'long', dzemper: 'long', halfZips: 'long', fullZips: 'long', cardigans: 'long',
  jackets: 'long', coats: 'long', hoodies: 'long', turtleNecks: 'long',
};

/** Pattern words in English, in front of the noun. Plain says nothing. */
const PATTERN_EN: Record<string, string> = { striped: 'striped', checked: 'checked', print: 'printed' };

export interface GeneratedTitle {
  title: string;
  /**
   * What the title still needs before the storefront uses it (the colour, and
   * the cut where the category has cuts). Empty: the title is complete.
   */
  missing: string[];
}

export interface TitleOptions {
  /** Macedonian unless said (D-039: the English storefront has its own titles). */
  lang?: TitleLanguage;
}

const cap = (s: string) => (s ? s[0].toLocaleUpperCase('mk') + s.slice(1) : s);
const low = (s: string) => (s ? s[0].toLocaleLowerCase('mk') + s.slice(1) : s);
const isNoun = (x: Before | Noun): x is Noun => typeof (x as Noun).gender === 'string';
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function mainFiber(a: ProductAttributes): { fiber: string; pct: number } | undefined {
  return a.composition.length ? sortComposition(a.composition)[0] : undefined;
}

export function generateTitle(category: string, a: ProductAttributes, opts: TitleOptions = {}): GeneratedTitle {
  const lang = opts.lang ?? 'mk';
  const t = templateOf(category);
  const has = (field: string) => t.details.includes(field);
  const missing: string[] = [];

  // The noun: the category's, unless the jacket type is a noun of its own.
  const jt = has('jacketType') ? JACKET_TYPE[str(a.details.jacketType) ?? ''] : undefined;
  let noun = { mk: t.noun, en: t.nounEn };
  let g: Gender = t.gender;
  if (jt && isNoun(jt)) { noun = { mk: jt.mk, en: jt.en }; g = jt.gender; }

  // In front of the noun: how thick a knit is, the material, the type or the cloth, a check.
  const before: Before[] = [];
  const weight = KNIT.has(category) ? KNIT_WEIGHT[str(a.details.weight) ?? ''] : undefined;
  if (weight) before.push(weight);
  const main = mainFiber(a);
  const typeIsLeather = str(a.details.jacketType) === 'leather';
  if (main && main.pct >= FIBER_IN_TITLE_MIN && FIBER_BEFORE[main.fiber] && !(typeIsLeather && main.fiber === 'leather')) {
    before.push(FIBER_BEFORE[main.fiber]);
  }
  if (jt && !isNoun(jt)) before.push(jt);
  const fabric = has('fabric') ? FABRIC[str(a.details.fabric) ?? ''] : undefined;
  if (fabric) before.push(fabric);
  const pattern = a.pattern ? PATTERNS[a.pattern] : undefined;
  if (a.pattern === 'checked' && pattern) before.push({ mk: pattern.title, en: PATTERN_EN.checked });

  // The details that tell garments of the category apart.
  const phrases: Array<{ mk: string; en: string }> = [];
  const poloNeck = has('neckline') && str(a.details.neckline) === 'polo' && POLO_NECK.has(category);
  for (const field of ['sleeve', 'collar', 'neckline'] as const) {
    if (!has(field)) continue;
    const v = str(a.details[field]);
    if (!v) continue;
    if (field === 'sleeve' && SLEEVE_NORM[category] === v) continue;
    const phrase = DETAIL_PHRASE[field]?.[v];
    if (phrase) phrases.push(phrase);
  }
  if (has('hood') && a.details.hood === true && !phrases.some((p) => p.en === 'hooded')) phrases.push({ mk: 'со качулка', en: 'hooded' });

  // Then, comma-separated: reversible, waterproof, cut, colour.
  const tail: Array<{ mk: string; en: string }> = [];
  if (a.details.reversible === true) tail.push({ mk: adj('двостран')[g], en: 'reversible' });
  if (a.details.waterproof === true) tail.push({ mk: adj('водоотпорн', 'водоотпорен')[g], en: 'waterproof' });
  if (a.fit) tail.push(FIT_PHRASE[a.fit] ?? { mk: FITS[a.fit]?.mk ?? a.fit, en: FITS[a.fit]?.en ?? a.fit });
  else if (t.fits.length) missing.push('крој');
  const color = a.color ? COLORS[a.color] : undefined;
  if (color) tail.push({ mk: color.forms[g], en: color.en });
  else missing.push('боја');

  if (lang === 'en') {
    const words = before.map((b) => b.en);
    if (a.pattern && a.pattern !== 'checked' && PATTERN_EN[a.pattern]) words.push(PATTERN_EN[a.pattern]);
    words.push(...phrases.map((p) => p.en));
    const nounEn = poloNeck ? 'Long-sleeve polo' : noun.en;
    const head = [...words, words.length ? low(nounEn) : nounEn].join(' ');
    return { title: cap([head, ...tail.map((x) => x.en)].join(', ')), missing };
  }

  const words = before.map((b) => b.mk[g]);
  if (poloNeck) words.push('поло');
  let head = [...words, words.length ? low(noun.mk) : noun.mk].join(' ');
  const after = phrases.map((p) => p.mk);
  // "на пруги", "со принт" read after the noun; "карирана" went in front.
  if (pattern && a.pattern !== 'checked' && pattern.title[g]) after.push(pattern.title[g]);
  if (after.length) head += ' ' + after.join(' ');
  return { title: cap([head, ...tail.map((x) => x.mk)].join(', ')), missing };
}

/**
 * Titles for a whole catalogue, with the products that share one (the back
 * office's "Ист наслов"). Nothing is changed to tell them apart: a title
 * depends on its own product only.
 */
export function generateTitles(items: Array<{ id: string; category: string; attrs: ProductAttributes }>) {
  const titles = items.map((it) => ({ id: it.id, g: generateTitle(it.category, it.attrs) }));
  const byTitle = new Map<string, string[]>();
  for (const x of titles) byTitle.set(x.g.title, [...(byTitle.get(x.g.title) ?? []), x.id]);
  return new Map(titles.map((x) => [x.id, { ...x.g, twins: (byTitle.get(x.g.title) ?? []).filter((id) => id !== x.id) }]));
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
