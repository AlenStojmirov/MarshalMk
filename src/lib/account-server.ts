/**
 * Customer accounts, the server's half (Task 13.6). Server only: it uses the
 * service role.
 *
 * Who is asking is read from the access token the page sends, checked with
 * Supabase, never from the request body. The role `customer` is given here
 * and only to an account with no role: an admin, staff or marketing account
 * is never turned into a customer, or it would lose the back office.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase-admin';
import { isBackOffice, roleOf } from './roles';
import { AccountView, CustomerRow, programmeRules, rowToProfile } from './account';
import { LoyaltySettings, fetchLoyaltySettings } from './loyalty-settings';
import { issuePersonalCoupon } from './coupons';
import { creditPoints, expiryFor } from './points';

export const CUSTOMERS = 'customers';
export const CUSTOMER_CONSENTS = 'customer_consents';

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * A client with the public key, for the calls Supabase only makes on the
 * public side: sign-up sends the confirmation e-mail (through the shop's SMTP).
 * Nothing is kept between requests.
 */
export function publicAuthClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireUser(req: NextRequest): Promise<{ user: User } | { res: NextResponse }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { res: fail(401, 'Не си најавен.') };
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return { res: fail(401, 'Најавата е истечена. Најави се повторно.') };
  return { user: data.user };
}

export async function readCustomer(userId: string): Promise<CustomerRow | null> {
  const { data, error } = await getSupabaseAdmin().from(CUSTOMERS).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomerRow | null) ?? null;
}

/** Give the role `customer` to an account that has none. Never touches an existing role. */
export async function ensureCustomerRole(user: User): Promise<void> {
  if (roleOf(user) !== null || user.app_metadata?.role) return;
  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: 'customer' },
  });
  if (error) throw new Error(error.message);
}

export async function logConsents(userId: string, rows: Array<{ kind: 'rules' | 'privacy' | 'marketing'; version: string | null; granted: boolean }>) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseAdmin().from(CUSTOMER_CONSENTS).insert(rows.map((r) => ({ user_id: userId, ...r })));
  if (error) throw new Error(error.message);
}

/**
 * Has this account an order that was delivered and paid? Read the way the
 * order sync reads it (13.8): outcome delivered, or delivered from before
 * outcomes existed.
 */
export async function hasPaidOrder(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('orders').select('id, status, outcome')
    .eq('customer->>userId', userId).or('outcome.eq.delivered,and(outcome.is.null,status.eq.delivered)').limit(1);
  return (data ?? []).length > 0;
}

/**
 * Once the e-mail is confirmed: the welcome coupon and the sign-up bonus,
 * once; and the bonus for a complete profile, once. Each is claimed in the
 * row first (an update that only succeeds while the date is empty), so two
 * tabs opening the account at the same moment cannot both be given it; if the
 * gift then fails, the claim is undone and the next visit tries again.
 * The amounts are the owner's settings; 0 gives nothing.
 */
export async function settleAccount(user: User, row: CustomerRow): Promise<CustomerRow> {
  if (!user.email_confirmed_at) return row;
  const sb = getSupabaseAdmin();
  const { settings } = await fetchLoyaltySettings(sb);
  let current = row;

  // A bonus waits for the first paid order (13.8); one that comes after it
  // counts at once, or it would wait for an order that already happened.
  let paid: boolean | null = null;
  const bonusDates = async () => {
    paid ??= await hasPaidOrder(user.id);
    if (!paid) return {};
    const now = new Date();
    return { availableAt: now, expiresAt: expiryFor('bonus', now, settings) };
  };

  const claim = async (column: 'welcome_issued_at' | 'profile_bonus_at') => {
    const { data } = await sb.from(CUSTOMERS).update({ [column]: new Date().toISOString() })
      .eq('user_id', user.id).is(column, null).select('*').maybeSingle();
    return (data as CustomerRow | null) ?? null;
  };
  const unclaim = (column: 'welcome_issued_at' | 'profile_bonus_at') =>
    sb.from(CUSTOMERS).update({ [column]: null }).eq('user_id', user.id);

  if (!current.welcome_issued_at) {
    const claimed = await claim('welcome_issued_at');
    if (claimed) {
      current = claimed;
      const problems: string[] = [];
      if (settings.welcomeCouponPct > 0) {
        const r = await issuePersonalCoupon(sb, {
          userId: user.id, source: 'welcome', kind: 'percent', value: settings.welcomeCouponPct,
          validHours: settings.welcomeCouponValidDays * 24, minBasket: settings.welcomeCouponMinBasket || undefined,
          prefix: 'DOBREDOJDE', note: 'купон за добредојде',
        });
        if (r.error) problems.push(r.error);
      }
      if (settings.bonusRegistration > 0) {
        // Pending until the first paid order (13.8), unless there already is one.
        const r = await creditPoints(sb, { userId: user.id, kind: 'bonus', points: settings.bonusRegistration, reason: 'бонус за регистрација', ...(await bonusDates()) });
        if (r.error) problems.push(r.error);
      }
      if (problems.length) {
        console.error(`[ACCOUNT_WELCOME_FAILED] user=${user.id} ${problems.join(' | ')}`);
        await unclaim('welcome_issued_at');
      }
    }
  }

  const complete = !!(current.first_name && current.last_name && current.phone && current.birth_date);
  if (complete && !current.profile_bonus_at && settings.bonusProfileComplete > 0) {
    const claimed = await claim('profile_bonus_at');
    if (claimed) {
      current = claimed;
      const r = await creditPoints(sb, { userId: user.id, kind: 'bonus', points: settings.bonusProfileComplete, reason: 'бонус за целосен профил', ...(await bonusDates()) });
      if (r.error) {
        console.error(`[ACCOUNT_PROFILE_BONUS_FAILED] user=${user.id} ${r.error}`);
        await unclaim('profile_bonus_at');
      }
    }
  }
  return current;
}

export function accountView(user: User, row: CustomerRow | null, settings: LoyaltySettings): AccountView {
  return {
    email: user.email ?? '',
    emailConfirmed: !!user.email_confirmed_at,
    backOffice: isBackOffice(roleOf(user)),
    profile: row ? rowToProfile(row) : null,
    rules: programmeRules(settings),
  };
}
