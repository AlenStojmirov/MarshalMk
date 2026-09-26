/**
 * What a product is missing before a customer can buy it blind (EPIC 9).
 *
 * One definition, used by `npm run catalog:audit` and the /admin/catalog
 * screen, so the report and the screen can never disagree about what "ready"
 * means: photos, composition, colour, fit, size advice, and — for garments —
 * measurements of every size on the shelf.
 *
 * Pure: no database, no browser.
 */

import type { ProductAttributes, ProductSize } from '@/types';
import { phaseOf, type SeasonPhase } from './seasons';
import { templateOf } from './attributes';

/** Front, back, fabric detail, composition label. */
export const FULL_PHOTO_SET = 4;
/** Hidden and never sold after this long → clearance, not content work. */
export const CLEARANCE_AGE_DAYS = 90;

export type CompositionState = 'structured' | 'in-description' | 'missing';

export interface CatalogGaps {
  photos: number;
  composition: CompositionState;
  color: boolean;
  fit: boolean;
  /** Categories without cuts (belts, accessories) have nothing to choose. */
  needsFit: boolean;
  sizeAdvice: boolean;
  needsMeasurements: boolean;
  /** Every size on the shelf has at least one measurement. */
  measured: boolean;
  /** Short Macedonian labels of what is missing, in order of the columns. */
  missing: string[];
  ready: boolean;
}

export interface GapInput {
  category: string;
  description?: string | null;
  /** The old free-text colour on `products`; counts until 9.10 merges. */
  color?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  sizes?: Pick<ProductSize, 'size' | 'quantity'>[] | null;
}

const isUsableUrl = (u: string | null | undefined) => !!u && /^(https?:\/\/|\/)/.test(u.trim());

/** Distinct usable image urls. Local files have already replaced these (product-images.ts). */
export function photoCount(imageUrl?: string | null, images?: string[] | null): number {
  return new Set([imageUrl, ...(images ?? [])].filter(isUsableUrl)).size;
}

export function sizesOnShelf(sizes?: Pick<ProductSize, 'size' | 'quantity'>[] | null) {
  return (sizes ?? []).filter((s) => Number(s.quantity) >= 1);
}

export function catalogGaps(p: GapInput, a?: ProductAttributes | null, photos = photoCount(p.imageUrl, p.images)): CatalogGaps {
  const template = templateOf(p.category);
  const composition: CompositionState = a?.composition?.length
    ? 'structured'
    : /\d+\s*%/.test(p.description ?? '') ? 'in-description' : 'missing';
  const color = !!(a?.color || p.color?.trim());
  const needsFit = template.fits.length > 0;
  const fit = !needsFit || !!a?.fit;
  const sizeAdvice = !!a?.sizeAdvice;
  const needsMeasurements = template.measures.length > 0;
  const measured = !needsMeasurements || sizesOnShelf(p.sizes).every((s) => {
    const m = a?.measurements?.[s.size];
    return !!m && Object.keys(m).length > 0;
  });

  const missing: string[] = [];
  if (photos === 0) missing.push('слика');
  else if (photos < FULL_PHOTO_SET) missing.push(`слики ${photos}/${FULL_PHOTO_SET}`);
  if (composition !== 'structured') missing.push(composition === 'in-description' ? 'состав (во опис)' : 'состав');
  if (!color) missing.push('боја');
  if (!fit) missing.push('крој');
  if (!sizeAdvice) missing.push('совет за големина');
  if (!measured) missing.push('мерки');

  return {
    photos, composition, color, fit, needsFit, sizeAdvice, needsMeasurements, measured,
    missing, ready: missing.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Order of work
// ---------------------------------------------------------------------------

export type WorkTier = 1 | 2 | 3 | 4 | 5;

export const TIER_LABEL: Record<WorkTier, string> = {
  1: 'На сајтот',
  2: 'Скриен · сезоната се отвора',
  3: 'Скриен · целогодишно',
  4: 'Скриен · чека сезона',
  5: 'Расчистување',
};

const IN_SEASON: SeasonPhase[] = ['preseason', 'inseason'];

export interface TierInput {
  category: string;
  isVisible?: boolean;
  sold?: Array<{ price?: number | string }> | null;
  firstReceivedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/**
 *   1 live — every gap is costing sales today
 *   2 hidden, its season opening or open (AW in autumn)
 *   3 hidden, all-year
 *   4 hidden, its season closing or shut — waits, as D-010 says for photography
 *   5 hidden, never sold, here over CLEARANCE_AGE_DAYS — A2, not content work
 */
export function workTier(p: TierInput, now = Date.now()): WorkTier {
  if (p.isVisible) return 1;
  const ever = (p.sold ?? []).filter((s) => Number(s.price) > 0).length;
  const since = new Date(p.firstReceivedAt ?? p.createdAt ?? now).getTime() || now;
  if (ever === 0 && (now - since) / 86_400_000 > CLEARANCE_AGE_DAYS) return 5;
  const phase = phaseOf(p.category);
  if (phase === 'always') return 3;
  return IN_SEASON.includes(phase) ? 2 : 4;
}
