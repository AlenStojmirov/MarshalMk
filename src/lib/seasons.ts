/**
 * Season calendar — which wardrobe sells when, and what to do about it today.
 *
 * Every number here was measured from 2.047 priced sales across 25 months of
 * `products.sold[]`, not assumed. "Warm share" is the share of a category's
 * sales falling in April–September; the figures are quoted per category so a
 * later reader can tell a measurement from a guess, and so a category with six
 * sales is never mistaken for one with three hundred.
 *
 * Two findings shaped the shape of this file.
 *
 * **Season belongs to the raw category, not the group.** The reporting groups
 * mix seasons and the average then describes nothing: "Кошули" holds `shirts`
 * (52% warm, sells all twelve months) together with `blouses` (9% warm, a
 * winter item), and "Фармерки" holds `jeans` (36%, year-round) together with
 * `shortsJeans` (92%, dead from October to April). A group-level season would
 * have marked down jeans in September and held shorts through the winter.
 *
 * **August–September is two seasons at once.** Summer is being cleared while
 * autumn is being bought, and the same month therefore carries opposite
 * instructions for different rails. That is why a phase is computed per
 * category rather than per calendar.
 */

/** Calendar months are 1–12 throughout this file — never zero-based. */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type Season = 'SS' | 'AW' | 'ALL';

/**
 * Where in its own season a category sits right now.
 *
 *  preseason    — the window opens soon: publish, photograph, buy. Full price.
 *  inseason     — selling. No discount belongs here; a discount now is margin
 *                 given away on stock that would have sold anyway.
 *  late         — the window is closing. First and shallowest markdown.
 *  endofseason  — the window has closed. Deep markdown; the money has to come
 *                 back while there is still a year to use it in.
 *  offseason    — far from the window. Never buy. Whatever is left is either
 *                 held for next year at the cost of a year's capital, or sold
 *                 for what it fetches.
 *  always       — no weather window; judge it on age and sales instead.
 */
export type SeasonPhase =
  | 'preseason'
  | 'inseason'
  | 'late'
  | 'endofseason'
  | 'offseason'
  | 'always';

export interface SeasonProfile {
  season: Season;
  /** Share of this category's sales in Apr–Sep, measured (0–1). */
  warmShare: number;
  /** Priced sales behind that share. Under 20 the assignment is a judgement. */
  measured: number;
  /** The three best months by units, measured. Empty when nothing sold. */
  peak: Month[];
}

/**
 * Per raw category. Keys are the `products.category` values as stored — all 22
 * merchandise categories that exist today, including the two orphans
 * (`dzemper`, `kosula`) that the reporting group map does not cover.
 */
export const SEASON_BY_CATEGORY: Record<string, SeasonProfile> = {
  // ---- summer -------------------------------------------------------------
  // Polos and shorts are the cleanest signal in the whole dataset: both are
  // effectively absent for half the year.
  polos: { season: 'SS', warmShare: 0.96, measured: 81, peak: [7, 8, 6] },
  shortsJeans: { season: 'SS', warmShare: 0.92, measured: 90, peak: [7, 8, 6] },
  tShirts: { season: 'SS', warmShare: 0.79, measured: 287, peak: [4, 9, 8] },
  // Follows tShirts on judgement — three sales cannot carry an assignment.
  oversizeTshirts: { season: 'SS', warmShare: 0.79, measured: 3, peak: [] },

  // ---- autumn / winter ----------------------------------------------------
  turtleNecks: { season: 'AW', warmShare: 0.0, measured: 16, peak: [1, 2, 12] },
  dzemper: { season: 'AW', warmShare: 0.06, measured: 31, peak: [11, 1, 2] },
  halfZips: { season: 'AW', warmShare: 0.07, measured: 45, peak: [12, 1, 11] },
  // The surprise: grouped under "Кошули" with the year-round shirts, but 91%
  // of its 201 sales land in the cold half. A long-sleeved winter item.
  blouses: { season: 'AW', warmShare: 0.09, measured: 201, peak: [11, 10, 12] },
  hoodies: { season: 'AW', warmShare: 0.1, measured: 41, peak: [2, 11, 1] },
  jackets: { season: 'AW', warmShare: 0.17, measured: 118, peak: [10, 11, 2] },
  cardigans: { season: 'AW', warmShare: 0.06, measured: 6, peak: [] },
  coats: { season: 'AW', warmShare: 0.0, measured: 2, peak: [] },

  // ---- year-round ---------------------------------------------------------
  // Present in all twelve months. A lean is not a season: jeans sell more in
  // winter and trousers more in summer, but neither ever stops.
  shirts: { season: 'ALL', warmShare: 0.52, measured: 348, peak: [7, 5, 12] },
  jeans: { season: 'ALL', warmShare: 0.36, measured: 313, peak: [12, 11, 2] },
  accessories: { season: 'ALL', warmShare: 0.44, measured: 197, peak: [1, 3, 9] },
  pants: { season: 'ALL', warmShare: 0.67, measured: 132, peak: [5, 7, 8] },
  cargoTrousers: { season: 'ALL', warmShare: 0.48, measured: 88, peak: [4, 10, 12] },
  // Occasion wear answers to weddings and graduations, not to weather.
  suitJackets: { season: 'ALL', warmShare: 0.4, measured: 10, peak: [] },
  blazers: { season: 'ALL', warmShare: 0.4, measured: 7, peak: [] },
  suits: { season: 'ALL', warmShare: 0.4, measured: 5, peak: [] },
  // 64% warm across 22 sales reads like a light vest rather than a winter one,
  // but the volume is too thin to call. Left year-round on purpose: a wrong
  // 'AW' would hold it off the shelf for six months on a guess.
  vests: { season: 'ALL', warmShare: 0.64, measured: 22, peak: [] },
  // A duplicate spelling of `shirts` (6 models, no cost recorded). Seasoned the
  // same way so it cannot fall through, and flagged in docs/DECISIONS.md.
  kosula: { season: 'ALL', warmShare: 0.52, measured: 4, peak: [] },
};

/** Not merchandise — vouchers have no season and no stock value. */
export const NON_MERCHANDISE = new Set(['vaucer']);

/** Below this many measured sales, the season is a judgement, not a finding. */
export const CONFIDENCE_MIN = 20;

interface Window {
  preseason: Month[];
  inseason: Month[];
  late: Month[];
  endofseason: Month[];
}

/**
 * The two windows, set from the measured peaks rather than from the northern
 * retail calendar — the local season runs later than the textbook one.
 *
 * Summer holds into September: `tShirts` sells more in September (50) than in
 * July (26), so a September markdown on t-shirts would be giving away the
 * second-best month of the year. Shorts, by contrast, stop dead in September —
 * which the per-category peaks show and the shared window cannot.
 *
 * Winter holds into February: February is the third-best month for `jackets`
 * (19) and the second-best for `blouses` (32). The first markdown therefore
 * waits for March rather than following the calendar into the new year.
 */
const WINDOWS: Record<'SS' | 'AW', Window> = {
  SS: {
    preseason: [2, 3],
    inseason: [4, 5, 6, 7, 8],
    late: [9],
    endofseason: [10, 11],
  },
  AW: {
    preseason: [8, 9],
    inseason: [10, 11, 12, 1, 2],
    late: [3],
    endofseason: [4, 5],
  },
};

/** The month a date falls in, as 1–12. */
export function monthOf(date: Date | number = Date.now()): Month {
  const d = date instanceof Date ? date : new Date(date);
  return (d.getMonth() + 1) as Month;
}

/** Which phase a season is in during a given month. */
export function phaseForSeason(season: Season, month: Month): SeasonPhase {
  if (season === 'ALL') return 'always';
  const w = WINDOWS[season];
  if (w.inseason.includes(month)) return 'inseason';
  if (w.late.includes(month)) return 'late';
  if (w.endofseason.includes(month)) return 'endofseason';
  if (w.preseason.includes(month)) return 'preseason';
  return 'offseason';
}

/** Season profile for a raw category, or null when it is not merchandise. */
export function seasonOf(category: string): SeasonProfile | null {
  if (NON_MERCHANDISE.has(category)) return null;
  return SEASON_BY_CATEGORY[category] ?? null;
}

/** Phase for a raw category in a given month. Unknown categories read 'always'. */
export function phaseOf(category: string, month: Month = monthOf()): SeasonPhase {
  const p = seasonOf(category);
  if (!p) return 'always';
  return phaseForSeason(p.season, month);
}

/**
 * The markdown a phase calls for, as a percentage off the list price.
 *
 * The ladder is the one in docs/TURNAROUND.md — shallow first, and early. A cut
 * taken in the closing weeks of a season recovers more cash than a deeper one
 * taken after the window shuts, because the stock still has buyers and the
 * money still has a season to be spent in.
 *
 * `endofseason` deepens across its two months: the first is the last chance at
 * a real price, the second is about the money coming back at all.
 */
export function suggestedMarkdown(phase: SeasonPhase, month?: Month): number {
  switch (phase) {
    case 'late':
      return 20;
    case 'endofseason': {
      if (month === undefined) return 35;
      // Second month of the window goes deeper than the first.
      const isSecond = month === 11 || month === 5;
      return isSecond ? 50 : 35;
    }
    case 'offseason':
      // Anything still here has already cost a year of capital.
      return 50;
    default:
      return 0;
  }
}

/**
 * Whether new stock of this kind should be bought today.
 *
 * Proven demand is not by itself a reason to buy: a polo shirt that sold out in
 * August has proven its demand and is still the wrong purchase in September,
 * because the next buyer for it arrives in April. Restocking against a closing
 * window turns a success into eight months of dead capital — the exact mistake
 * that filled the shelves in the first place.
 */
export function shouldBuyNow(phase: SeasonPhase): boolean {
  return phase === 'preseason' || phase === 'inseason' || phase === 'always';
}

/** When the buying window for a season opens, for copy. */
export const BUY_WINDOW_LABEL: Record<Season, string> = {
  SS: 'февруари–март',
  AW: 'август–септември',
  ALL: 'во секое време',
};

/** Short Macedonian label for a phase. */
export const PHASE_LABEL: Record<SeasonPhase, string> = {
  preseason: 'Пред сезона',
  inseason: 'Во сезона',
  late: 'Крај на сезона',
  endofseason: 'Сезоната заврши',
  offseason: 'Вон сезона',
  always: 'Целогодишно',
};

/** What the phase actually asks you to do. */
export const PHASE_ACTION: Record<SeasonPhase, string> = {
  preseason: 'Објави, фотографирај, дополни. Полна цена — побарувачката доаѓа.',
  inseason: 'Полна цена. Попуст сега е маржа подарена на стока што и онака ќе се продаде.',
  late: 'Прво и плитко намалување. Уште има купувачи.',
  endofseason: 'Длабоко намалување. Парите треба да се вратат додека има година пред себе.',
  offseason: 'Не купувај. Што останало веќе чини една година капитал.',
  always: 'Нема временски прозорец — судено по возраст и продажби, не по сезона.',
};

export const SEASON_LABEL: Record<Season, string> = {
  SS: 'Летна гардероба',
  AW: 'Зимска гардероба',
  ALL: 'Целогодишна',
};

export const MONTH_LABEL = [
  'јануари', 'февруари', 'март', 'април', 'мај', 'јуни',
  'јули', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

export const MONTH_SHORT = ['Јан', 'Фев', 'Мар', 'Апр', 'Мај', 'Јун', 'Јул', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
