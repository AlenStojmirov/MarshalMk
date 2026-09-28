/**
 * Every post a small experiment (Task 10.7, EPIC 10).
 *
 * The owner is not a marketer and wants to learn from numbers. So a post can
 * name one question it answers — "on a person or on a hanger?" — and which
 * side it is, and after it runs carry what Instagram's Insights showed. Once
 * each side has enough posts, the screen says which one won, and by how much;
 * before that, it says to keep going.
 *
 * What counts: **messages** first. In a cash-on-delivery shop an order starts
 * in the inbox, so a message is the nearest thing to a sale that Insights can
 * see. Online orders from the post's tracked link (D-025) count on top, and
 * reach and saves break a tie. Likes are left out on purpose: they are what
 * a post gets, not what it sells.
 *
 * Pure: no database, no browser.
 */

import type { PlanItem } from './marketing-calendar';

export interface Hypothesis {
  key: string;
  question: string;
  a: string;
  b: string;
  /** What to keep the same, so the answer is about this and not about the product. */
  hint: string;
}

export const HYPOTHESES: Hypothesis[] = [
  {
    key: 'person-vs-hanger', question: 'На човек или на закачалка/кукла?', a: 'На човек', b: 'Закачалка или кукла',
    hint: 'Ист вид објава (карусел), ист ден во неделата, слични производи.',
  },
  {
    key: 'carousel-vs-single', question: 'Карусел или една слика?', a: 'Карусел (3–5 слики)', b: 'Една слика',
    hint: 'Ист производ или иста категорија, ист термин.',
  },
  {
    key: 'reel-vs-carousel', question: 'Reel или карусел?', a: 'Reel', b: 'Карусел',
    hint: 'Ист производ во двете, различни недели.',
  },
  {
    key: 'price-first-vs-last', question: 'Цената на првата или на последната слика?', a: 'Цена на првата', b: 'Цена на последната',
    hint: 'Карусел во двата случаи, ист термин.',
  },
  {
    key: 'evening-vs-noon', question: 'Навечер или напладне?', a: 'Навечер (19–21 ч.)', b: 'Напладне (12–14 ч.)',
    hint: 'Ист вид објава, слични производи; менува само часот.',
  },
  {
    key: 'humor-vs-plain', question: 'Текст со хумор или без?', a: 'Со хумор и емоџи', b: 'Кратко и сериозно',
    hint: 'Иста слика и производ; менува само текстот.',
  },
  {
    key: 'ad-vs-organic', question: 'Со реклама или без?', a: 'Со реклама', b: 'Без реклама',
    hint: 'Рекламирај објава што веќе сама добро оди; спореди ја со слична без реклама.',
  },
];

export const hypothesisOf = (key: string) => HYPOTHESES.find((h) => h.key === key);

/** Fewer posts than this on a side and a difference is luck, not an answer. */
export const MIN_POSTS_PER_SIDE = 3;
/** A side must beat the other by this much to be called the winner. */
export const WIN_MARGIN = 0.2;

export interface SideResult {
  posts: number;
  /** Posts with numbers entered. Only these are averaged. */
  measured: number;
  reach: number;
  saves: number;
  messages: number;
  storeVisits: number;
  orders: number;
  /** Per measured post. */
  avgReach: number;
  avgMessages: number;
  avgSaves: number;
  /** Messages + online orders per measured post: the score. */
  score: number;
}

export interface HypothesisResult {
  hypothesis: Hypothesis;
  a: SideResult;
  b: SideResult;
  verdict: 'a' | 'b' | 'tie' | 'early';
  /** How much the winner leads, 0.35 = 35%. */
  lead: number;
  message: string;
}

const isMeasured = (i: PlanItem) => i.status === 'posted' && [i.reach, i.messages, i.saves].some((v) => v !== null);

function side(items: PlanItem[], ordersOf: (i: PlanItem) => number): SideResult {
  const measured = items.filter(isMeasured);
  const sum = (f: (i: PlanItem) => number | null) => measured.reduce((a, i) => a + (f(i) ?? 0), 0);
  const reach = sum((i) => i.reach);
  const saves = sum((i) => i.saves);
  const messages = sum((i) => i.messages);
  const storeVisits = sum((i) => i.storeVisits);
  const orders = measured.reduce((a, i) => a + ordersOf(i), 0);
  const n = measured.length;
  return {
    posts: items.length, measured: n, reach, saves, messages, storeVisits, orders,
    avgReach: n ? reach / n : 0,
    avgMessages: n ? messages / n : 0,
    avgSaves: n ? saves / n : 0,
    score: n ? (messages + orders) / n : 0,
  };
}

export function compareHypothesis(h: Hypothesis, items: PlanItem[], ordersOf: (i: PlanItem) => number): HypothesisResult {
  const mine = items.filter((i) => i.hypothesis === h.key);
  const a = side(mine.filter((i) => i.variant === 'A'), ordersOf);
  const b = side(mine.filter((i) => i.variant === 'B'), ordersOf);

  if (a.measured < MIN_POSTS_PER_SIDE || b.measured < MIN_POSTS_PER_SIDE) {
    const need = Math.max(0, MIN_POSTS_PER_SIDE - a.measured) + Math.max(0, MIN_POSTS_PER_SIDE - b.measured);
    return {
      hypothesis: h, a, b, verdict: 'early', lead: 0,
      message: `Уште е рано: треба барем ${MIN_POSTS_PER_SIDE} објави со резултати од секоја страна (фалат ${need}). ${a.measured + b.measured} објави не се доказ.`,
    };
  }
  // Messages and orders decide; reach breaks a tie when neither side has any.
  const [sa, sb] = a.score + b.score > 0 ? [a.score, b.score] : [a.avgReach, b.avgReach];
  const hi = Math.max(sa, sb);
  const lo = Math.min(sa, sb);
  const lead = lo > 0 ? hi / lo - 1 : hi > 0 ? 1 : 0;
  if (lead < WIN_MARGIN) {
    return { hypothesis: h, a, b, verdict: 'tie', lead, message: 'Нема јасна разлика. Одбери го она што е полесно за правење, или пробај уште неколку објави.' };
  }
  const winner = sa > sb ? 'a' : 'b';
  const label = winner === 'a' ? h.a : h.b;
  return {
    hypothesis: h, a, b, verdict: winner, lead,
    message: `Победува „${label}“: ${Math.round(lead * 100)}% повеќе ${a.score + b.score > 0 ? 'пораки и нарачки' : 'дофат'} по објава. Правете го почесто.`,
  };
}

export interface MonthReview {
  planned: number;
  posted: number;
  measured: number;
  reach: number;
  messages: number;
  saves: number;
  storeVisits: number;
  orders: number;
  /** The posts that brought the most messages and orders, for "what to repeat". */
  best: Array<{ item: PlanItem; score: number }>;
  /** Kinds of post by messages per measured post. */
  byKind: Array<{ kind: PlanItem['kind']; measured: number; perPost: number }>;
  results: HypothesisResult[];
}

export function reviewMonth(items: PlanItem[], ordersOf: (i: PlanItem) => number): MonthReview {
  const posted = items.filter((i) => i.status === 'posted');
  const measured = posted.filter(isMeasured);
  const total = (f: (i: PlanItem) => number | null) => measured.reduce((a, i) => a + (f(i) ?? 0), 0);
  const score = (i: PlanItem) => (i.messages ?? 0) + ordersOf(i);

  const kinds = new Map<PlanItem['kind'], PlanItem[]>();
  for (const i of measured) kinds.set(i.kind, [...(kinds.get(i.kind) ?? []), i]);

  return {
    planned: items.filter((i) => i.status !== 'skipped').length,
    posted: posted.length,
    measured: measured.length,
    reach: total((i) => i.reach),
    messages: total((i) => i.messages),
    saves: total((i) => i.saves),
    storeVisits: total((i) => i.storeVisits),
    orders: posted.reduce((a, i) => a + ordersOf(i), 0),
    best: measured
      .map((item) => ({ item, score: score(item) }))
      .filter((b) => b.score > 0)
      .sort((x, y) => y.score - x.score || (y.item.reach ?? 0) - (x.item.reach ?? 0))
      .slice(0, 3),
    byKind: [...kinds.entries()]
      .map(([kind, list]) => ({ kind, measured: list.length, perPost: list.reduce((a, i) => a + score(i), 0) / list.length }))
      .sort((x, y) => y.perPost - x.perPost),
    results: HYPOTHESES
      .filter((h) => items.some((i) => i.hypothesis === h.key))
      .map((h) => compareHypothesis(h, items, ordersOf)),
  };
}
