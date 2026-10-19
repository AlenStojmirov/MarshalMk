import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBlocked, isRateLimited, recordViolation } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/customers';
import { RegistrationInput, validateRegistration } from '@/lib/account';
import { POLICIES } from '@/config/policies';
import { CUSTOMERS, clientIp, ensureCustomerRole, fail, logConsents, publicAuthClient } from '@/lib/account-server';

/**
 * POST /api/account/register — a customer opens a profile (Task 13.6, D-033).
 *
 * The same layers as an order, in the same spirit: blocklist, a limit per
 * address and per e-mail, the honeypot and the form timing, then the checks.
 * Supabase sends the confirmation e-mail. The role `customer`, the profile row
 * and the consents are written here with the service role, never by the
 * browser.
 *
 * An e-mail that already has an account gets the same answer as a new one,
 * and nothing changes: the form must not tell a stranger who is a customer.
 */

/** Faster than this from opening the form is a script, not a person (as for orders). */
const MIN_FILL_MS = 3000;

/** Where a sign-up may say it came from, for the reports (13.12). Anything else is dropped. */
const SIGNUP_SOURCES = ['trkalo'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isBlocked(ip)) return fail(403, 'Пристапот е привремено ограничен. Пробај подоцна.');
  if (isRateLimited(`account:${ip}`, 3, 10 * 60_000)) {
    recordViolation(ip);
    console.warn(`[ACCOUNT_RATE_LIMIT] ip=${ip}`);
    return fail(429, 'Премногу обиди. Пробај повторно за неколку минути.');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    recordViolation(ip);
    return fail(400, 'Неважечко барање.');
  }

  // Honeypot: a person never fills it. Answer as if it worked.
  if (body.website) {
    recordViolation(ip);
    console.warn(`[ACCOUNT_HONEYPOT] ip=${ip}`);
    return NextResponse.json({ ok: true });
  }
  const loadedAt = typeof body._t === 'number' ? body._t : 0;
  if (loadedAt === 0 || Date.now() - loadedAt < MIN_FILL_MS) {
    recordViolation(ip);
    console.warn(`[ACCOUNT_TIMING] ip=${ip}`);
    return fail(400, 'Пополни ја формата пред да ја испратиш.');
  }

  const input: RegistrationInput = {
    email: str(body.email).trim().toLowerCase(),
    password: str(body.password),
    firstName: str(body.firstName).trim(),
    lastName: str(body.lastName).trim(),
    phone: str(body.phone).trim(),
    birthDate: str(body.birthDate).trim(),
    marketing: body.marketing === true,
    consent: body.consent === true,
  };
  const fields = validateRegistration(input);
  if (Object.keys(fields).length) return fail(400, 'Провери ги означените полиња.', { fields });

  if (isRateLimited(`account-email:${input.email}`, 3, 60 * 60_000)) {
    return fail(429, 'Премногу обиди за оваа е-пошта. Пробај повторно подоцна.');
  }

  const sb = getSupabaseAdmin();
  const phoneNorm = normalizePhone(input.phone);
  const taken = await sb.from(CUSTOMERS).select('user_id').eq('phone_norm', phoneNorm).maybeSingle();
  if (taken.error) return fail(500, 'Профилот не може да се направи во моментов.');
  const phoneTaken = 'Овој број веќе има профил. Најави се, или внеси друг број.';
  if (taken.data) return fail(409, phoneTaken, { fields: { phone: phoneTaken } });

  const origin = new URL(req.url).origin;
  const { data, error } = await publicAuthClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${origin}/smetka?potvrdeno=1`,
      // Kept with the account (user metadata), no column needed: the wheel's report counts it.
      data: {
        first_name: input.firstName,
        ...((SIGNUP_SOURCES as readonly string[]).includes(str(body.from)) ? { signup_source: str(body.from) } : {}),
      },
    },
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === 'user_already_exists' || code === 'email_exists') return NextResponse.json({ ok: true, email: input.email });
    if (code === 'weak_password') return fail(400, 'Лозинката е преслаба.', { fields: { password: 'Лозинката е преслаба. Додај букви и бројки.' } });
    if (error.status === 429 || code.startsWith('over_')) return fail(429, 'Премногу е-пошти за кратко време. Пробај повторно за неколку минути.');
    if (code === 'signup_disabled') return fail(503, 'Регистрацијата е привремено исклучена.');
    console.error(`[ACCOUNT_SIGNUP_FAILED] ${code} ${error.message}`);
    return fail(500, 'Профилот не може да се направи во моментов.');
  }

  const user = data.user;
  // An e-mail that already has a confirmed account: Supabase answers with a
  // user without identities and sends nothing. Same answer, nothing written.
  if (!user || (user.identities && user.identities.length === 0)) return NextResponse.json({ ok: true, email: input.email });

  try {
    await ensureCustomerRole(user);
    const ins = await sb.from(CUSTOMERS).upsert({
      user_id: user.id,
      first_name: input.firstName,
      last_name: input.lastName || null,
      phone: input.phone,
      phone_norm: phoneNorm,
      birth_date: input.birthDate || null,
      marketing_consent: input.marketing,
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (ins.error) {
      // The phone was taken between the check and now. Undo an account this
      // call just made; an older unconfirmed one keeps its own row.
      if (/customers_phone_unique|duplicate key/i.test(ins.error.message)) {
        const fresh = !user.email_confirmed_at && Date.now() - new Date(user.created_at).getTime() < 60_000;
        if (fresh) await sb.auth.admin.deleteUser(user.id);
        return fail(409, phoneTaken, { fields: { phone: phoneTaken } });
      }
      throw new Error(ins.error.message);
    }
    await logConsents(user.id, [
      { kind: 'rules', version: POLICIES.rules.version, granted: true },
      { kind: 'privacy', version: POLICIES.privacy.version, granted: true },
      { kind: 'marketing', version: null, granted: input.marketing },
    ]);
  } catch (e) {
    console.error(`[ACCOUNT_PROFILE_FAILED] user=${user.id} ${(e as Error).message}`);
    return fail(500, 'Профилот е направен, но не е довршен. Најави се откако ќе ја потврдиш е-поштата и пополни го.');
  }

  return NextResponse.json({ ok: true, email: input.email });
}
