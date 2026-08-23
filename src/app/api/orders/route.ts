import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { applyOrderToStock, revertOrderFromStock } from '@/lib/stock';
import { buildLedgerRow } from '@/lib/sales-ledger';
import {
  isRateLimited,
  isGloballyThrottled,
  isBlocked,
  recordViolation,
} from '@/lib/rate-limit';
import {
  getShippingCost,
  shippingAbsorptionPerUnit,
  SHIPPING_CONFIG,
} from '@/config/shipping';

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

    // ── Money, computed server-side ───────────────────────────────────────
    // Never trust the client for amounts. The gross value is what the customer
    // agreed to pay for the goods; everything else is derived from it.
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const grossSubtotal = round2(
      items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0)
    );

    if (Math.abs(grossSubtotal - subtotal) > 1) {
      console.warn(
        `[ORDER_SUBTOTAL_MISMATCH] client=${subtotal} server=${grossSubtotal} ip=${ip}`
      );
    }

    const customerShipping = getShippingCost(grossSubtotal);

    // Below the threshold the customer pays shipping on top and product prices
    // stand. Above it, shipping is free for the customer but the store still
    // pays the courier, so the cost is spread across the ordered units and
    // deducted from their prices (docs/DECISIONS.md D-006).
    let orderItems = items;
    let absorbed = 0;

    if (customerShipping === 0) {
      const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0);
      const perUnit = shippingAbsorptionPerUnit(totalUnits);

      orderItems = items.map((item) => {
        // Clamp so a cheap line can never end up with a negative price; the
        // absorbed total tracks what was actually deducted either way.
        const reduction = Math.min(perUnit, Number(item.price));
        absorbed += reduction * Number(item.quantity);
        return { ...item, price: round2(Number(item.price) - reduction) };
      });
      absorbed = round2(absorbed);

      if (absorbed > SHIPPING_CONFIG.shippingCost * 1.25) {
        console.warn(
          `[ORDER_SHIPPING_ABSORB_HIGH] absorbed=${absorbed} cost=${SHIPPING_CONFIG.shippingCost} units=${totalUnits} ip=${ip}`
        );
      }
    }

    // Both branches reconcile: subtotal + shipping === total === what is collected.
    const shipping = customerShipping === 0 ? absorbed : customerShipping;
    const netSubtotal = round2(grossSubtotal - absorbed);
    const total = round2(netSubtotal + shipping);

    // ── Reserve the stock before the order exists ─────────────────────────
    // Decided in D-001: stock drops at order time, as a reservation. With one
    // or two pieces per variant, showing something as available after someone
    // has ordered it is worse than briefly hiding a piece that comes back.
    //
    // This also appends to `products.sold[]`, which is still the source of
    // truth for reporting (D-008) — so staff must stop entering online orders
    // by hand or the sale lands twice (D-007).
    const soldDate = new Date().toISOString().slice(0, 10);
    const stockLines = orderItems.map((item) => ({
      productId: item.productId,
      size: item.size ?? null,
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      unitPrice: Number(item.price) || 0,
      soldDate,
    }));

    const reservation = await applyOrderToStock(supabase, stockLines);
    if (!reservation.ok) {
      if (reservation.shortages.length > 0) {
        console.warn(
          `[ORDER_OUT_OF_STOCK] ip=${ip} ${reservation.shortages
            .map((s) => `${s.productId}/${s.size} want=${s.requested} have=${s.available}`)
            .join(' ')}`
        );
        return NextResponse.json(
          {
            error: 'Некои производи веќе не се достапни во избраната големина.',
            shortages: reservation.shortages,
          },
          { status: 409 }
        );
      }
      console.error(`[ORDER_RESERVE_FAILED] ip=${ip} ${reservation.error ?? ''}`);
      return NextResponse.json(
        { error: 'Failed to create order. Please try again.' },
        { status: 500 }
      );
    }


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
      items: orderItems.map((item) => ({
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
      subtotal: netSubtotal,
      shipping,
      total,
      status: 'pending',
      payment_method: 'cash_on_delivery',
    };

    const { error } = await supabase.from('orders').insert(orderRow);
    if (error) {
      // The order does not exist, so the reservation must not either.
      await revertOrderFromStock(supabase, stockLines);
      throw error;
    }

    // ── Ledger ────────────────────────────────────────────────────────────
    // Written after the order so it can carry the order reference. A failure
    // here is recoverable and deliberately not fatal: `sold[]` already has the
    // sale, so `npm run ledger:sync` closes the gap. Losing the order over a
    // ledger write would be the worse trade.
    const { data: orderRowBack } = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber)
      .maybeSingle();

    const productIds = [...new Set(orderItems.map((i) => i.productId))];
    const { data: productMeta } = await supabase
      .from('products')
      .select('id, name, category, purchase_price')
      .in('id', productIds);
    const metaById = new Map(
      ((productMeta ?? []) as Array<{
        id: string;
        name: string | null;
        category: string | null;
        purchase_price: number | string | null;
      }>).map((p) => [p.id, p])
    );

    const ledgerRows = orderItems.flatMap((item) => {
      const meta = metaById.get(item.productId);
      const cost = meta?.purchase_price === null || meta?.purchase_price === undefined
        ? null
        : Number(meta.purchase_price);
      const units = Math.max(1, Math.round(Number(item.quantity) || 1));
      return Array.from({ length: units }, () =>
        buildLedgerRow({
          occurredAt: soldDate + 'T12:00:00.000Z',
          channel: 'online',
          orderId: orderRowBack?.id ?? null,
          orderNumber,
          productId: item.productId,
          productName: meta?.name ?? item.productName ?? null,
          productCategory: meta?.category ?? null,
          size: item.size ?? null,
          qty: 1,
          unitPrice: Number(item.price) || 0,
          // Quoted vs charged differ when shipping was absorbed above the
          // threshold; keeping the quoted figure makes that derivable.
          unitListPrice:
            typeof item.originalPrice === 'number' && item.originalPrice > Number(item.price)
              ? item.originalPrice
              : null,
          unitCost: cost,
          source: 'online',
        })
      );
    });

    const { error: ledgerErr } = await supabase.from('sales_ledger').insert(ledgerRows);
    if (ledgerErr) {
      console.error(
        `[ORDER_LEDGER_FAILED] orderNumber=${orderNumber} ${ledgerErr.message} — run "npm run ledger:sync"`
      );
    }

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
