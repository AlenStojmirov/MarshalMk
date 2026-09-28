/**
 * The content calendar: what to post on which day (Task 10.4, EPIC 10).
 *
 * The owner (2026-09-27): lay out next month, ideally three, and move it day
 * by day as the shop requires — but keep it written down. So there are two
 * layers:
 *
 *   * the frame — a theme per week for the next three months, derived from the
 *     season calendar (D-010) and the dates of the year. It is guidance, lives
 *     in code, and changes only when the calendar does;
 *   * the plan — one stored row per post (migration 012), proposed from the
 *     frame and the live catalogue, then accepted, moved, edited or dropped.
 *
 * The weekly rhythm is the advice to someone new to it: consistency beats
 * volume. Four feed posts a week (one a reel), stories on three days, one post
 * a week about how ordering works.
 *
 * Pure: no database, no browser. Days are local 'YYYY-MM-DD' strings.
 */

import { phaseForSeason, type Month } from './seasons';
import type { BucketKey, Combo, MarketingPlan, PostCandidate } from './marketing';
import type { CopyKind } from './post-copy';

export type PlanStatus = 'planned' | 'ready' | 'posted' | 'skipped';
export type PlanChannel = 'instagram' | 'facebook' | 'both';

export const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: 'Планирано',
  ready: 'Подготвено',
  posted: 'Објавено',
  skipped: 'Прескокнато',
};

export const CHANNEL_LABEL: Record<PlanChannel, string> = {
  both: 'Instagram и Facebook',
  instagram: 'Само Instagram',
  facebook: 'Само Facebook',
};

export interface PlanItem {
  id: string;
  day: string;
  kind: CopyKind;
  productIds: string[];
  title: string;
  body: string;
  status: PlanStatus;
  channel: PlanChannel;
  note: string;
  postUrl: string;
  originalDay: string;
  movedCount: number;
  /** 10.7: the question this post tests, and which side of it it is. */
  hypothesis: string;
  variant: '' | 'A' | 'B';
  /** 10.7: from Meta Insights, by hand. Null = not entered, which is not zero. */
  reach: number | null;
  saves: number | null;
  messages: number | null;
  storeVisits: number | null;
}

export type PlanDraft = Pick<PlanItem, 'day' | 'kind' | 'productIds' | 'title'>;

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Noon, so a daylight-saving shift can never push it into the day before. */
export function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(day: string, n: number): string {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

/** Monday of the week the day is in. */
export function weekStart(day: string): string {
  const d = dateOf(day);
  const back = (d.getDay() + 6) % 7;
  return addDays(day, -back);
}

export function monthDays(year: number, month0: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month0, 1, 12);
  while (d.getMonth() === month0) {
    out.push(dayOf(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const WEEKDAY_SHORT = ['Пон', 'Вто', 'Сре', 'Чет', 'Пет', 'Саб', 'Нед'];
export const MONTH_NAME = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
];

/** Monday = 0 … Sunday = 6. */
export const weekdayOf = (day: string) => (dateOf(day).getDay() + 6) % 7;

// ---------------------------------------------------------------------------
// The weekly rhythm
// ---------------------------------------------------------------------------

export interface RhythmSlot {
  weekday: number;
  kind: CopyKind;
  /** Where the product comes from. */
  source: 'theme' | 'lastPieces' | 'combo' | 'none';
}

/**
 * Four feed posts a week — Tuesday, Thursday (the reel), Friday (a combination
 * before the weekend, when people have time to order), Sunday (how ordering
 * works) — and stories on Monday, Wednesday and Saturday. Evenings and the
 * weekend are when this audience scrolls; measure after a month (10.7).
 */
export const WEEKLY_RHYTHM: RhythmSlot[] = [
  { weekday: 0, kind: 'story', source: 'lastPieces' },
  { weekday: 1, kind: 'carousel', source: 'theme' },
  { weekday: 2, kind: 'story', source: 'lastPieces' },
  { weekday: 3, kind: 'reel', source: 'theme' },
  { weekday: 4, kind: 'combo', source: 'combo' },
  { weekday: 5, kind: 'story', source: 'theme' },
  { weekday: 6, kind: 'trust', source: 'none' },
];

// ---------------------------------------------------------------------------
// The frame: a theme per week
// ---------------------------------------------------------------------------

export interface WeekTheme {
  weekStart: string;
  title: string;
  /** Buckets to draw the week's products from, first choice first. */
  focus: BucketKey[];
  /** Categories this week is about, first choice among the focus buckets. */
  categories: string[];
  note: string;
  /** A week tied to a date of the year, not only to the season. */
  event?: boolean;
}

const AW_TOPS = ['jackets', 'coats', 'vests'];
const AW_KNIT = ['blouses', 'turtleNecks', 'dzemper', 'halfZips', 'fullZips', 'hoodies', 'cardigans'];
const ALL_YEAR = ['shirts', 'kosula', 'jeans', 'pants', 'cargoTrousers'];
const SS = ['tShirts', 'oversizeTshirts', 'polos', 'shortsJeans'];
const FORMAL = ['blazers', 'suitJackets', 'suits'];

/** Black Friday: the day after the fourth Thursday of November. */
export function blackFriday(year: number): string {
  const d = new Date(year, 10, 1, 12);
  const toThursday = (4 - d.getDay() + 7) % 7;
  d.setDate(1 + toThursday + 21 + 1);
  return dayOf(d);
}

function monthOfDay(day: string): Month {
  return (dateOf(day).getMonth() + 1) as Month;
}

/**
 * The theme of the week starting on `start` (a Monday). Events first, then the
 * season: AW and SS phases from seasons.ts decide whether a week sells a
 * season at full price or clears one. Within a month the themes rotate, so four
 * weeks of autumn are not four weeks of jackets.
 */
export function weekTheme(start: string): WeekTheme {
  const end = addDays(start, 6);
  const month = monthOfDay(addDays(start, 3));
  const year = dateOf(start).getFullYear();
  const weekOfMonth = Math.floor((dateOf(addDays(start, 3)).getDate() - 1) / 7);
  const inWeek = (day: string) => day >= start && day <= end;
  const aw = phaseForSeason('AW', month);
  const ss = phaseForSeason('SS', month);

  const bf = blackFriday(year);
  if (inWeek(bf)) {
    return {
      weekStart: start, event: true,
      title: 'Black Friday · расчистување',
      focus: ['clearance', 'combos'],
      categories: [],
      note: `Петок ${Number(bf.slice(8))}.11. Попуст само за стоката за расчистување (мртва и летна). Јакните и плетивото се во сезона: полна цена, тие се продаваат и без попуст.`,
    };
  }
  const overlaps = (a: string, b: string) => start <= b && end >= a;
  const thursday = dateOf(addDays(start, 3));
  const holidays = overlaps(`${year}-12-25`, `${year + 1}-01-07`) || overlaps(`${year - 1}-12-25`, `${year}-01-07`);
  if (month === 12 && thursday.getDate() <= 24 && !holidays) {
    return {
      weekStart: start, event: true,
      title: 'Подароци за празниците',
      focus: ['combos', 'selling', 'season'],
      categories: [...AW_KNIT, ...ALL_YEAR],
      note: 'Идеи за подарок по цена: „до 1.500 ден.“, „до 2.500 ден.“. Спомни ги ваучерите. Последен ден за достава пред празниците: кажи го јасно.',
    };
  }
  if (holidays) {
    return {
      weekStart: start, event: true,
      title: 'Нова година и Божиќ',
      focus: ['season', 'selling'],
      categories: [...FORMAL, ...ALL_YEAR, ...AW_KNIT],
      note: 'Облека за празнични вечери: кошула, сако, темни фармерки. Честитка за купувачите во сторис.',
    };
  }
  if (month === 2 && inWeek(`${year}-02-14`)) {
    return {
      weekStart: start, event: true,
      title: 'Свети Валентин',
      focus: ['selling', 'combos'],
      categories: [...ALL_YEAR, ...AW_KNIT],
      note: 'Подарок за него: објава што ја таргетира и девојката што купува подарок.',
    };
  }
  if ((month === 5 || month === 6) && weekOfMonth % 2 === 0) {
    return {
      weekStart: start, event: true,
      title: 'Матури и свадби',
      focus: ['selling', 'season'],
      categories: [...FORMAL, 'shirts', 'pants'],
      note: 'Сако, кошула, панталони: „комплет за матура“. Покажи како се комбинираат.',
    };
  }

  // Clearing a season that just shut goes first: its first two weeks, in the
  // month it turns late and the month after. Later than that nobody is
  // shopping for it — shorts in November are a clearance for the shop floor.
  const prev = (((month + 10) % 12) + 1) as Month;
  const clearing = (season: 'SS' | 'AW') => {
    const now = phaseForSeason(season, month);
    return now === 'late' || (now === 'endofseason' && phaseForSeason(season, prev) === 'late');
  };
  const CLEARING_WEEKS = 2;
  if (clearing('SS') && weekOfMonth < CLEARING_WEEKS) {
    return {
      weekStart: start,
      title: 'Последно летно расчистување',
      focus: ['clearance', 'season'],
      categories: SS,
      note: 'Летото заврши: попуст по скалилото, со јасен крај („до недела“). Покрај тоа, есента по полна цена.',
    };
  }
  if (clearing('AW') && weekOfMonth < CLEARING_WEEKS) {
    return {
      weekStart: start,
      title: 'Крај на зимата · расчистување',
      focus: ['clearance', 'season'],
      categories: [...AW_TOPS, ...AW_KNIT],
      note: 'Зимата заврши: прво плитко намалување (−20%), па подлабоко. Пролетта по полна цена.',
    };
  }

  // The rotation starts after the clearing weeks, so the season's lead (jackets
  // in October) is not the week that gets pushed to the end of the month.
  const offset = clearing('SS') || clearing('AW') ? CLEARING_WEEKS : 0;
  const rotate = <T,>(list: T[]) => list[Math.max(0, weekOfMonth - offset) % list.length];

  if (aw === 'preseason' || aw === 'inseason') {
    const t = rotate([
      { title: 'Јакни', categories: AW_TOPS, note: 'Сезоната на јакни: полна цена. Покажи ја на човек, во движење.' },
      { title: 'Плетиво и слоеви', categories: AW_KNIT, note: 'Џемпери, блузи, ролки. Покажи ги слоевите: маица, џемпер, јакна.' },
      { title: 'Кошули за секој ден', categories: ALL_YEAR, note: 'Кошулите се продаваат цела година. Една кошула, три комбинации.' },
      { title: 'Комплети', categories: [...AW_KNIT, ...ALL_YEAR], note: 'Горен и долен дел над 3.000 ден., доставата е бесплатна.' },
    ]);
    return { weekStart: start, focus: ['season', 'selling', 'combos'], ...t };
  }
  if (ss === 'preseason' || ss === 'inseason') {
    const t = rotate([
      { title: 'Маици и поло', categories: ['tShirts', 'polos', 'oversizeTshirts'], note: 'Летната сезона: полна цена. Сонце, светли бои, кратко видео.' },
      { title: 'Кошули за топли денови', categories: ['shirts', 'kosula', 'shortSleevedShirt'], note: 'Лесни кошули, кратки ракави. Кошулата е целогодишна: без попуст.' },
      { title: 'Шорцеви и лесни панталони', categories: ['shortsJeans', 'pants', 'cargoTrousers'], note: 'Долниот дел за летото, со маица: комплет.' },
      { title: 'Комплети', categories: [...SS, ...ALL_YEAR], note: 'Горен и долен дел над 3.000 ден., доставата е бесплатна.' },
    ]);
    return { weekStart: start, focus: ['season', 'selling', 'combos'], ...t };
  }
  return {
    weekStart: start,
    title: 'Целогодишни и докажани',
    focus: ['selling', 'combos', 'season'],
    categories: ALL_YEAR,
    note: 'Меѓу две сезони: кошули, фармерки, панталони. Докажаното прво.',
  };
}

/** The frame for the weeks that touch the next `months` months from `from`. */
export function frame(from: string, months = 3): WeekTheme[] {
  const first = weekStart(from);
  const d = dateOf(from);
  const until = dayOf(new Date(d.getFullYear(), d.getMonth() + months, d.getDate(), 12));
  const out: WeekTheme[] = [];
  for (let w = first; w <= until; w = addDays(w, 7)) out.push(weekTheme(w));
  return out;
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

/**
 * A month of posts from the frame and the live catalogue.
 *
 * Days already holding a post in the same lane (feed or story) are left alone,
 * so proposing twice does not double a week. A product goes into the feed once a month and
 * into stories once a week; the ones ready for a carousel (3+ photos) first.
 * Where nothing fits a slot, the slot stays empty rather than repeating a
 * product — an honest gap the marketing employee can fill after the shoot.
 */
export function proposeMonth(
  days: string[],
  plan: MarketingPlan,
  existing: Array<Pick<PlanItem, 'day' | 'kind' | 'productIds'>>,
  today: string,
): PlanDraft[] {
  // A day's feed slot is taken by any feed post, whatever it became (a carousel
  // turned clearance, a combination turned carousel); stories have their own lane.
  const lane = (k: CopyKind) => (k === 'story' ? 'story' : 'feed');
  const taken = new Set(existing.map((e) => `${e.day}:${lane(e.kind)}`));
  const usedFeed = new Set(existing.filter((e) => e.kind !== 'story').flatMap((e) => e.productIds));
  const storyWeek = new Map<string, Set<string>>();
  const storyUses = new Map<string, number>();
  for (const e of existing) if (e.kind === 'story') for (const id of e.productIds) storyUses.set(id, (storyUses.get(id) ?? 0) + 1);
  const usedCombos = new Set<string>();
  const drafts: PlanDraft[] = [];
  const readyFirst = (a: PostCandidate, b: PostCandidate) =>
    Number(b.readiness === 'carousel') - Number(a.readiness === 'carousel');

  for (const day of days) {
    if (day < today) continue;
    const theme = weekTheme(weekStart(day));
    for (const slot of WEEKLY_RHYTHM.filter((s) => s.weekday === weekdayOf(day))) {
      if (taken.has(`${day}:${lane(slot.kind)}`)) continue;
      // No combination left: the Friday post becomes a carousel of one piece.
      let kind: CopyKind = slot.kind;

      if (slot.source === 'none') {
        drafts.push({ day, kind, productIds: [], title: 'Доверба: како се нарачува' });
        continue;
      }

      if (slot.source === 'combo') {
        const combo = plan.combos.find((c: Combo) => {
          const k = c.top.product.id + '+' + c.bottom.product.id;
          return !usedCombos.has(k) && !usedFeed.has(c.top.product.id) && !usedFeed.has(c.bottom.product.id);
        });
        if (combo) {
          usedCombos.add(combo.top.product.id + '+' + combo.bottom.product.id);
          usedFeed.add(combo.top.product.id);
          usedFeed.add(combo.bottom.product.id);
          drafts.push({
            day, kind: 'combo',
            productIds: [combo.top.product.id, combo.bottom.product.id],
            title: `${combo.top.label} + ${combo.bottom.label}`,
          });
          continue;
        }
        kind = 'carousel';
      }

      const isStory = kind === 'story';
      const week = theme.weekStart;
      const seenThisWeek = storyWeek.get(week) ?? new Set<string>();
      const buckets: BucketKey[] = slot.source === 'lastPieces' ? ['lastPieces', ...theme.focus] : theme.focus;
      // Every bucket of the week in order; the theme's categories first across
      // all of them, then anything the buckets offer.
      const pool = buckets
        .filter((b) => b !== 'combos')
        .flatMap((b) => [...plan.byBucket[b]].sort(readyFirst))
        .filter((c) => (isStory ? !seenThisWeek.has(c.product.id) : !usedFeed.has(c.product.id)))
        .filter((c) => c.photos > 0);
      // Stories rotate: the product least often in a story so far goes first.
      if (isStory) pool.sort((a, b) => (storyUses.get(a.product.id) ?? 0) - (storyUses.get(b.product.id) ?? 0));
      // The theme's categories in their own order (shirts before trousers in a shirt week).
      const pick =
        theme.categories.map((cat) => pool.find((c) => c.product.category === cat)).find(Boolean) ?? pool[0];
      if (!pick) continue;

      const clearing = pick.discount.allowed;
      const finalKind: CopyKind = !isStory && clearing ? 'clearance' : kind;
      if (isStory) {
        storyUses.set(pick.product.id, (storyUses.get(pick.product.id) ?? 0) + 1);
        seenThisWeek.add(pick.product.id);
        storyWeek.set(week, seenThisWeek);
      } else {
        usedFeed.add(pick.product.id);
      }
      drafts.push({ day, kind: finalKind, productIds: [pick.product.id], title: pick.label });
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

/** What changed since a post was planned. A posted or skipped post has none. */
export function itemWarnings(item: PlanItem, byId: Map<string, PostCandidate>): string[] {
  if (item.status === 'posted' || item.status === 'skipped') return [];
  const out: string[] = [];
  for (const id of item.productIds) {
    const c = byId.get(id);
    if (!c) {
      out.push('Производот повеќе не е на сајтот (распродаден или скриен).');
      continue;
    }
    if (item.kind === 'clearance' && !c.discount.allowed) {
      out.push(`${c.label}: повеќе не е за расчистување, објави го по полна цена.`);
    }
    if (item.kind !== 'clearance' && item.kind !== 'story' && c.discount.allowed) {
      out.push(`${c.label}: сезоната му заврши, сега е за расчистување.`);
    }
    if (c.photos === 0) out.push(`${c.label}: нема слика.`);
  }
  return out;
}

/** How well the month's plan held. */
export function planStats(items: PlanItem[]) {
  const count = (s: PlanStatus) => items.filter((i) => i.status === s).length;
  return {
    total: items.length,
    planned: count('planned'),
    ready: count('ready'),
    posted: count('posted'),
    skipped: count('skipped'),
    moved: items.filter((i) => i.movedCount > 0).length,
  };
}
