/**
 * What to post, and with which argument (Task 10.1, EPIC 10).
 *
 * Measured 2026-09-27: 74 of the 82 products on the site are on sale. When
 * everything is discounted, "попуст" in a post says nothing, and marketing
 * that shouts it would amplify exactly the leak A1 is closing
 * (docs/TURNAROUND.md). So this sorts the live catalogue into buckets that each
 * carry a different reason to post — the season opening, what sells, the last
 * piece of a size, two pieces that clear free delivery, clearance — and a
 * discount is something only the clearance bucket may talk about.
 *
 * The discount rule reads the season, the age and the sales, never the cost:
 * the marketing role does not see margins (D-021), and the rule must come out
 * the same for it as for the owner.
 *
 * Pure: no database, no browser. Thresholds are the named constants below.
 */

import type { Product, ProductAttributes } from '@/types';
import { phaseOf, monthOf, suggestedMarkdown, NON_MERCHANDISE, type Month, type SeasonPhase } from './seasons';
import { velocityOf, type VelocityMetrics } from './velocity';
import { photoCount, sizesOnShelf } from './catalog-gaps';
import { getEffectivePrice, isOnSale, getPercentOff } from './pricing';
import { templateOf } from './attributes';
import { SHIPPING_CONFIG } from '@/config/shipping';

const DAY = 86_400_000;

/** A carousel wants front, back and a detail; fewer is a single-photo post. */
export const CAROUSEL_MIN_PHOTOS = 3;
/** On the shelf this long or less counts as new. */
export const NEW_DAYS = 30;
/** A size with this many pieces or fewer is a "last piece" story. */
export const LAST_PIECES_MAX = 1;
/** Two pieces that together reach this cost the customer no delivery. */
export const COMBO_TARGET = SHIPPING_CONFIG.freeShippingThreshold;
/** How many combinations to offer at once — a week's worth, not a catalogue. */
export const COMBO_LIMIT = 8;
/** First step of the ageing ladder (/admin/aging) for dead stock with no season to lean on. */
export const DEAD_MARKDOWN = 20;

export type BucketKey = 'season' | 'selling' | 'lastPieces' | 'combos' | 'clearance' | 'new';

export type PostKind = 'carousel' | 'reel' | 'story' | 'combo' | 'clearance';

export const POST_KIND_LABEL: Record<PostKind, string> = {
  carousel: 'Карусел',
  reel: 'Reel',
  story: 'Сторис',
  combo: 'Карусел · комбинација',
  clearance: 'Карусел · расчистување',
};

export interface BucketInfo {
  key: BucketKey;
  title: string;
  /** For someone new to marketing: why this, and why now. */
  why: string;
  kinds: PostKind[];
}

export const BUCKETS: BucketInfo[] = [
  {
    key: 'season',
    title: 'Сезоната почнува',
    why: 'Луѓето токму сега ја бараат оваа стока. Полна цена: аргументот е „стигна време за ова“, не попустот.',
    kinds: ['carousel', 'reel'],
  },
  {
    key: 'selling',
    title: 'Се продава',
    why: 'Се продавало во последните 90 дена, значи на купувачите им се допаѓа. Докажаното се објавува прво.',
    kinds: ['carousel', 'reel'],
  },
  {
    key: 'combos',
    title: `Комбинации до ${COMBO_TARGET.toLocaleString('mk-MK')} ден.`,
    why: `Горен и долен дел што заедно минуваат ${COMBO_TARGET.toLocaleString('mk-MK')} ден., па доставата е бесплатна. Една објава, две парчиња во кошничката.`,
    kinds: ['combo'],
  },
  {
    key: 'lastPieces',
    title: 'Последни парчиња',
    why: 'Се продава, а од некоја големина остана едно парче. Тоа е вистина, не трик, и е добра сторис: „последна L“.',
    kinds: ['story'],
  },
  {
    key: 'clearance',
    title: 'Расчистување',
    why: 'Сезоната ѝ заврши или стои предолго без продажба. Само тука објавата смее да зборува за попуст.',
    kinds: ['clearance', 'story'],
  },
  {
    key: 'new',
    title: 'Ново',
    why: 'Штотуку стигнато. Новото е најдобар повод за reel: распакување, облекување.',
    kinds: ['reel', 'carousel'],
  },
];

export type Readiness = 'carousel' | 'single' | 'noPhoto';

export const READINESS_LABEL: Record<Readiness, string> = {
  carousel: `${CAROUSEL_MIN_PHOTOS}+ слики`,
  single: 'малку слики',
  noPhoto: 'нема слика',
};

export interface DiscountRule {
  /** May a post talk about a discount? */
  allowed: boolean;
  /** How deep the ladder says the markdown should be now; null when none is due. */
  ladderPct: number | null;
  /** On sale today although no markdown is due — the owner's call (A1), not the post's. */
  saleOutOfSeason: boolean;
  reason: string;
}

export interface PostCandidate {
  product: Product;
  /** "Кошула #BT045" — Macedonian noun, internal code. Never the brand. */
  label: string;
  phase: SeasonPhase;
  metrics: VelocityMetrics;
  photos: number;
  readiness: Readiness;
  hasComposition: boolean;
  hasColor: boolean;
  price: number;
  listPrice: number;
  percentOff: number;
  /** Sizes on the shelf, with pieces. */
  sizes: Array<{ size: string; quantity: number }>;
  /** Sizes down to their last piece(s). */
  lastSizes: string[];
  discount: DiscountRule;
  isNew: boolean;
  buckets: BucketKey[];
}

export interface Combo {
  top: PostCandidate;
  bottom: PostCandidate;
  total: number;
}

export interface MarketingPlan {
  candidates: PostCandidate[];
  byBucket: Record<BucketKey, PostCandidate[]>;
  combos: Combo[];
  /** Hidden with stock: waiting for photos, not postable yet. */
  hiddenInStock: number;
  hiddenWithPhoto: number;
  /** Live, on sale, no markdown due — the A1 list, for the owner. */
  saleOutOfSeason: PostCandidate[];
  month: Month;
}

/** Tops and bottoms for a combination. Outerwear goes on top of a top — later. */
const TOPS = new Set([
  'shirts', 'kosula', 'shortSleevedShirt', 'tShirts', 'oversizeTshirts', 'polos', 'blouses',
  'turtleNecks', 'dzemper', 'halfZips', 'fullZips', 'hoodies', 'cardigans',
]);
const BOTTOMS = new Set(['jeans', 'pants', 'cargoTrousers', 'shortsJeans']);

/** Phases in which a product sells at its own price. */
const SELLING_PHASES: SeasonPhase[] = ['preseason', 'inseason', 'always'];
/** Phases in which the ladder calls for a markdown. */
const MARKDOWN_PHASES: SeasonPhase[] = ['late', 'endofseason', 'offseason'];

export function isLive(p: Product): boolean {
  return p.isVisible !== false && sizesOnShelf(p.sizes).length > 0;
}

export function marketingLabel(p: Product): string {
  return `${templateOf(p.category).noun} ${p.name}`.trim();
}

/**
 * May a post talk about a discount on this product?
 *
 * Yes when the season calendar calls for a markdown (D-010), or when the model
 * is dead — a year on the shelf without a sale has had its season. Everything
 * else is posted on its own merits; if it is on sale anyway, the post shows the
 * price the site shows (never a price the customer will not find) but does not
 * make the discount the message, and the owner sees it in the A1 list.
 */
export function discountRule(p: Product, phase: SeasonPhase, m: VelocityMetrics, month: Month): DiscountRule {
  const onSale = isOnSale(p);
  if (MARKDOWN_PHASES.includes(phase)) {
    return { allowed: true, ladderPct: suggestedMarkdown(phase, month), saleOutOfSeason: false, reason: 'сезоната ѝ заврши' };
  }
  if (m.klass === 'dead') {
    return { allowed: true, ladderPct: DEAD_MARKDOWN, saleOutOfSeason: false, reason: 'година без продажба' };
  }
  return {
    allowed: false,
    ladderPct: null,
    saleOutOfSeason: onSale,
    reason: phase === 'always' ? 'целогодишна стока' : 'во сезона',
  };
}

export function toCandidate(
  p: Product,
  attrs: ProductAttributes | undefined,
  now: number = Date.now(),
  month: Month = monthOf(now),
): PostCandidate {
  const phase = phaseOf(p.category, month);
  const metrics = velocityOf(p, now, month);
  const photos = photoCount(p.imageUrl, p.images);
  const shelf = sizesOnShelf(p.sizes).map((s) => ({ size: s.size, quantity: Number(s.quantity) }));
  const since = p.firstReceivedAt ?? p.createdAt;
  const ageDays = since ? (now - new Date(since).getTime()) / DAY : Infinity;
  const discount = discountRule(p, phase, metrics, month);
  const isNew = ageDays <= NEW_DAYS;
  const lastSizes = shelf.filter((s) => s.quantity <= LAST_PIECES_MAX).map((s) => s.size);

  const buckets: BucketKey[] = [];
  if (discount.allowed) buckets.push('clearance');
  else {
    if (phase === 'preseason' || phase === 'inseason') buckets.push('season');
    if (metrics.sold90 > 0) buckets.push('selling');
  }
  // With one piece per size bought (the flat curve), nearly every model has a
  // last piece somewhere; it is a story only where someone is still buying.
  if (lastSizes.length > 0 && metrics.sold90 > 0) buckets.push('lastPieces');
  if (isNew) buckets.push('new');

  return {
    product: p,
    label: marketingLabel(p),
    phase,
    metrics,
    photos,
    readiness: photos >= CAROUSEL_MIN_PHOTOS ? 'carousel' : photos > 0 ? 'single' : 'noPhoto',
    hasComposition: (attrs?.composition?.length ?? 0) > 0,
    hasColor: !!(attrs?.color || p.color?.trim()),
    price: getEffectivePrice(p),
    listPrice: p.price,
    percentOff: getPercentOff(p),
    sizes: shelf,
    lastSizes,
    discount,
    isNew,
    buckets,
  };
}

const READY_RANK: Record<Readiness, number> = { carousel: 0, single: 1, noPhoto: 2 };

/** Ready to post first, then what sells, then the most stock to move. */
function byPostability(a: PostCandidate, b: PostCandidate): number {
  return (
    READY_RANK[a.readiness] - READY_RANK[b.readiness] ||
    b.metrics.sold90 - a.metrics.sold90 ||
    b.metrics.onHand - a.metrics.onHand ||
    a.label.localeCompare(b.label, 'mk')
  );
}

/**
 * Pairs of a top and a bottom that together clear free delivery.
 *
 * Only pieces selling at their own price: a combination is a reason to buy two
 * things, not a second discount. Each piece is used once, and each top takes the
 * bottom that clears the threshold with the least to spare — the cheapest way
 * over, which is the one a customer will actually take.
 */
export function buildCombos(candidates: PostCandidate[], limit = COMBO_LIMIT): Combo[] {
  const usable = (c: PostCandidate) => !c.discount.allowed && SELLING_PHASES.includes(c.phase) && c.photos > 0;
  const tops = candidates.filter((c) => usable(c) && TOPS.has(c.product.category)).sort(byPostability);
  const bottoms = candidates.filter((c) => usable(c) && BOTTOMS.has(c.product.category)).sort(byPostability);
  const used = new Set<string>();
  const combos: Combo[] = [];
  for (const top of tops) {
    if (combos.length >= limit) break;
    let best: PostCandidate | undefined;
    for (const b of bottoms) {
      if (used.has(b.product.id)) continue;
      const total = top.price + b.price;
      if (total < COMBO_TARGET) continue;
      if (!best || total < top.price + best.price) best = b;
    }
    if (!best) continue;
    used.add(best.product.id);
    combos.push({ top, bottom: best, total: top.price + best.price });
  }
  return combos;
}

export function buildMarketingPlan(
  products: Product[],
  attrs: Map<string, ProductAttributes>,
  now: number = Date.now(),
): MarketingPlan {
  const month = monthOf(now);
  const merch = products.filter((p) => !NON_MERCHANDISE.has(p.category));
  const live = merch.filter(isLive);
  const hidden = merch.filter((p) => p.isVisible === false && sizesOnShelf(p.sizes).length > 0);

  const candidates = live.map((p) => toCandidate(p, attrs.get(p.id), now, month)).sort(byPostability);
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b.key, [] as PostCandidate[]])) as Record<BucketKey, PostCandidate[]>;
  for (const c of candidates) for (const k of c.buckets) byBucket[k].push(c);

  const combos = buildCombos(candidates);
  byBucket.combos = combos.flatMap((c) => [c.top, c.bottom]);

  return {
    candidates,
    byBucket,
    combos,
    hiddenInStock: hidden.length,
    hiddenWithPhoto: hidden.filter((p) => photoCount(p.imageUrl, p.images) > 0).length,
    saleOutOfSeason: candidates.filter((c) => c.discount.saleOutOfSeason),
    month,
  };
}
