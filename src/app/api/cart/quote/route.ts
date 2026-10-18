import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBlocked, isRateLimited } from '@/lib/rate-limit';
import { publicQuote } from '@/lib/loyalty';
import { cleanCartLines, quoteServer, userFromRequest } from '@/lib/basket-server';

/**
 * POST /api/cart/quote — what the checkout shows (Task 13.7).
 *
 * { items: [{ productId, size, quantity }], deliveryMethod, couponCode?, pointsRequested? }
 * with the customer's access token when signed in. Prices from the database;
 * coupons and points only for a member. Only `publicQuote` leaves the server:
 * no purchase price, no floor.
 */

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isBlocked(ip)) return NextResponse.json({ error: 'Пристапот е привремено ограничен.' }, { status: 403 });
  // The checkout asks again as the customer types a coupon or moves the slider.
  if (isRateLimited(`quote:${ip}`, 90, 60_000)) return NextResponse.json({ error: 'Премногу барања. Почекај малку.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Неважечко барање.' }, { status: 400 });
  }
  const lines = cleanCartLines(body.items);
  if (!lines) return NextResponse.json({ error: 'Кошничката е празна или неважечка.' }, { status: 400 });
  const method = body.deliveryMethod === 'pickup' ? 'pickup' : 'courier';

  try {
    const sb = getSupabaseAdmin();
    const user = await userFromRequest(sb, req.headers.get('authorization'));
    const r = await quoteServer(sb, {
      lines,
      method,
      couponCode: typeof body.couponCode === 'string' ? body.couponCode : undefined,
      pointsRequested: typeof body.pointsRequested === 'number' ? body.pointsRequested : 0,
      user,
    });
    return NextResponse.json({
      quote: publicQuote(r.quote),
      unavailable: r.unavailable,
      member: !!r.memberId,
      signedIn: !!user,
      coupon: r.coupon ?? null,
      points: {
        balance: r.quote.points.balance,
        maxUsable: r.quote.points.maxUsable,
        used: r.quote.points.used,
        message: r.pointsMessage ?? null,
      },
      earn: r.quote.earn,
    });
  } catch (e) {
    console.error(`[QUOTE_FAILED] ip=${ip} ${(e as Error).message}`);
    return NextResponse.json({ error: 'Пресметката не успеа. Пробај повторно.' }, { status: 500 });
  }
}
