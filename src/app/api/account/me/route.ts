import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBackOffice, roleOf } from '@/lib/roles';
import { normalizePhone } from '@/lib/customers';
import { ProfileInput, validateProfile } from '@/lib/account';
import { POLICIES } from '@/config/policies';
import {
  CUSTOMERS, accountView, ensureCustomerRole, fail, logConsents, readCustomer, requireUser, settleAccount,
} from '@/lib/account-server';

/**
 * The signed-in customer's own profile (Task 13.6).
 *
 *   GET    the profile; once the e-mail is confirmed it also hands out, once,
 *          the welcome coupon and the bonuses (settleAccount)
 *   PATCH  { firstName, lastName, phone, birthDate, marketing, consent? }
 *          changes the profile, or makes it for an account that has none
 *          (one made outside the sign-up form) — then `consent` is required
 *
 * A back-office account (admin, staff, marketing) is never a customer.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const PHONE_TAKEN = 'Овој број веќе има профил. Внеси друг број.';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  try {
    let row = await readCustomer(auth.user.id);
    if (row && !isBackOffice(roleOf(auth.user))) row = await settleAccount(auth.user, row);
    return NextResponse.json(accountView(auth.user, row));
  } catch (e) {
    console.error(`[ACCOUNT_READ_FAILED] user=${auth.user.id} ${(e as Error).message}`);
    return fail(500, 'Профилот не може да се прочита во моментов.');
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  const { user } = auth;
  if (isBackOffice(roleOf(user))) return fail(403, 'Ова е профил на вработен. За купување отвори профил со друга е-пошта.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Неважечко барање.');
  }
  const input: ProfileInput = {
    firstName: str(body.firstName).trim(),
    lastName: str(body.lastName).trim(),
    phone: str(body.phone).trim(),
    birthDate: str(body.birthDate).trim(),
    marketing: body.marketing === true,
    consent: body.consent === true,
  };

  const sb = getSupabaseAdmin();
  try {
    const row = await readCustomer(user.id);
    const fields = validateProfile(input, new Date(), !row);
    if (Object.keys(fields).length) return fail(400, 'Провери ги означените полиња.', { fields });

    const phoneNorm = normalizePhone(input.phone);
    if (!row || row.phone_norm !== phoneNorm) {
      const taken = await sb.from(CUSTOMERS).select('user_id').eq('phone_norm', phoneNorm).neq('user_id', user.id).maybeSingle();
      if (taken.data) return fail(409, PHONE_TAKEN, { fields: { phone: PHONE_TAKEN } });
    }

    const values = {
      first_name: input.firstName,
      last_name: input.lastName || null,
      phone: input.phone,
      phone_norm: phoneNorm,
      birth_date: input.birthDate || null,
      marketing_consent: input.marketing,
      // A new number is unconfirmed until an order to it is delivered and paid (13.8).
      ...(row && row.phone_norm !== phoneNorm ? { phone_verified_at: null } : {}),
    };
    const res = row
      ? await sb.from(CUSTOMERS).update(values).eq('user_id', user.id)
      : await sb.from(CUSTOMERS).insert({ user_id: user.id, ...values });
    if (res.error) {
      if (/customers_phone_unique|duplicate key/i.test(res.error.message)) return fail(409, PHONE_TAKEN, { fields: { phone: PHONE_TAKEN } });
      throw new Error(res.error.message);
    }

    if (!row) {
      await ensureCustomerRole(user);
      await logConsents(user.id, [
        { kind: 'rules', version: POLICIES.rules.version, granted: true },
        { kind: 'privacy', version: POLICIES.privacy.version, granted: true },
        { kind: 'marketing', version: null, granted: input.marketing },
      ]);
    } else if (row.marketing_consent !== input.marketing) {
      await logConsents(user.id, [{ kind: 'marketing', version: null, granted: input.marketing }]);
    }

    let fresh = await readCustomer(user.id);
    if (fresh) fresh = await settleAccount(user, fresh);
    return NextResponse.json(accountView(user, fresh));
  } catch (e) {
    console.error(`[ACCOUNT_SAVE_FAILED] user=${user.id} ${(e as Error).message}`);
    return fail(500, 'Профилот не може да се зачува во моментов.');
  }
}
