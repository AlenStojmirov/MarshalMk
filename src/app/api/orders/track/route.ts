import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isRateLimited } from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/customers';
import { ORDER_NUMBER_MAX, toTrackedOrder } from '@/lib/order-track';

/**
 * POST /api/orders/track { orderNumber, phone } — where an order is, for the
 * tracking page and the confirmation page (Task 15.2).
 *
 * The number alone is not enough: it is in the confirmation link and the shop's
 * e-mail, and was partly `Math.random`. The phone the order was placed with must
 * match too, compared normalised as the customers screen does (D-014), and a wrong
 * pair gets exactly the answer a missing number gets. The answer carries nothing
 * about the person (`toTrackedOrder`).
 *
 * POST, so the phone is never in a URL or a request log. Limited per IP, and per
 * order number, so guessing phones for a known number goes nowhere.
 */

const PER_IP = 10;
const PER_IP_WINDOW_MS = 60_000;
const PER_ORDER = 20;
const PER_ORDER_WINDOW_MS = 3_600_000;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const notFound = () => NextResponse.json({ error: 'Order not found.' }, { status: 404 });
const tooMany = () => NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 });

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`track:${ip}`, PER_IP, PER_IP_WINDOW_MS)) {
    console.warn(`[ORDER_TRACK_LIMIT] ip=${ip}`);
    return tooMany();
  }

  let body: { orderNumber?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const trimmed = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : '';
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!trimmed || trimmed.length > ORDER_NUMBER_MAX || phone.length < 6) {
    return NextResponse.json({ error: 'Order number and phone are required.' }, { status: 400 });
  }
  const upper = trimmed.toUpperCase();
  if (isRateLimited(`track-order:${upper}`, PER_ORDER, PER_ORDER_WINDOW_MS)) {
    console.warn(`[ORDER_TRACK_LIMIT] order=${upper} ip=${ip}`);
    return tooMany();
  }

  try {
    const supabase = getSupabaseAdmin();
    const columns = 'order_number, created_at, status, outcome, customer, items, total';

    // Uppercase first (every number the shop gives), then exact case as a fallback.
    let { data, error } = await supabase.from('orders').select(columns).eq('order_number', upper).maybeSingle();
    if (!data && !error && trimmed !== upper) {
      ({ data, error } = await supabase.from('orders').select(columns).eq('order_number', trimmed).maybeSingle());
    }
    if (error) throw error;

    if (!data || normalizePhone(data.customer?.phone) !== phone) {
      console.log(`[ORDER_TRACK] miss order=${upper} ip=${ip}`);
      return notFound();
    }
    console.log(`[ORDER_TRACK] ok order=${data.order_number}`);
    return NextResponse.json({ order: toTrackedOrder(data) });
  } catch (err) {
    console.error('[ORDER_TRACK_ERROR]', err);
    return NextResponse.json({ error: 'Failed to look up order. Please try again.' }, { status: 500 });
  }
}
