/**
 * Customer accounts (EPIC 13, Task 13.6, migration 017, D-033).
 *
 * Shared by the forms and the server: the same checks on both sides, so a
 * form says what the server would refuse before anything is sent, and the
 * server never trusts that the form checked.
 *
 * A customer is their account plus one `customers` row. One phone is one
 * account; the phone is kept as typed (for the courier) and in one canonical
 * form (for uniqueness), the same form the online customers list already
 * uses (`normalizePhone`, D-014).
 */

import { normalizePhone } from './customers';
import { DEFAULT_LANGUAGE, translate, type Language } from './i18n/messages';
import type { LoyaltySettings } from './loyalty-settings';
import type { OrderLoyalty, OrderOutcome, OrderStatus } from '@/types';

export const MIN_PASSWORD = 8;

/** A Macedonian number in local form: 0 and eight digits. The shop delivers in Macedonia only. */
export const MK_PHONE = /^0[2-9]\d{7}$/;

export interface ProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  /** yyyy-mm-dd, or empty. */
  birthDate: string;
  /**
   * Where the customer's own orders go (14.9): filled in at checkout, never
   * required. Absent when not sent (sign-up), and then left as it is.
   */
  address?: string;
  city?: string;
  marketing: boolean;
  /** The rules and the privacy policy. Required when the profile is made, not when it is edited. */
  consent?: boolean;
}

export interface RegistrationInput extends ProfileInput {
  email: string;
  password: string;
}

export type AccountField = 'email' | 'password' | 'firstName' | 'lastName' | 'phone' | 'birthDate' | 'address' | 'city' | 'consent';
export type FieldErrors = Partial<Record<AccountField, string>>;

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** `lang`: the form passes the page's, the server the request's (D-039). */
export function validateProfile(p: ProfileInput, now = new Date(), needsConsent = false, lang: Language = DEFAULT_LANGUAGE): FieldErrors {
  const say = (key: string, params?: Record<string, string | number>) => translate(lang, `errors.fields.${key}`, params);
  const e: FieldErrors = {};
  const first = p.firstName.trim();
  if (!first) e.firstName = say('firstNameMissing');
  else if (first.length > 60) e.firstName = say('firstNameLong');
  if (p.lastName.trim().length > 60) e.lastName = say('lastNameLong');
  if (!MK_PHONE.test(normalizePhone(p.phone))) e.phone = say('phone');
  if (p.birthDate) {
    const d = new Date(`${p.birthDate}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1900 || d > now) e.birthDate = say('birthDate');
  }
  if ((p.address ?? '').trim().length > 200) e.address = say('addressLong');
  if ((p.city ?? '').trim().length > 80) e.city = say('cityLong');
  if (needsConsent && p.consent !== true) e.consent = say('consent');
  return e;
}

export function validateRegistration(r: RegistrationInput, now = new Date(), lang: Language = DEFAULT_LANGUAGE): FieldErrors {
  const e = validateProfile(r, now, true, lang);
  if (!isEmail(r.email)) e.email = translate(lang, 'errors.fields.email');
  if (r.password.length < MIN_PASSWORD) e.password = translate(lang, 'errors.fields.passwordShort', { min: MIN_PASSWORD });
  return e;
}

export interface CustomerRow {
  user_id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  phone_norm: string;
  birth_date: string | null;
  /** Absent until migration 021. */
  address?: string | null;
  city?: string | null;
  marketing_consent: boolean;
  phone_verified_at: string | null;
  welcome_issued_at: string | null;
  profile_bonus_at: string | null;
  tour_seen_at: string | null;
  created_at: string;
}

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  address: string;
  city: string;
  /** Migration 021 has run, so the profile can hold an address. */
  hasAddress: boolean;
  marketing: boolean;
  phoneVerified: boolean;
  tourSeen: boolean;
  createdAt: string;
}

export function rowToProfile(r: CustomerRow): CustomerProfile {
  return {
    firstName: r.first_name,
    lastName: r.last_name ?? '',
    phone: r.phone,
    birthDate: r.birth_date ?? '',
    address: r.address ?? '',
    city: r.city ?? '',
    hasAddress: 'address' in r,
    marketing: r.marketing_consent,
    phoneVerified: !!r.phone_verified_at,
    tourSeen: !!r.tour_seen_at,
    createdAt: r.created_at,
  };
}

/** The programme's numbers a customer reads (13.9): what "how points work" says. Never a cost or a floor. */
export interface ProgrammeRules {
  earnRatePct: number;
  reducedRatePct: number;
  discountBandPct: number;
  pendingDays: number;
  expiryMonths: number;
  minPointsToRedeem: number;
  minOrderForRedeem: number;
  maxRedeemBasketPct: number;
  wheelEnabled: boolean;
}

export function programmeRules(s: LoyaltySettings): ProgrammeRules {
  return {
    earnRatePct: s.earnRatePct,
    reducedRatePct: Math.round(s.earnRatePct * s.reducedRateSharePct) / 100,
    discountBandPct: s.discountBandPct,
    pendingDays: s.pendingDays,
    expiryMonths: s.expiryMonths,
    minPointsToRedeem: s.minPointsToRedeem,
    minOrderForRedeem: s.minOrderForRedeem,
    maxRedeemBasketPct: s.maxRedeemBasketPct,
    wheelEnabled: s.wheelEnabled,
  };
}

/** What /api/account/me answers. */
export interface AccountView {
  email: string;
  emailConfirmed: boolean;
  /** A back-office account (admin, staff, marketing) is never a customer. */
  backOffice: boolean;
  /** null: signed in, but the profile was never made (an account made outside the sign-up form). */
  profile: CustomerProfile | null;
  rules: ProgrammeRules;
}

/** One of the customer's own orders, as /api/account/orders hands it out (13.9). */
export interface CustomerOrder {
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  outcome: OrderOutcome | null;
  deliveryMethod: 'courier' | 'pickup';
  items: Array<{ productId: string; productName: string; size: string | null; quantity: number; price: number }>;
  /** What was collected, delivery included. */
  total: number;
  loyalty: OrderLoyalty | null;
}

/**
 * What the checkout fills in for a signed-in customer, from /api/account/checkout
 * (14.9). Empty where nothing is known; every field stays the customer's to change.
 */
export interface CheckoutDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

export const CHECKOUT_DETAIL_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'city'] as const;
