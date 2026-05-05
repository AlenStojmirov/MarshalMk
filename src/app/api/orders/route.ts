import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  isRateLimited,
  isGloballyThrottled,
  isBlocked,
  recordViolation,
} from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // ── Layer 1: Temporary blocklist ──────────────────────────────────────
  if (isBlocked(ip)) {
    return NextResponse.json(
      { error: 'Access temporarily restricted. Please try again later.' },
      { status: 403 }
    );
  }

  // ── Layer 2: Global circuit breaker ───────────────────────────────────
  if (isGloballyThrottled()) {
    console.error(`[ORDER_ALERT] Global order rate exceeded. ip=${ip}`);
    return NextResponse.json(
      { error: 'We are experiencing high demand. Please try again shortly.' },
      { status: 503 }
    );
  }

  // ── Layer 3: Per-IP rate limit (5 orders per minute) ──────────────────
  if (isRateLimited(`ip:${ip}`, 5, 60_000)) {
    recordViolation(ip);
    console.warn(`[ORDER_RATE_LIMIT] ip=${ip}`);
    return NextResponse.json(
      { error: 'Too many requests. Please wait before placing another order.' },
      { status: 429 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    recordViolation(ip);
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // ── Layer 4: Honeypot ─────────────────────────────────────────────────
  if (body.website) {
    recordViolation(ip);
    console.warn(`[ORDER_HONEYPOT] ip=${ip}`);
    return NextResponse.json({ orderNumber: 'ORD-OK' }, { status: 200 });
  }

  // ── Layer 5: Form timing check ────────────────────────────────────────
  const formLoadedAt = typeof body._t === 'number' ? body._t : 0;
  const submissionMs = Date.now() - formLoadedAt;
  if (formLoadedAt === 0 || submissionMs < 3000) {
    recordViolation(ip);
    console.warn(`[ORDER_TIMING] ip=${ip} submissionMs=${submissionMs}`);
    return NextResponse.json(
      { error: 'Please fill in the form before submitting.' },
      { status: 400 }
    );
  }

  // ── Layer 6: Input validation ─────────────────────────────────────────
  const customer = body.customer as Record<string, string> | undefined;
  const items = body.items as Array<{
    productId: string;
    productName: string;
    productImage: string;
    price: number;
    originalPrice?: number;
    quantity: number;
    size?: string;
  }> | undefined;
  const subtotal = typeof body.subtotal === 'number' ? body.subtotal : undefined;

  if (!customer || !items || !Array.isArray(items) || items.length === 0 || subtotal === undefined) {
    recordViolation(ip);
    return NextResponse.json({ error: 'Missing order data.' }, { status: 400 });
  }

  const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city'] as const;
  for (const field of requiredFields) {
    if (!customer[field] || typeof customer[field] !== 'string' || !customer[field].trim()) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }

  if (items.length > 100) {
    recordViolation(ip);
    return NextResponse.json({ error: 'Too many items in order.' }, { status: 400 });
  }

  for (const item of items) {
    if (
      !item.productId ||
      typeof item.quantity !== 'number' ||
      item.quantity < 1 ||
      item.quantity > 999
    ) {
      return NextResponse.json({ error: 'Invalid item in order.' }, { status: 400 });
    }
  }

  // ── Per-email rate limit (3 orders per hour) ──────────────────────────
  const email = customer.email.trim().toLowerCase();
  if (isRateLimited(`email:${email}`, 3, 3_600_000)) {
    console.warn(`[ORDER_EMAIL_LIMIT] email=${email} ip=${ip}`);
    return NextResponse.json(
      { error: 'Too many orders for this email address. Please try again later.' },
      { status: 429 }
    );
  }

  // ── Create order in Supabase (server-side, service-role) ──────────────
  try {
    const supabase = getSupabaseAdmin();
    const orderNumber = generateOrderNumber();

    const orderRow = {
      order_number: orderNumber,
      customer: {
        firstName: customer.firstName.trim(),
        lastName: customer.lastName.trim(),
        email,
        phone: customer.phone.trim(),
        address: customer.address.trim(),
        city: customer.city.trim(),
        notes: (customer.notes || '').trim().substring(0, 500),
      },
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        price: item.price,
        ...(typeof item.originalPrice === 'number' && item.originalPrice > item.price
          ? { originalPrice: item.originalPrice }
          : {}),
        quantity: item.quantity,
        size: item.size || null,
      })),
      subtotal,
      shipping: 0,
      total: subtotal,
      status: 'pending',
      payment_method: 'cash_on_delivery',
    };

    const { error } = await supabase.from('orders').insert(orderRow);
    if (error) throw error;

    console.log(
      `[ORDER_CREATED] orderNumber=${orderNumber} ip=${ip} email=${email} items=${items.length}`
    );

    return NextResponse.json({ orderNumber }, { status: 201 });
  } catch (err) {
    console.error('[ORDER_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to create order. Please try again.' },
      { status: 500 }
    );
  }
}
