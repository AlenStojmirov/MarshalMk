import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBlocked, isRateLimited, recordViolation } from '@/lib/rate-limit';
import { userFromRequest } from '@/lib/basket-server';
import { spinWheel } from '@/lib/wheel-server';
import { apiSay } from '@/lib/i18n/messages';

/**
 * POST /api/wheel/spin — one spin (Task 13.10). The database decides the prize
 * and gives it before this answers, so the page only animates to a result it
 * already has. Limited per address and per account on top of the database's
 * own lock; the lock is what makes a second spin in a period impossible.
 */

/** Status and message key (`errors.api.wheel.*`) per refusal. */
const REFUSAL: Record<string, [number, string]> = {
  off: [404, 'off'],
  member: [403, 'member'],
  not_now: [409, 'notNow'],
  no_prizes: [503, 'noPrizes'],
};

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const say = apiSay(req);
  if (isBlocked(ip)) return NextResponse.json({ error: say('blockedShort') }, { status: 403 });
  if (isRateLimited(`wheel:${ip}`, 10, 60_000)) {
    recordViolation(ip);
    return NextResponse.json({ error: say('tooManyWait') }, { status: 429 });
  }
  try {
    const sb = getSupabaseAdmin();
    const user = await userFromRequest(sb, req.headers.get('authorization'));
    if (user && isRateLimited(`wheel-user:${user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: say('tooManyWait') }, { status: 429 });
    }
    const r = await spinWheel(sb, user);
    if (r.refusal) {
      const [status, key] = REFUSAL[r.refusal];
      return NextResponse.json({ error: say(`wheel.${key}`), refusal: r.refusal }, { status });
    }
    console.log(`[WHEEL_SPIN] user=${user!.id} prize="${r.result!.label}"`);
    return NextResponse.json(r.result);
  } catch (e) {
    console.error(`[WHEEL_SPIN_FAILED] ip=${ip} ${(e as Error).message}`);
    return NextResponse.json({ error: say('wheel.failed') }, { status: 500 });
  }
}
