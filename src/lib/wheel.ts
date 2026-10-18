/**
 * The wheel of fortune (EPIC 13, Task 13.10, migration 018, D-035).
 *
 * Shared by the admin screen, the public page and the server: the prize
 * shape, the chances as the wheel shows them, and a simulation the owner can
 * run before switching it on. The spin itself is decided in the database
 * (`wheel_spin`), never here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const WHEEL_PRIZES = 'wheel_prizes';

export type PrizeKind = 'points' | 'percent' | 'free_shipping';

export const PRIZE_KIND_LABEL: Record<PrizeKind, string> = {
  points: 'Поени',
  percent: 'Попуст во %',
  free_shipping: 'Бесплатна достава',
};

export interface WheelPrize {
  id?: string;
  label: string;
  kind: PrizeKind;
  /** Points, or percent; 0 for free delivery. */
  value: number;
  /** The chance as a weight; the wheel shares 100% among the prizes on it. */
  weight: number;
  dailyCap?: number;
  monthlyCap?: number;
  sort: number;
  active: boolean;
}

export interface WheelPrizeRow {
  id: string;
  label: string;
  kind: PrizeKind;
  value: number | string;
  weight: number | string;
  daily_cap: number | null;
  monthly_cap: number | null;
  sort: number;
  active: boolean;
}

export function rowToPrize(r: WheelPrizeRow): WheelPrize {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind,
    value: Number(r.value) || 0,
    weight: Number(r.weight) || 0,
    dailyCap: r.daily_cap ?? undefined,
    monthlyCap: r.monthly_cap ?? undefined,
    sort: r.sort,
    active: r.active,
  };
}

/** Each prize's share of 100%, among those given. One decimal. */
export function chances<T extends Pick<WheelPrize, 'weight'>>(prizes: T[]): Array<T & { chance: number }> {
  const total = prizes.reduce((a, p) => a + Math.max(0, p.weight), 0);
  return prizes.map((p) => ({ ...p, chance: total > 0 ? Math.round((Math.max(0, p.weight) / total) * 1000) / 10 : 0 }));
}

/** Points a spin hands out on average, for the owner to weigh against the margin. */
export function expectedPoints(prizes: WheelPrize[]): number {
  const total = prizes.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  return prizes.reduce((a, p) => a + (p.kind === 'points' ? (p.value * p.weight) / total : 0), 0);
}

/** n spins by the weights, as the database draws them, for the admin's preview. Writes nothing. */
export function simulate(prizes: WheelPrize[], n: number): Map<string, number> {
  const out = new Map<string, number>(prizes.map((p) => [p.label, 0]));
  const total = prizes.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return out;
  for (let i = 0; i < n; i++) {
    let roll = Math.random() * total;
    const hit = prizes.find((p) => (roll -= p.weight) < 0) ?? prizes[prizes.length - 1];
    out.set(hit.label, (out.get(hit.label) ?? 0) + 1);
  }
  return out;
}

export function prizeProblems(p: WheelPrize): string[] {
  const out: string[] = [];
  if (!p.label.trim() || p.label.trim().length > 30) out.push('Името треба да има 1 до 30 знаци.');
  if (p.kind === 'points' && !(Number.isInteger(p.value) && p.value >= 1)) out.push('Поените треба да се цел број од 1 нагоре.');
  if (p.kind === 'percent' && !(p.value > 0 && p.value <= 50)) out.push('Попустот треба да е од 1 до 50%.');
  if (!(p.weight > 0)) out.push('Шансата треба да е поголема од 0.');
  for (const cap of [p.dailyCap, p.monthlyCap]) {
    if (cap !== undefined && !(Number.isInteger(cap) && cap >= 0)) out.push('Лимитот треба да е цел број, или празно.');
  }
  return out;
}

export interface WheelRead<T> { data: T; missingTable: boolean; error?: string }

function isMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return ['42P01', 'PGRST205'].includes(err.code ?? '') || /does not exist|schema cache/i.test(err.message ?? '');
}

export async function fetchPrizes(sb: SupabaseClient): Promise<WheelRead<WheelPrize[]>> {
  const { data, error } = await sb.from(WHEEL_PRIZES).select('*').order('sort').order('created_at');
  if (error) return { data: [], missingTable: isMissing(error), error: error.message };
  return { data: ((data ?? []) as WheelPrizeRow[]).map(rowToPrize), missingTable: false };
}

export async function savePrize(sb: SupabaseClient, p: WheelPrize): Promise<{ error?: string }> {
  const problems = prizeProblems(p);
  if (problems.length) return { error: problems.join(' ') };
  const row = {
    label: p.label.trim(), kind: p.kind, value: p.kind === 'free_shipping' ? 0 : p.value, weight: p.weight,
    daily_cap: p.dailyCap ?? null, monthly_cap: p.monthlyCap ?? null, sort: p.sort, active: p.active,
  };
  const { error } = p.id ? await sb.from(WHEEL_PRIZES).update(row).eq('id', p.id) : await sb.from(WHEEL_PRIZES).insert(row);
  return error ? { error: error.message } : {};
}

/** A spin as the customer sees its result. */
export interface SpinResult {
  label: string;
  kind: PrizeKind;
  value: number;
  couponCode?: string;
  /** Where the prize sits in the list the wheel was drawn with, for the animation. */
  index: number;
  prizes: PublicPrize[];
}

/** A prize as the public sees it: no limits, no internal ids beyond what draws the wheel. */
export interface PublicPrize {
  id: string;
  label: string;
  kind: PrizeKind;
  value: number;
  chance: number;
}

/** What GET /api/wheel answers. */
export interface WheelState {
  enabled: boolean;
  prizes: PublicPrize[];
  signedIn: boolean;
  member: boolean;
  canSpin: boolean;
  /** When the next regular spin opens, if it is not open now. */
  nextAt: string | null;
  bonusLeft: number;
  intervalDays: number;
  couponHours: number;
  couponMinBasket: number;
  pointsDays: number;
}
