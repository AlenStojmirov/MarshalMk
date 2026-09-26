/**
 * What a garment is: the vocabulary behind `product_attributes` (EPIC 9, Task 9.2).
 *
 * The database (migration 010) only guards the shape — fibres adding up to 100,
 * centimetres per size. What the values *mean* lives here, in code, the way the
 * seasons do (`seasons.ts`): a fibre, a colour, a fit, and for every raw
 * category which fields and which measurements apply.
 *
 * Macedonian adjectives agree with the noun — "бела кошула", "бел џемпер",
 * "бели фармерки" — so colours and patterns keep every form, and each category
 * says its noun and gender. The generated titles of Task 9.6 need both.
 *
 * Keys are stored; labels are only shown. Never rename a key: it is in the
 * database. Add a new one instead.
 */

import type { FiberShare, SizeAdvice } from '@/types';

export type Gender = 'm' | 'f' | 'n' | 'pl';

/** An adjective in all four forms, so it can agree with any noun. */
export type Forms = Record<Gender, string>;

interface Labeled {
  mk: string;
  en: string;
}

// ---------------------------------------------------------------------------
// Fibres
// ---------------------------------------------------------------------------

export interface Fiber extends Labeled {
  /** How it is written on labels and in the old descriptions, lower case. */
  aliases: string[];
}

export const FIBERS: Record<string, Fiber> = {
  cotton:    { mk: 'памук',     en: 'cotton',    aliases: ['памук', 'pamuk', 'cotton', 'co', 'baumwolle'] },
  polyester: { mk: 'полиестер', en: 'polyester', aliases: ['полиестер', 'poliester', 'polyester', 'pes', 'pl', 'pe'] },
  // Lycra is a trade name for elastane; the old descriptions use both words.
  elastane:  { mk: 'еластин',   en: 'elastane',  aliases: ['еластин', 'еластан', 'ликра', 'elastin', 'elastane', 'elastan', 'lycra', 'likra', 'spandex', 'ea', 'el'] },
  viscose:   { mk: 'вискоза',   en: 'viscose',   aliases: ['вискоза', 'viskoza', 'viscose', 'vi', 'cv', 'rayon'] },
  linen:     { mk: 'лен',       en: 'linen',     aliases: ['лен', 'len', 'linen', 'li', 'leinen'] },
  acrylic:   { mk: 'акрил',     en: 'acrylic',   aliases: ['акрил', 'akril', 'acrylic', 'pan'] },
  polyamide: { mk: 'полиамид',  en: 'polyamide', aliases: ['полиамид', 'poliamid', 'polyamide', 'nylon', 'најлон', 'pa'] },
  wool:      { mk: 'волна',     en: 'wool',      aliases: ['волна', 'volna', 'wool', 'wo', 'вуна'] },
  cashmere:  { mk: 'кашмир',    en: 'cashmere',  aliases: ['кашмир', 'kasmir', 'cashmere', 'ws'] },
  modal:     { mk: 'модал',     en: 'modal',     aliases: ['модал', 'modal', 'md'] },
  lyocell:   { mk: 'лиоцел',    en: 'lyocell',   aliases: ['лиоцел', 'lyocell', 'tencel', 'тенсел', 'cly'] },
  silk:      { mk: 'свила',     en: 'silk',      aliases: ['свила', 'svila', 'silk', 'se'] },
  leather:   { mk: 'кожа',      en: 'leather',   aliases: ['кожа', 'koza', 'leather'] },
};

const FIBER_BY_ALIAS = new Map<string, string>(
  Object.entries(FIBERS).flatMap(([key, f]) => [[key, key], ...f.aliases.map((a) => [a, key] as [string, string])])
);

/** "Памук", "PES", "Ликра" → 'cotton', 'polyester', 'elastane'. Unknown → undefined. */
export function fiberKey(word: string): string | undefined {
  return FIBER_BY_ALIAS.get(word.trim().toLowerCase().replace(/[.:]+$/, ''));
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * The same rule the database enforces (010), said in words for the form.
 * Empty is valid: not known yet.
 */
export function validateComposition(composition: FiberShare[]): string[] {
  if (composition.length === 0) return [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { fiber, pct } of composition) {
    if (!FIBERS[fiber]) errors.push(`Непознато влакно: ${fiber}`);
    if (seen.has(fiber)) errors.push(`${FIBERS[fiber]?.mk ?? fiber} е внесено двапати`);
    seen.add(fiber);
    if (!(pct > 0 && pct <= 100)) errors.push(`${FIBERS[fiber]?.mk ?? fiber}: процентот мора да е меѓу 0 и 100`);
  }
  const sum = composition.reduce((s, f) => s + f.pct, 0);
  if (Math.abs(sum - 100) > 1e-9) errors.push(`Збирот е ${sum}%, мора да е 100%`);
  return errors;
}

/** Largest share first — the way a label reads. */
export function sortComposition(composition: FiberShare[]): FiberShare[] {
  return [...composition].sort((a, b) => b.pct - a.pct);
}

/** "98% памук · 2% еластин" */
export function formatComposition(composition: FiberShare[], lang: 'mk' | 'en' = 'mk'): string {
  return sortComposition(composition)
    .map((f) => `${f.pct}% ${FIBERS[f.fiber]?.[lang] ?? f.fiber}`)
    .join(' · ');
}

/** The ones the form offers as one click. 59 of the 81 old descriptions are one of these. */
export const COMPOSITION_PRESETS: Array<{ label: string; composition: FiberShare[] }> = [
  { label: '100% памук',             composition: [{ fiber: 'cotton', pct: 100 }] },
  { label: '98% памук · 2% еластин', composition: [{ fiber: 'cotton', pct: 98 }, { fiber: 'elastane', pct: 2 }] },
  { label: '97% памук · 3% еластин', composition: [{ fiber: 'cotton', pct: 97 }, { fiber: 'elastane', pct: 3 }] },
  { label: '60% памук · 40% полиестер', composition: [{ fiber: 'cotton', pct: 60 }, { fiber: 'polyester', pct: 40 }] },
  { label: '50% памук · 50% полиестер', composition: [{ fiber: 'cotton', pct: 50 }, { fiber: 'polyester', pct: 50 }] },
  { label: '100% полиестер',         composition: [{ fiber: 'polyester', pct: 100 }] },
  { label: '100% лен',               composition: [{ fiber: 'linen', pct: 100 }] },
  { label: '50% памук · 50% акрил',  composition: [{ fiber: 'cotton', pct: 50 }, { fiber: 'acrylic', pct: 50 }] },
];

/** Any elastane at all gives a garment stretch; customers ask. Derived, never entered. */
export function isStretch(composition: FiberShare[]): boolean {
  return composition.some((f) => f.fiber === 'elastane' && f.pct > 0);
}

const SYNTHETIC = new Set(['polyester', 'polyamide', 'acrylic']);

/**
 * General care advice from the fibres. It is advice, not the label: the sewn-in
 * label wins, and the product page says so. Dominant fibre decides the wash;
 * elastane and leather add their own rule.
 */
export function careFromComposition(composition: FiberShare[]): string[] {
  if (composition.length === 0) return [];
  const main = sortComposition(composition)[0].fiber;
  const share = (keys: string[]) =>
    composition.filter((f) => keys.includes(f.fiber)).reduce((s, f) => s + f.pct, 0);
  const lines: string[] = [];

  if (main === 'leather') {
    return ['Не се пере во машина — чистете со влажна крпа', 'Чувајте подалеку од директна топлина'];
  }
  if (share(['wool', 'cashmere', 'silk']) >= 30) {
    lines.push('Рачно перење или програма за волна, до 30°C', 'Не цедете и не сушете во машина — сушете на рамно');
  } else if (main === 'viscose' || main === 'modal' || main === 'lyocell') {
    lines.push('Нежно перење до 30°C', 'Не цедете силно; пеглајте на ниска температура');
  } else if (main === 'linen') {
    lines.push('Перење до 40°C', 'Пеглајте додека е малку влажно');
  } else if (share([...SYNTHETIC]) >= 50) {
    lines.push('Перење до 30–40°C', 'Пеглајте на ниска температура');
  } else {
    lines.push('Перење до 40°C, со слични бои');
    if (share(['cotton']) >= 90) lines.push('Чистиот памук може малку да се собере при сушење во машина');
  }
  if (isStretch(composition)) lines.push('Без сушење на висока температура — го чува еластинот');
  return lines;
}

// ---------------------------------------------------------------------------
// Colour, pattern, fit, size advice, weight
// ---------------------------------------------------------------------------

export interface Color extends Labeled {
  forms: Forms;
  /** For the storefront filter swatch. */
  hex: string;
  /**
   * The filter group (a key of COLOR_FAMILIES). Staff pick the exact shade —
   * it goes into the title — while the customer filters by ~14 families and
   * never has to choose between тегет, темно сина and петрол.
   */
  family: string;
}

const adj = (stem: string, m = stem): Forms => ({ m, f: `${stem}а`, n: `${stem}о`, pl: `${stem}и` });
const same = (w: string): Forms => ({ m: w, f: w, n: w, pl: w });
/** "светло" + сина → светло син / светло сина / светло сино / светло сини */
const shade = (prefix: string, stem: string, m = stem): Forms => {
  const base = adj(stem, m);
  return { m: `${prefix} ${base.m}`, f: `${prefix} ${base.f}`, n: `${prefix} ${base.n}`, pl: `${prefix} ${base.pl}` };
};

/**
 * The storefront colour filter. Modelled on a large menswear retailer's
 * (Zalando: 18 values, checked 2026-09), without gold, silver and lilac, which
 * a men's clothing shop this size does not need as groups.
 */
export const COLOR_FAMILIES: Record<string, Labeled & { hex: string }> = {
  black:     { mk: 'Црна',        en: 'Black',       hex: '#111111' },
  white:     { mk: 'Бела',        en: 'White',       hex: '#ffffff' },
  grey:      { mk: 'Сива',        en: 'Grey',        hex: '#8a8a8a' },
  blue:      { mk: 'Сина',        en: 'Blue',        hex: '#2f5fb3' },
  turquoise: { mk: 'Тиркизна',    en: 'Turquoise',   hex: '#1f8a8a' },
  green:     { mk: 'Зелена',      en: 'Green',       hex: '#2e7d4f' },
  beige:     { mk: 'Беж',         en: 'Beige',       hex: '#d9c7a7' },
  brown:     { mk: 'Кафеава',     en: 'Brown',       hex: '#6d4c35' },
  red:       { mk: 'Црвена',      en: 'Red',         hex: '#c0392b' },
  pink:      { mk: 'Розова',      en: 'Pink',        hex: '#e8a0b4' },
  yellow:    { mk: 'Жолта',       en: 'Yellow',      hex: '#e8c547' },
  orange:    { mk: 'Портокалова', en: 'Orange',      hex: '#e67e22' },
  purple:    { mk: 'Виолетова',   en: 'Purple',      hex: '#7d3c98' },
  multi:     { mk: 'Повеќебојна', en: 'Multicolour', hex: '#cccccc' },
};

/**
 * One colour per product (owner, 2026-09-26): the main colour, not every thread.
 * The neutrals menswear is built on — navy, charcoal, camel, olive, stone —
 * each have their own entry: they are most of what a men's shop sells, and
 * "dark blue jeans" is not the same thing as a navy jumper.
 */
export const COLORS: Record<string, Color> = {
  black:     { mk: 'црна',         en: 'black',       hex: '#111111', family: 'black',     forms: adj('црн') },
  white:     { mk: 'бела',         en: 'white',       hex: '#ffffff', family: 'white',     forms: adj('бел') },
  cream:     { mk: 'крем',         en: 'cream',       hex: '#f3ead3', family: 'white',     forms: same('крем') },
  grey:      { mk: 'сива',         en: 'grey',        hex: '#8a8a8a', family: 'grey',      forms: adj('сив') },
  lightGrey: { mk: 'светло сива',  en: 'light grey',  hex: '#c7c7c7', family: 'grey',      forms: shade('светло', 'сив') },
  charcoal:  { mk: 'антрацит',     en: 'charcoal',    hex: '#3a3d40', family: 'grey',      forms: same('антрацит') },
  navy:      { mk: 'тегет',        en: 'navy',        hex: '#1f2a44', family: 'blue',      forms: same('тегет') },
  darkBlue:  { mk: 'темно сина',   en: 'dark blue',   hex: '#243b6b', family: 'blue',      forms: shade('темно', 'син') },
  blue:      { mk: 'сина',         en: 'blue',        hex: '#2f5fb3', family: 'blue',      forms: adj('син') },
  lightBlue: { mk: 'светло сина',  en: 'light blue',  hex: '#9cc3e6', family: 'blue',      forms: shade('светло', 'син') },
  petrol:    { mk: 'петрол',       en: 'petrol',      hex: '#1d5c63', family: 'turquoise', forms: same('петрол') },
  turquoise: { mk: 'тиркизна',     en: 'turquoise',   hex: '#1f8a8a', family: 'turquoise', forms: adj('тиркизн', 'тиркизен') },
  green:     { mk: 'зелена',       en: 'green',       hex: '#2e7d4f', family: 'green',     forms: adj('зелен') },
  darkGreen: { mk: 'темно зелена', en: 'dark green',  hex: '#1f4d36', family: 'green',     forms: shade('темно', 'зелен') },
  olive:     { mk: 'маслинеста',   en: 'olive',       hex: '#6b6b3a', family: 'green',     forms: adj('маслинест') },
  khaki:     { mk: 'каки',         en: 'khaki',       hex: '#b5a37a', family: 'beige',     forms: same('каки') },
  beige:     { mk: 'беж',          en: 'beige',       hex: '#d9c7a7', family: 'beige',     forms: same('беж') },
  camel:     { mk: 'камел',        en: 'camel',       hex: '#b38b59', family: 'beige',     forms: same('камел') },
  brown:     { mk: 'кафеава',      en: 'brown',       hex: '#6d4c35', family: 'brown',     forms: adj('кафеав') },
  burgundy:  { mk: 'бордо',        en: 'burgundy',    hex: '#6d1f2f', family: 'red',       forms: same('бордо') },
  red:       { mk: 'црвена',       en: 'red',         hex: '#c0392b', family: 'red',       forms: adj('црвен') },
  pink:      { mk: 'розова',       en: 'pink',        hex: '#e8a0b4', family: 'pink',      forms: adj('розов') },
  yellow:    { mk: 'жолта',        en: 'yellow',      hex: '#e8c547', family: 'yellow',    forms: adj('жолт') },
  orange:    { mk: 'портокалова',  en: 'orange',      hex: '#e67e22', family: 'orange',    forms: adj('портокалов') },
  purple:    { mk: 'виолетова',    en: 'purple',      hex: '#7d3c98', family: 'purple',    forms: adj('виолетов') },
  multi:     { mk: 'повеќебојна',  en: 'multicolour', hex: '#cccccc', family: 'multi',     forms: { m: 'повеќебоен', f: 'повеќебојна', n: 'повеќебојно', pl: 'повеќебојни' } },
};

export interface Pattern extends Labeled {
  /** How it reads in a title, agreeing with the noun. Empty for plain. */
  title: Forms;
}

export const PATTERNS: Record<string, Pattern> = {
  solid:   { mk: 'едноставна', en: 'solid',   title: same('') },
  striped: { mk: 'на пруги',   en: 'striped', title: same('на пруги') },
  checked: { mk: 'карирана',   en: 'checked', title: adj('кариран') },
  print:   { mk: 'со принт',   en: 'print',   title: same('со принт') },
};

export const FITS: Record<string, Labeled> = {
  slim:     { mk: 'слим',      en: 'slim fit' },
  regular:  { mk: 'регуларен', en: 'regular fit' },
  relaxed:  { mk: 'релакс',    en: 'relaxed fit' },
  oversize: { mk: 'оверсајз',  en: 'oversize' },
  skinny:   { mk: 'скини',     en: 'skinny' },
  straight: { mk: 'прав',      en: 'straight' },
  wide:     { mk: 'широк',     en: 'wide leg' },
  baggy:    { mk: 'багги',     en: 'baggy' },
};

export const SIZE_ADVICE: Record<SizeAdvice, Labeled & { hint: string }> = {
  true:    { mk: 'Одговара точно',      en: 'True to size',    hint: 'Земи ја својата вообичаена големина.' },
  larger:  { mk: 'Земи број поголем',   en: 'Size up',         hint: 'Кројот е потесен — земи број поголем од вообичаениот.' },
  smaller: { mk: 'Земи број помал',     en: 'Size down',       hint: 'Кројот е поширок — земи број помал од вообичаениот.' },
};

/** Fabric weight — worth saying on knitwear and jackets. Stored in details.weight. */
export const WEIGHTS: Record<string, Labeled> = {
  light:  { mk: 'тенок материјал',  en: 'lightweight' },
  medium: { mk: 'среден материјал', en: 'midweight' },
  heavy:  { mk: 'дебел материјал',  en: 'heavyweight' },
};

// ---------------------------------------------------------------------------
// Per-category details, stored in product_attributes.details
// ---------------------------------------------------------------------------

export interface DetailField {
  label: string;
  /** Options → label. Absent for a yes/no field. */
  options?: Record<string, string>;
}

export const DETAIL_FIELDS: Record<string, DetailField> = {
  sleeve:     { label: 'Ракав',        options: { short: 'кратки ракави', long: 'долги ракави', sleeveless: 'без ракави' } },
  collar:     { label: 'Јака',         options: { classic: 'класична', buttonDown: 'со копчиња (button-down)', mandarin: 'кинеска (мандарин)', cuban: 'кубанска' } },
  neckline:   { label: 'Изрез',        options: { crew: 'кружен', v: 'V-изрез', polo: 'поло јака', turtle: 'ролка', hooded: 'со качулка', half_zip: 'полу патент' } },
  closure:    { label: 'Затворање',    options: { buttons: 'копчиња', zip: 'патент', pullover: 'без затворање', snaps: 'дрикери' } },
  weight:     { label: 'Материјал',    options: Object.fromEntries(Object.entries(WEIGHTS).map(([k, w]) => [k, w.mk])) },
  legLength:  { label: 'Должина на ногавица', options: { '30L': '30L', '32L': '32L', '34L': '34L', '36L': '36L' } },
  rise:       { label: 'Струк',        options: { low: 'низок', mid: 'среден', high: 'висок' } },
  lining:     { label: 'Подлога' },
  hood:       { label: 'Качулка' },
  waterproof: { label: 'Водоотпорна' },
  origin:     { label: 'Земја на производство', options: { TR: 'Турција', MK: 'Македонија', IT: 'Италија', PT: 'Португалија', CN: 'Кина', BD: 'Бангладеш', PK: 'Пакистан', IN: 'Индија' } },
};

// ---------------------------------------------------------------------------
// Measurements — taken by hand in the shop (suppliers give none, 2026-09-26)
// ---------------------------------------------------------------------------

export interface Measure {
  label: string;
  /** For whoever measures, so two people measuring the same shirt agree. */
  howTo: string;
}

export const MEASURES: Record<string, Measure> = {
  chest:     { label: 'Ширина на гради',  howTo: 'Облеката на рамно, закопчана. Од пазув до пазув, право преку. Еднаш — не се множи по 2.' },
  length:    { label: 'Должина',          howTo: 'Од највисоката точка на рамото (до јаката) право надолу до долниот раб.' },
  shoulders: { label: 'Рамена',           howTo: 'Од шев до шев на рамењата, преку грбот.' },
  sleeve:    { label: 'Ракав',            howTo: 'Од шевот на рамото до крајот на манжетната.' },
  waist:     { label: 'Половина',         howTo: 'Закопчано, на рамно. Горниот раб од едната до другата страна. Еднаш — не се множи по 2.' },
  hip:       { label: 'Колк',             howTo: 'На рамно, најшироката точка под патентот, од страна до страна.' },
  thigh:     { label: 'Бутина',           howTo: 'Една ногавица, 2 cm под меѓуножјето, од раб до раб.' },
  inseam:    { label: 'Внатрешна должина', howTo: 'Од меѓуножјето по внатрешниот шев до долниот раб.' },
  legOpening:{ label: 'Ширина на ногавица', howTo: 'Долниот раб на ногавицата, на рамно, од раб до раб.' },
};

// ---------------------------------------------------------------------------
// Templates per raw category
// ---------------------------------------------------------------------------

export interface CategoryTemplate {
  /** Singular noun for a title — "Кошула", "Фармерки" (plural-only). */
  noun: string;
  gender: Gender;
  fits: string[];
  details: string[];
  /** Empty: nothing to measure (one size, or not a garment). */
  measures: string[];
}

const TOP = ['chest', 'length', 'shoulders', 'sleeve'];
const TEE = ['chest', 'length', 'shoulders'];
const BOTTOM = ['waist', 'hip', 'thigh', 'inseam', 'legOpening'];
const SHORTS = ['waist', 'hip', 'thigh', 'inseam'];
const TOP_FITS = ['slim', 'regular', 'relaxed', 'oversize'];
const LEG_FITS = ['skinny', 'slim', 'straight', 'relaxed', 'wide', 'baggy'];

/**
 * Every raw category in `products.category` that holds merchandise, including
 * the two the report groups miss (`dzemper`, `kosula`). `vaucer` is not clothing.
 */
export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  tShirts:           { noun: 'Маица',             gender: 'f',  fits: TOP_FITS, details: ['neckline', 'sleeve', 'weight', 'origin'], measures: TEE },
  oversizeTshirts:   { noun: 'Оверсајз маица',    gender: 'f',  fits: ['oversize'], details: ['neckline', 'sleeve', 'weight', 'origin'], measures: TEE },
  polos:             { noun: 'Поло маица',        gender: 'f',  fits: TOP_FITS, details: ['sleeve', 'weight', 'origin'], measures: TEE },
  shirts:            { noun: 'Кошула',            gender: 'f',  fits: TOP_FITS, details: ['sleeve', 'collar', 'origin'], measures: TOP },
  shortSleevedShirt: { noun: 'Кошула',            gender: 'f',  fits: TOP_FITS, details: ['sleeve', 'collar', 'origin'], measures: TEE },
  blouses:           { noun: 'Блуза',             gender: 'f',  fits: TOP_FITS, details: ['neckline', 'weight', 'origin'], measures: TOP },
  turtleNecks:       { noun: 'Ролка',             gender: 'f',  fits: TOP_FITS, details: ['weight', 'origin'], measures: TOP },
  halfZips:          { noun: 'Полу зипер',        gender: 'm',  fits: TOP_FITS, details: ['weight', 'origin'], measures: TOP },
  fullZips:          { noun: 'Зипер',             gender: 'm',  fits: TOP_FITS, details: ['hood', 'weight', 'origin'], measures: TOP },
  hoodies:           { noun: 'Дуксер',            gender: 'm',  fits: TOP_FITS, details: ['hood', 'closure', 'weight', 'origin'], measures: TOP },
  cardigans:         { noun: 'Кардиган',          gender: 'm',  fits: TOP_FITS, details: ['closure', 'weight', 'origin'], measures: TOP },
  dzemper:           { noun: 'Џемпер',            gender: 'm',  fits: TOP_FITS, details: ['neckline', 'weight', 'origin'], measures: TOP },
  jackets:           { noun: 'Јакна',             gender: 'f',  fits: TOP_FITS, details: ['closure', 'hood', 'lining', 'waterproof', 'weight', 'origin'], measures: TOP },
  coats:             { noun: 'Капут',             gender: 'm',  fits: TOP_FITS, details: ['closure', 'lining', 'weight', 'origin'], measures: TOP },
  vests:             { noun: 'Елек',              gender: 'm',  fits: TOP_FITS, details: ['closure', 'hood', 'lining', 'origin'], measures: ['chest', 'length', 'shoulders'] },
  blazers:           { noun: 'Блејзер',           gender: 'm',  fits: ['slim', 'regular'], details: ['lining', 'origin'], measures: TOP },
  suitJackets:       { noun: 'Сако',              gender: 'n',  fits: ['slim', 'regular'], details: ['lining', 'origin'], measures: TOP },
  suits:             { noun: 'Одело',             gender: 'n',  fits: ['slim', 'regular'], details: ['lining', 'origin'], measures: [...TOP, 'waist', 'inseam'] },
  jeans:             { noun: 'Фармерки',          gender: 'pl', fits: LEG_FITS, details: ['legLength', 'rise', 'origin'], measures: BOTTOM },
  shortsJeans:       { noun: 'Шорцеви',           gender: 'pl', fits: ['slim', 'regular', 'relaxed', 'baggy'], details: ['origin'], measures: SHORTS },
  pants:             { noun: 'Панталони',         gender: 'pl', fits: LEG_FITS, details: ['legLength', 'rise', 'origin'], measures: BOTTOM },
  cargoTrousers:     { noun: 'Карго панталони',   gender: 'pl', fits: LEG_FITS, details: ['legLength', 'origin'], measures: BOTTOM },
  belts:             { noun: 'Ремен',             gender: 'm',  fits: [], details: ['origin'], measures: [] },
  accessories:       { noun: 'Додаток',           gender: 'm',  fits: [], details: ['origin'], measures: [] },
};

/** Template for a raw category; unknown ones get a bare template rather than nothing. */
export function templateOf(category: string): CategoryTemplate {
  return CATEGORY_TEMPLATES[category] ?? { noun: category, gender: 'm', fits: Object.keys(FITS), details: ['origin'], measures: [] };
}
