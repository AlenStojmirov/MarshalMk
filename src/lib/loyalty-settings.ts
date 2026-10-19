/**
 * The loyalty programme's numbers (EPIC 13, Task 13.1, D-032).
 *
 * Every rate, limit and period of the programme is the owner's to change from
 * /admin/loyalty without a code change. The defaults below are what was agreed
 * on 2026-10-18; the one stored row (`loyalty_settings`, migration 014) is read
 * over them key by key. A key that is missing, of the wrong type or out of
 * range falls back to its default and is reported, so a later task can add a
 * setting without a migration and a mistyped value can never zero a rate.
 *
 * Takes the Supabase client as an argument, like product-attributes.ts: the
 * admin screen passes the browser client (RLS, admin only), the server passes
 * the service role for the calculations and the public rules pages.
 *
 * The wheel's prizes and odds are rows of their own (Task 13.10), not here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const LOYALTY_SETTINGS = 'loyalty_settings';

/**
 * One point is one denar. Fixed, not a setting: changing it would revalue
 * every point already earned, and the owed amount with it (D-031).
 */
export const POINT_VALUE_DEN = 1;

export interface LoyaltySettings {
  /** Percent of what the customer actually paid (after every discount, without delivery). */
  earnRatePct: number;
  /** A product discounted by up to `discountBandPct` earns this share of the rate. */
  reducedRateSharePct: number;
  /** Discount against the regular price above which a product earns nothing and takes no points. */
  discountBandPct: number;

  minPointsToRedeem: number;
  minOrderForRedeem: number;
  /** Points pay at most this share of the basket, so part is always paid in money. */
  maxRedeemBasketPct: number;
  /** Per product at the regular price. */
  maxRedeemFullPricePct: number;
  /** Per product discounted by up to `discountBandPct`. */
  maxRedeemDiscountedPct: number;

  /** Sale price, coupon and points together never take more than this off the regular price. */
  maxTotalDiscountPct: number;

  /** Points wait this long after the order is delivered and paid. */
  pendingDays: number;
  expiryMonths: number;
  /** Points won on the wheel expire sooner (owner, 2026-10-18). */
  wheelPointsExpiryDays: number;
  expiryNoticeFirstDays: number;
  expiryNoticeSecondDays: number;

  /** Bonus points, credited only with a confirmed purchase. 0 = off. */
  bonusRegistration: number;
  bonusProfileComplete: number;
  bonusBirthday: number;

  /** A percent coupon given once the e-mail is confirmed (13.6). 0 = no welcome coupon. */
  welcomeCouponPct: number;
  welcomeCouponValidDays: number;
  welcomeCouponMinBasket: number;

  /** A percent coupon on the birthday (13.11). 0 = none; the birthday bonus points are separate. */
  birthdayCouponPct: number;
  birthdayCouponValidDays: number;
  /** A personal coupon lapsing within this many days gets one reminder e-mail. */
  couponNoticeDays: number;

  /** Off until the owner turns it on. While off the wheel shows nowhere. */
  wheelEnabled: boolean;
  wheelIntervalDays: number;
  wheelBonusSpinsPerOrder: number;
  wheelCouponValidHours: number;
  wheelCouponMinBasket: number;
}

export const LOYALTY_DEFAULTS: LoyaltySettings = {
  earnRatePct: 3,
  reducedRateSharePct: 50,
  discountBandPct: 30,

  minPointsToRedeem: 300,
  minOrderForRedeem: 1500,
  maxRedeemBasketPct: 30,
  maxRedeemFullPricePct: 30,
  maxRedeemDiscountedPct: 15,

  maxTotalDiscountPct: 50,

  pendingDays: 14,
  expiryMonths: 12,
  wheelPointsExpiryDays: 30,
  expiryNoticeFirstDays: 30,
  expiryNoticeSecondDays: 7,

  bonusRegistration: 0,
  bonusProfileComplete: 0,
  bonusBirthday: 0,

  // Not given in the brief: off until the owner sets a value.
  welcomeCouponPct: 0,
  welcomeCouponValidDays: 30,
  welcomeCouponMinBasket: 0,

  // Not given in the brief: off until the owner sets a value.
  birthdayCouponPct: 0,
  birthdayCouponValidDays: 14,
  couponNoticeDays: 3,

  wheelEnabled: false,
  wheelIntervalDays: 7,
  wheelBonusSpinsPerOrder: 1,
  wheelCouponValidHours: 72,
  // Not given in the brief: the same minimum as for spending points, until the owner says otherwise.
  wheelCouponMinBasket: 1500,
};

export type NumericSetting = { [K in keyof LoyaltySettings]: LoyaltySettings[K] extends number ? K : never }[keyof LoyaltySettings];

export type SettingUnit = '%' | 'ден.' | 'поени' | 'дена' | 'месеци' | 'часа' | 'вртења';

export interface SettingField {
  key: NumericSetting;
  label: string;
  unit: SettingUnit;
  min: number;
  max: number;
  /** 1 = whole numbers only. */
  step: number;
  hint?: string;
}

/** Ranges are what the arithmetic can live with, not advice. */
export const LOYALTY_FIELDS: Record<NumericSetting, SettingField> = {
  earnRatePct:            { key: 'earnRatePct', label: 'Стапка на заработка', unit: '%', min: 0, max: 20, step: 0.1, hint: 'од платеното, по сите попусти, без достава' },
  reducedRateSharePct:    { key: 'reducedRateSharePct', label: 'Производ на мал попуст заработува', unit: '%', min: 0, max: 100, step: 1, hint: 'од стапката; 50 = половина' },
  discountBandPct:        { key: 'discountBandPct', label: 'Мал попуст е до', unit: '%', min: 0, max: 90, step: 1, hint: 'над ова: без поени, не се плаќа со поени' },

  minPointsToRedeem:      { key: 'minPointsToRedeem', label: 'Најмалку поени за трошење', unit: 'поени', min: 0, max: 100000, step: 1 },
  minOrderForRedeem:      { key: 'minOrderForRedeem', label: 'Најмала нарачка за трошење поени', unit: 'ден.', min: 0, max: 100000, step: 1 },
  maxRedeemBasketPct:     { key: 'maxRedeemBasketPct', label: 'Со поени најмногу', unit: '%', min: 0, max: 100, step: 1, hint: 'од кошничката' },
  maxRedeemFullPricePct:  { key: 'maxRedeemFullPricePct', label: 'По производ, редовна цена', unit: '%', min: 0, max: 100, step: 1, hint: 'од цената' },
  maxRedeemDiscountedPct: { key: 'maxRedeemDiscountedPct', label: 'По производ, мал попуст', unit: '%', min: 0, max: 100, step: 1, hint: 'од цената на попуст' },

  maxTotalDiscountPct:    { key: 'maxTotalDiscountPct', label: 'Сите попусти заедно најмногу', unit: '%', min: 0, max: 90, step: 1, hint: 'од редовната цена' },

  pendingDays:            { key: 'pendingDays', label: 'Поените чекаат', unit: 'дена', min: 0, max: 90, step: 1, hint: 'од испорака и плаќање' },
  expiryMonths:           { key: 'expiryMonths', label: 'Поените истекуваат по', unit: 'месеци', min: 1, max: 60, step: 1, hint: 'од заработката' },
  wheelPointsExpiryDays:  { key: 'wheelPointsExpiryDays', label: 'Поени од тркалото истекуваат по', unit: 'дена', min: 1, max: 365, step: 1 },
  expiryNoticeFirstDays:  { key: 'expiryNoticeFirstDays', label: 'Прво известување пред истек', unit: 'дена', min: 1, max: 180, step: 1 },
  expiryNoticeSecondDays: { key: 'expiryNoticeSecondDays', label: 'Второ известување пред истек', unit: 'дена', min: 1, max: 180, step: 1 },

  bonusRegistration:      { key: 'bonusRegistration', label: 'За регистрација', unit: 'поени', min: 0, max: 10000, step: 1 },
  bonusProfileComplete:   { key: 'bonusProfileComplete', label: 'За цел профил', unit: 'поени', min: 0, max: 10000, step: 1 },
  bonusBirthday:          { key: 'bonusBirthday', label: 'За роденден', unit: 'поени', min: 0, max: 10000, step: 1 },

  welcomeCouponPct:       { key: 'welcomeCouponPct', label: 'Купон за добредојде', unit: '%', min: 0, max: 50, step: 1, hint: '0 = без купон' },
  welcomeCouponValidDays: { key: 'welcomeCouponValidDays', label: 'Купонот за добредојде важи', unit: 'дена', min: 1, max: 365, step: 1 },
  welcomeCouponMinBasket: { key: 'welcomeCouponMinBasket', label: 'Купонот за добредојде, најмала кошничка', unit: 'ден.', min: 0, max: 100000, step: 1 },

  birthdayCouponPct:       { key: 'birthdayCouponPct', label: 'Роденденски купон', unit: '%', min: 0, max: 50, step: 1, hint: '0 = без купон' },
  birthdayCouponValidDays: { key: 'birthdayCouponValidDays', label: 'Роденденскиот купон важи', unit: 'дена', min: 1, max: 90, step: 1 },
  couponNoticeDays:        { key: 'couponNoticeDays', label: 'Потсетник за купон пред истек', unit: 'дена', min: 1, max: 30, step: 1, hint: 'купоните од тркалото без потсетник' },

  wheelIntervalDays:      { key: 'wheelIntervalDays', label: 'Едно вртење на секои', unit: 'дена', min: 1, max: 365, step: 1 },
  wheelBonusSpinsPerOrder:{ key: 'wheelBonusSpinsPerOrder', label: 'Бонус по испорачана нарачка', unit: 'вртења', min: 0, max: 5, step: 1 },
  wheelCouponValidHours:  { key: 'wheelCouponValidHours', label: 'Купон од тркалото важи', unit: 'часа', min: 1, max: 720, step: 1 },
  wheelCouponMinBasket:   { key: 'wheelCouponMinBasket', label: 'Купон од тркалото, најмала кошничка', unit: 'ден.', min: 0, max: 100000, step: 1 },
};

/** Why a value cannot stand, or null if it can. */
export function fieldError(f: SettingField, v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'не е број';
  if (v < f.min || v > f.max) return `мора да е од ${f.min} до ${f.max}`;
  if (f.step === 1 && !Number.isInteger(v)) return 'само цел број';
  return null;
}

/**
 * Problems between fields. Only what would break the programme, not taste:
 * the second expiry notice has to come after the first, or a customer gets
 * the same warning twice.
 */
export function crossFieldErrors(s: LoyaltySettings): string[] {
  const out: string[] = [];
  if (s.expiryNoticeSecondDays >= s.expiryNoticeFirstDays) {
    out.push('Второто известување мора да е поблиску до истекот од првото.');
  }
  return out;
}

/** The stored row over the defaults, key by key. `rejected` names the stored keys that could not stand. */
export function parseLoyaltySettings(raw: unknown): { settings: LoyaltySettings; rejected: Array<keyof LoyaltySettings> } {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const settings: LoyaltySettings = { ...LOYALTY_DEFAULTS };
  const rejected: Array<keyof LoyaltySettings> = [];
  for (const f of Object.values(LOYALTY_FIELDS)) {
    if (!(f.key in src)) continue;
    const v = src[f.key];
    if (fieldError(f, v) === null) settings[f.key] = v as number;
    else rejected.push(f.key);
  }
  if ('wheelEnabled' in src) {
    if (typeof src.wheelEnabled === 'boolean') settings.wheelEnabled = src.wheelEnabled;
    else rejected.push('wheelEnabled');
  }
  // Both notices fall back together, or a half-fixed pair could still collide.
  if (crossFieldErrors(settings).length) {
    settings.expiryNoticeFirstDays = LOYALTY_DEFAULTS.expiryNoticeFirstDays;
    settings.expiryNoticeSecondDays = LOYALTY_DEFAULTS.expiryNoticeSecondDays;
    rejected.push('expiryNoticeFirstDays', 'expiryNoticeSecondDays');
  }
  return { settings, rejected };
}

// ---------------------------------------------------------------------------
// What the settings mean for one product (used by the basket maths, 13.2)
// ---------------------------------------------------------------------------

/** Where a product's own discount puts it: at the regular price, a small discount, or past the band. */
export type DiscountBand = 'full' | 'reduced' | 'none';

/**
 * Always measured against the regular price, never the sale price, so a
 * product cannot climb back into a better band by being discounted twice.
 * Compared in whole numbers: 30% of 2.000 is exactly 600 off, and floating
 * point would put 1.400 a hair past the line.
 */
export function discountBand(regularPrice: number, price: number, s: LoyaltySettings): DiscountBand {
  if (!(regularPrice > 0) || price >= regularPrice) return 'full';
  return (regularPrice - price) * 100 <= s.discountBandPct * regularPrice ? 'reduced' : 'none';
}

/** Percent of the paid price this product earns. */
export function earnRatePctFor(band: DiscountBand, s: LoyaltySettings): number {
  if (band === 'full') return s.earnRatePct;
  if (band === 'reduced') return (s.earnRatePct * s.reducedRateSharePct) / 100;
  return 0;
}

/** Percent of the product's price that points may pay. */
export function redeemCapPctFor(band: DiscountBand, s: LoyaltySettings): number {
  if (band === 'full') return s.maxRedeemFullPricePct;
  if (band === 'reduced') return s.maxRedeemDiscountedPct;
  return 0;
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export interface LoyaltySettingsRead {
  settings: LoyaltySettings;
  /** False until the owner saves once: the defaults are in force. */
  stored: boolean;
  /** Migration 014 has not run: the defaults are in force and nothing can be saved. */
  missingTable: boolean;
  rejected: Array<keyof LoyaltySettings>;
  updatedAt?: Date;
  error?: string;
}

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

/**
 * Never throws. Whatever goes wrong, the answer is the defaults, which keep the
 * wheel off and the rates at what was agreed, and the error says why.
 */
export async function fetchLoyaltySettings(sb: SupabaseClient): Promise<LoyaltySettingsRead> {
  const { data, error } = await sb.from(LOYALTY_SETTINGS).select('settings, updated_at').eq('id', true).maybeSingle();
  if (error) {
    return { settings: { ...LOYALTY_DEFAULTS }, stored: false, missingTable: isMissingRelation(error), rejected: [], error: error.message };
  }
  if (!data) return { settings: { ...LOYALTY_DEFAULTS }, stored: false, missingTable: false, rejected: [] };
  const { settings, rejected } = parseLoyaltySettings(data.settings);
  return { settings, stored: true, missingTable: false, rejected, updatedAt: data.updated_at ? new Date(data.updated_at) : undefined };
}

/** Stores every key, so a later change of a default in code never moves a number the owner set. */
export async function saveLoyaltySettings(sb: SupabaseClient, s: LoyaltySettings): Promise<{ error?: string }> {
  const problems = [
    ...Object.values(LOYALTY_FIELDS).flatMap((f) => {
      const e = fieldError(f, s[f.key]);
      return e ? [`${f.label}: ${e}`] : [];
    }),
    ...crossFieldErrors(s),
  ];
  if (problems.length) return { error: problems.join(' · ') };
  const { error } = await sb.from(LOYALTY_SETTINGS).upsert({ id: true, settings: s }, { onConflict: 'id' });
  return error ? { error: error.message } : {};
}
