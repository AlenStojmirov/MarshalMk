/**
 * The text of a post, written from what the product is (Task 10.2, EPIC 10).
 *
 * Owner's brief (2026-09-27): a little humour and emoji, **Cyrillic only**. The
 * price is always there — never "цена во инбокс" — and it is the price the site
 * shows. A discount is spoken of only where the season ladder calls for one
 * (D-022); everywhere else the post sells the garment, the season, the
 * combination, or the last piece.
 *
 * Templates, not an AI service: free, predictable, and they cannot invent a
 * fibre the label does not say. Each kind has VARIANTS versions so a week of
 * posts does not read the same; the marketing employee picks one and edits it.
 *
 * Sizes (S, M, XL) are the one Latin script the text keeps — they are printed
 * on the garment. `latinOutsideSizes` flags anything else. The brand never
 * appears, and neither does the internal code (#BT045).
 *
 * Pure: no database, no browser.
 */

import type { ProductAttributes } from '@/types';
import { formatComposition, FITS, SIZE_ADVICE } from './attributes';
import { generateTitle } from './product-title';
import { seasonOf, type Month } from './seasons';
import { den, type Combo, type PostCandidate, type PostKind } from './marketing';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { STORE_ADDRESS } from '@/config/store';

export const VARIANTS = 3;
/** Instagram reads the first few; more looks like spam and reaches no one extra. */
export const MAX_HASHTAGS = 5;

export type CopyKind = PostKind | 'trust';

export interface PostCopy {
  kind: CopyKind;
  variant: number;
  /** The caption, hashtags included, ready to paste. */
  text: string;
  /** Reel: the lines to put on screen, one per cut. */
  onScreen?: string[];
  /** Reel or story: what to film or which sticker to add. */
  idea?: string;
}

const pick = <T,>(list: T[], variant: number): T => list[((variant % list.length) + list.length) % list.length];
const emptyAttrs = (productId: string): ProductAttributes => ({ productId, composition: [], details: {}, measurements: {} });

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

type Group = 'shirt' | 'bottom' | 'outer' | 'knit' | 'summer' | 'formal' | 'other';

const GROUP_OF: Record<string, Group> = {
  shirts: 'shirt', kosula: 'shirt', shortSleevedShirt: 'shirt',
  jeans: 'bottom', pants: 'bottom', cargoTrousers: 'bottom',
  jackets: 'outer', coats: 'outer', vests: 'outer',
  blouses: 'knit', turtleNecks: 'knit', dzemper: 'knit', halfZips: 'knit', fullZips: 'knit', hoodies: 'knit', cardigans: 'knit',
  tShirts: 'summer', oversizeTshirts: 'summer', polos: 'summer', shortsJeans: 'summer',
  blazers: 'formal', suitJackets: 'formal', suits: 'formal',
};
const groupOf = (category: string): Group => GROUP_OF[category] ?? 'other';

/** The opening line. Three per group, in the shop's voice: friendly, a wink, no shouting. */
const HOOKS: Record<Group, string[]> = {
  shirt: [
    'Кошула што оди и на работа и на кафе после 😎',
    'Една кошула, илјада комбинации. Ајде да ги пробаме сите 👔',
    'Кога ќе ти кажат „облечи се убаво“, ова е одговорот 😄',
  ],
  bottom: [
    'Седат како да се шиени по тебе 👌',
    'Основата на секој добар стил. Без добра основа нема ништо 😉',
    'Проверено: одат со сè што имаш во плакарот 🙌',
  ],
  outer: [
    'Утрата веќе штипат 🥶 Време е за нешто потопло',
    'Есента дојде без да праша. Биди подготвен 🍂',
    'Топло, удобно и изгледаш добро. Што повеќе сакаш? 🧥',
  ],
  knit: [
    'Вечерите стануваат свежи, а ова е решението 🍂',
    'Меко, топло и оди со фармерки. Трипати да 🙌',
    'Сезоната на слоеви е официјално отворена 😌',
  ],
  summer: [
    'Летото сè уште не се предава ☀️',
    'Уште малку сонце. Искористи го 😎',
    'За топлите денови што ни останаа 🌤️',
  ],
  formal: [
    'Свадба, матура или важна средба? Решено 🤵',
    'Некои прилики бараат малку повеќе 😉',
    'Кога сакаш сите да прашаат „од каде ти е?“ ✨',
  ],
  other: [
    'Можеби токму ова ти фалеше 😉',
    'Стил без многу размислување 👌',
    'Го бараше, само не знаеше 😄',
  ],
};

const CLEARANCE_HOOKS = [
  'Расчистуваме! 🧹 Последни парчиња по намалени цени',
  'Сезоната заврши, цените паднаа 📉',
  'Кој прв, негово 🏃 Количините се мали',
];

const COMBO_HOOKS = [
  'Горе и долу, готов комплет, а доставата е на нас 🚚',
  'Две парчиња, еден стил, нула поштарина 😎',
  'Комбинацијата е готова. Ти само облечи ја 👌',
];

const CTAS = [
  'Пиши ни во порака 📩',
  'Нарачај во порака или преку линкот во био 👆',
  'Јави ни се во порака, ќе ти ја резервираме твојата големина 📩',
];

/** What to film, by group. A reel is a few seconds of the garment moving. */
const REEL_IDEAS: Record<Group, string[]> = {
  shirt: [
    'Облекување за 10 секунди: кошулата отворена преку маица, па закопчана.',
    '„Од работа до вечер“: исто парче, две комбинации, секоја по 3 секунди.',
    'Детали одблиску: јака, копчиња, материјал, па цела кошула на човек.',
  ],
  bottom: [
    '„3 начини да се носат“: со кошула, со маица, со јакна.',
    'Одење кон камерата, па одблиску џебови и шевови.',
    'Пред и потоа: исто лице, стари панталони наспроти овие.',
  ],
  outer: [
    'Излегување од дуќанот: јакната се облекува во движење.',
    'Одблиску: патент, качулка, подлога. Потоа цела на човек.',
    '„Колку е топла?“: рака во џеб, крената јака, насмевка.',
  ],
  knit: [
    'Меко одблиску: рака преку материјалот, па облечено.',
    'Слоеви: маица → џемпер → јакна, секое по 2 секунди.',
    'Ладно утро, топол чај, овој џемпер. 7 секунди атмосфера.',
  ],
  summer: [
    'Брзо менување: три маици, три пози, еден ритам.',
    'Сонце, ѕид, една поза. Кратко и светло.',
    'Последни летни парчиња на закачалка, едно по едно.',
  ],
  formal: [
    'Закопчување на сакото и поправање на ракавите, на бавно.',
    'Од закачалка до облечено, во еден рез.',
    'Детали: ревер, копчиња, пресек на кројот.',
  ],
  other: [
    'Парчето одблиску, па на човек, 5 секунди.',
    'Три комбинации со истото парче.',
    'Распакување: од кеса до облечено.',
  ],
};

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

const BASE_TAGS = ['#маршал', '#виница', '#машкаоблека'];

const CATEGORY_TAG: Record<string, string> = {
  shirts: '#кошули', kosula: '#кошули', shortSleevedShirt: '#кошули',
  jeans: '#фармерки', pants: '#панталони', cargoTrousers: '#карго',
  jackets: '#јакни', coats: '#капути', vests: '#елеци',
  blouses: '#блузи', turtleNecks: '#ролки', dzemper: '#џемпери', halfZips: '#дуксери', fullZips: '#дуксери',
  hoodies: '#дуксери', cardigans: '#кардигани',
  tShirts: '#маици', oversizeTshirts: '#маици', polos: '#поломаици', shortsJeans: '#шорцеви',
  blazers: '#блејзер', suitJackets: '#сако', suits: '#одело',
  accessories: '#додатоци', belts: '#ремени',
};

/** The calendar season by month, for a tag — not the selling window (D-010). */
function seasonTag(month: Month): string {
  if (month >= 3 && month <= 5) return '#пролет';
  if (month >= 6 && month <= 8) return '#лето';
  if (month >= 9 && month <= 11) return '#есен';
  return '#зима';
}

export function hashtags(categories: string[], kind: CopyKind, month: Month): string[] {
  const tags = [...BASE_TAGS];
  for (const c of categories) {
    const t = CATEGORY_TAG[c];
    if (t && !tags.includes(t)) tags.push(t);
  }
  if (kind === 'clearance') tags.push('#расчистување');
  else if (kind === 'combo') tags.push('#комбинација');
  else if (categories.some((c) => seasonOf(c)?.season !== 'ALL')) tags.push(seasonTag(month));
  return tags.slice(0, MAX_HASHTAGS);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function productTitle(c: PostCandidate, a?: ProductAttributes): string {
  return generateTitle(c.product.category, a ?? emptyAttrs(c.product.id)).title;
}

const sizeList = (c: PostCandidate) => c.sizes.map((s) => s.size).join(' · ');
/** Trouser sizes are numbers: "број 31", while "L" reads on its own. */
const isNumeric = (size: string) => /^\d+$/.test(size);
const sizeWord = (size: string) => (isNumeric(size) ? `број ${size}` : size);

function lastPieceLine(c: PostCandidate): string | null {
  if (!c.lastSizes.length) return null;
  if (c.lastSizes.length === c.sizes.length) return '⏳ Од секоја големина има само по едно парче';
  if (c.lastSizes.length === 1) return `⏳ Од ${sizeWord(c.lastSizes[0])} остана само едно парче`;
  const words = c.lastSizes.map(sizeWord);
  return `⏳ Од ${words.slice(0, -1).join(', ')} и ${words.at(-1)} има само по едно парче`;
}

/** The price as the site shows it; the old one beside it only where a discount may be the message. */
function priceLine(c: PostCandidate): string {
  if (c.discount.allowed && c.percentOff > 0) {
    return `💥 ${den(c.price)} наместо ${den(c.listPrice)} (−${c.percentOff}%)`;
  }
  return `💰 ${den(c.price)}`;
}

function deliveryLines(total: number): string[] {
  const free = total >= SHIPPING_CONFIG.freeShippingThreshold;
  return [
    free
      ? '🚚 Бесплатна достава низ цела Македонија, плаќање при достава'
      : `🚚 Достава низ цела Македонија, плаќање при достава. Бесплатна над ${den(SHIPPING_CONFIG.freeShippingThreshold)}`,
    `📍 Или подигни во дуќанот: ${STORE_ADDRESS}`,
  ];
}

function detailLines(c: PostCandidate, a?: ProductAttributes): string[] {
  const lines: string[] = [];
  if (a?.composition?.length) lines.push(`🧵 ${formatComposition(a.composition)}`);
  if (a?.fit && FITS[a.fit]) lines.push(`📐 Крој: ${FITS[a.fit].mk}`);
  if (a?.sizeAdvice) lines.push(`📏 ${SIZE_ADVICE[a.sizeAdvice].hint}`);
  lines.push(`📦 Големини: ${sizeList(c)}`);
  const last = lastPieceLine(c);
  if (last) lines.push(last);
  return lines;
}

const join = (blocks: Array<string | string[] | null>) =>
  blocks
    .filter((b): b is string | string[] => b !== null && (typeof b === 'string' ? b.length > 0 : b.length > 0))
    .map((b) => (Array.isArray(b) ? b.join('\n') : b))
    .join('\n\n');

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export function productCopy(
  kind: Exclude<CopyKind, 'combo' | 'trust'>,
  c: PostCandidate,
  a: ProductAttributes | undefined,
  variant: number,
  month: Month,
): PostCopy {
  const group = groupOf(c.product.category);
  const title = productTitle(c, a);
  const tags = hashtags([c.product.category], kind, month).join(' ');
  // A discount post only where the ladder allows it; otherwise the product post.
  const hook = kind === 'clearance' && c.discount.allowed ? pick(CLEARANCE_HOOKS, variant) : pick(HOOKS[group], variant);

  if (kind === 'story') {
    const size = c.lastSizes[0];
    const last = size ? pick([
      isNumeric(size) ? `Последен број ${size} 👀` : `Последна ${size} 👀`,
      `Остана само уште едно парче во ${sizeWord(size)} ⏳`,
      `${isNumeric(size) ? `Број ${size}` : size}? Имаме уште едно. Само едно 😬`,
    ], variant) : hook;
    return {
      kind, variant,
      text: join([last, `${title}\n${priceLine(c)}`, pick(CTAS, variant)]),
      idea: c.lastSizes.length
        ? 'Стикер со линк до производот, и стикер „одбројување“ ако е расчистување.'
        : pick(['Стикер со анкета: „Би го носел?“ Да / Секако 😄', 'Стикер со линк до производот.', 'Стикер „прашање“: „Која големина ти треба?“'], variant),
    };
  }

  const caption = join([
    hook,
    `✨ ${title}`,
    detailLines(c, a),
    priceLine(c),
    deliveryLines(c.price),
    pick(CTAS, variant),
    tags,
  ]);

  if (kind === 'reel') {
    return {
      kind, variant,
      text: caption,
      onScreen: [hook, title, priceLine(c).replace(/^\S+\s/, '')],
      idea: pick(REEL_IDEAS[group], variant),
    };
  }
  return { kind, variant, text: caption };
}

export function comboCopy(
  combo: Combo,
  attrs: Map<string, ProductAttributes>,
  variant: number,
  month: Month,
): PostCopy {
  const top = productTitle(combo.top, attrs.get(combo.top.product.id));
  const bottom = productTitle(combo.bottom, attrs.get(combo.bottom.product.id));
  return {
    kind: 'combo', variant,
    text: join([
      pick(COMBO_HOOKS, variant),
      [
        `👕 ${top}: ${den(combo.top.price)} · ${sizeList(combo.top)}`,
        `👖 ${bottom}: ${den(combo.bottom.price)} · ${sizeList(combo.bottom)}`,
      ],
      `💰 Заедно ${den(combo.total)}`,
      deliveryLines(combo.total),
      pick(CTAS, variant),
      hashtags([combo.top.product.category, combo.bottom.product.category], 'combo', month).join(' '),
    ]),
  };
}

/** The post that answers "is it safe to order?" — a COD shop's main question. Once a week. */
export function trustCopy(variant: number, month: Month): PostCopy {
  const threshold = den(SHIPPING_CONFIG.freeShippingThreshold);
  const shipping = den(SHIPPING_CONFIG.shippingCost);
  const tags = [...BASE_TAGS, '#плаќањепридостава', seasonTag(month)].slice(0, MAX_HASHTAGS).join(' ');
  const texts = [
    join([
      'Како се нарачува од Маршал? 🤔',
      [
        '1️⃣ Избери парче',
        '2️⃣ Пиши ни во порака или нарачај преку линкот во био',
        '3️⃣ Плати кога ќе стигне пратката 💵',
      ],
      `🚚 Достава низ цела Македонија: ${shipping}, бесплатна над ${threshold}`,
      tags,
    ]),
    join([
      'Плаќање при достава 💵 Без картички, без ризик.',
      'Прво ја гледаш пратката, па плаќаш. Не ти е добра големината? Јави ни се во рок од 24 часа од подигањето и ќе ја замениме 🔄',
      `🚚 Бесплатна достава над ${threshold}`,
      pick(CTAS, variant),
      tags,
    ]),
    join([
      'Не сме само на интернет 😄',
      `📍 Дуќанот е во Виница, ${STORE_ADDRESS}. Дојди, пробај, земи.`,
      `А ако си подалеку, праќаме низ цела Македонија и плаќаш при достава. Над ${threshold} доставата е бесплатна 🚚`,
      tags,
    ]),
  ];
  return { kind: 'trust', variant, text: pick(texts, variant) };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** Size tokens are printed on the garment and stay Latin. */
const SIZE_TOKEN = /^(X{0,3}S|M|X{0,3}L|\d+X?L)$/;

/** Latin words that are not sizes — the owner asked for Cyrillic only. */
export function latinOutsideSizes(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).filter((w) => !SIZE_TOKEN.test(w));
}
