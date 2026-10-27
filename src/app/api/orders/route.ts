import { NextRequest, NextResponse, after } from 'next/server';
import { cleanSource } from '@/lib/attribution';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { applyOrderToStock, revertOrderFromStock } from '@/lib/stock';
import { buildLedgerRow } from '@/lib/sales-ledger';
import {
  isRateLimited,
  isGloballyThrottled,
  isBlocked,
  recordViolation,
} from '@/lib/rate-limit';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { priceOrder } from '@/lib/order-math';
import { quoteServer, userFromRequest } from '@/lib/basket-server';
import { redeemCoupon, releaseOrderCoupon } from '@/lib/coupons';
import { cancelOrderPoints, creditPoints, redeemPoints } from '@/lib/points';
import { confirmOrderToCustomer, notifyShopOfOrder } from '@/lib/order-notify-server';
import type { OrderLoyalty } from '@/types';
import { apiSay, requestLanguage } from '@/lib/i18n/messages';

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

// 32 letters and digits, without 0/O and 1/I, so a number read over the phone or
// typed from a screenshot comes out right; 32 divides 256, so each is as likely.
const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ORDER_RANDOM_CHARS = 6;

/**
 * `ORD-{time}-{random}`. The random part comes from `crypto` and is six characters
 * (30 bits) where it was four from `Math.random` (15.2). Tracking needs the phone
 * as well now, so the number is no longer a key on its own. Older numbers stay valid.
 */
function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const bytes = crypto.getRandomValues(new Uint8Array(ORDER_RANDOM_CHARS));
  const random = Array.from(bytes, (b) => ORDER_ALPHABET[b % ORDER_ALPHABET.length]).join('');
  return `ORD-${timestamp}-${random}`;
}

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const say = apiSay(request);

  // ── Layer 1: Temporary blocklist ──────────────────────────────────────
  if (isBlocked(ip)) {
    return NextResponse.json(
      { error: say('blocked') },
      { status: 403 }
    );
  }

  // ── Layer 2: Global circuit breaker ───────────────────────────────────
  if (isGloballyThrottled()) {
    console.error(`[ORDER_ALERT] Global order rate exceeded. ip=${ip}`);
    return NextResponse.json(
      { error: say('order.busy') },
      { status: 503 }
    );
  }

  // ── Layer 3: Per-IP rate limit (5 orders per minute) ──────────────────
  if (isRateLimited(`ip:${ip}`, 5, 60_000)) {
    recordViolation(ip);
    console.warn(`[ORDER_RATE_LIMIT] ip=${ip}`);
    return NextResponse.json(
      { error: say('order.tooMany') },
      { status: 429 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    recordViolation(ip);
    return NextResponse.json({ error: say('badRequest') }, { status: 400 });
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
      { error: say('fillForm') },
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
    return NextResponse.json({ error: say('order.missingData') }, { status: 400 });
  }

  // Absent means courier: every client built before pickup existed sends no
  // field at all, and a cached checkout must keep working. Anything else that
  // is not one of the two known values is refused rather than guessed at.
  const rawMethod = body.deliveryMethod;
  if (rawMethod !== undefined && rawMethod !== 'courier' && rawMethod !== 'pickup') {
    return NextResponse.json({ error: say('order.badDelivery') }, { status: 400 });
  }
  const deliveryMethod: 'courier' | 'pickup' = rawMethod === 'pickup' ? 'pickup' : 'courier';
  const source = cleanSource(body.source);

  // An address is only needed when there is something to deliver to.
  const requiredFields = deliveryMethod === 'pickup'
    ? (['firstName', 'lastName', 'email', 'phone'] as const)
    : (['firstName', 'lastName', 'email', 'phone', 'address', 'city'] as const);
  for (const field of requiredFields) {
    if (!customer[field] || typeof customer[field] !== 'string' || !customer[field].trim()) {
      return NextResponse.json(
        { error: say('order.missingField', { field }) },
        { status: 400 }
      );
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return NextResponse.json({ error: say('order.badEmail') }, { status: 400 });
  }

  if (items.length > 100) {
    recordViolation(ip);
    return NextResponse.json({ error: say('order.tooManyItems') }, { status: 400 });
  }

  for (const item of items) {
    if (
      !item.productId ||
      typeof item.quantity !== 'number' ||
      item.quantity < 1 ||
      item.quantity > 999
    ) {
      return NextResponse.json({ error: say('order.badItem') }, { status: 400 });
    }
  }

  // ── Per-email rate limit (3 orders per hour) ──────────────────────────
  const email = customer.email.trim().toLowerCase();
  if (isRateLimited(`email:${email}`, 3, 3_600_000)) {
    console.warn(`[ORDER_EMAIL_LIMIT] ip=${ip}`);
    return NextResponse.json(
      { error: say('order.tooManyForEmail') },
      { status: 429 }
    );
  }

  // ── Create order in Supabase (server-side, service-role) ──────────────
  try {
    const supabase = getSupabaseAdmin();
    const orderNumber = generateOrderNumber();

    // ── Money, computed server-side ───────────────────────────────────────
    // Never trust the client for amounts (13.7): every price comes from the
    // database, and the coupon and the points are the server's arithmetic
    // (quoteServer, the same the checkout showed). The client's subtotal is
    // only compared and logged. The arithmetic lives in lib/loyalty and
    // lib/order-math so it can be checked without a database.
    const couponCode = typeof body.couponCode === 'string' && body.couponCode.trim() ? body.couponCode.trim() : undefined;
    const pointsWanted = typeof body.pointsUsed === 'number' && body.pointsUsed > 0 ? Math.floor(body.pointsUsed) : 0;
    const user = await userFromRequest(supabase, request.headers.get('authorization'));
    const sq = await quoteServer(supabase, {
      lines: items.map((i) => ({ productId: i.productId, size: i.size ?? null, quantity: Math.max(1, Math.round(Number(i.quantity) || 1)) })),
      method: deliveryMethod,
      couponCode,
      lang: requestLanguage(request),
      pointsRequested: pointsWanted,
      user,
    });
    if (sq.unavailable.length > 0) {
      return NextResponse.json(
        { error: say('order.unavailable'), unavailable: sq.unavailable },
        { status: 409 }
      );
    }
    if (couponCode && !sq.coupon?.applied) {
      return NextResponse.json({ error: sq.coupon?.message ?? say('order.couponInvalid'), coupon: true }, { status: 409 });
    }
    if (pointsWanted > 0 && sq.quote.points.used < pointsWanted) {
      return NextResponse.json(
        { error: say('order.pointsChanged'), points: true },
        { status: 409 }
      );
    }
    const q = sq.quote;
    const memberId = sq.memberId;

    if (Math.abs(q.goods - subtotal) > 1) {
      console.warn(`[ORDER_SUBTOTAL_MISMATCH] client=${subtotal} server=${q.goods} ip=${ip}`);
    }

    // Each line at what is paid for it after the coupon and the points (D-031),
    // then the courier absorbed into the prices when delivery is free (D-006),
    // with the delivery decision taken after the coupon, before points (D-032).
    const pricedLines = items.map((item, i) => {
      const line = q.lines[i];
      const product = sq.products.get(item.productId)!.product;
      return {
        productId: item.productId,
        productName: product.name,
        productImage: item.productImage,
        price: Math.round((line.toPay / line.quantity) * 100) / 100,
        originalPrice: product.price,
        quantity: line.quantity,
        size: item.size,
      };
    });
    const priced = priceOrder(pricedLines, deliveryMethod, q.shipping);
    const { absorbed, shipping, total } = priced;
    const orderItems = priced.items;
    const netSubtotal = priced.subtotal;

    // ── Coupon and points, before anything else is written ────────────────
    // Recorded against an id chosen here, so a failure further on can undo
    // them by that id. Each is checked again in the database under a lock: the
    // last use of a coupon, the last points of a balance, go to one order.
    const orderId = crypto.randomUUID();
    const undoLoyalty = async () => {
      if (!memberId) return;
      await cancelOrderPoints(supabase, orderId);
      await releaseOrderCoupon(supabase, orderId);
    };
    const loyalty: OrderLoyalty = {};
    if (memberId && q.coupon?.applied) {
      const shippingWaived = q.freeShipping === 'coupon' ? SHIPPING_CONFIG.shippingCost : 0;
      const r = await redeemCoupon(supabase, {
        code: q.coupon.code, userId: memberId, orderId, orderNumber, discount: q.coupon.discount, shippingWaived,
      });
      if (r.refusal || r.error) {
        console.warn(`[ORDER_COUPON_REFUSED] code=${q.coupon.code} ${r.refusal ?? r.error} ip=${ip}`);
        return NextResponse.json({ error: say('order.couponGone'), coupon: true }, { status: 409 });
      }
      Object.assign(loyalty, { couponCode: q.coupon.code, couponDiscount: q.coupon.discount, ...(shippingWaived ? { shippingWaived } : {}) });
    }
    if (memberId && q.points.used > 0) {
      const r = await redeemPoints(supabase, memberId, q.points.used, orderId, orderNumber);
      if (r.error) {
        await releaseOrderCoupon(supabase, orderId);
        console.warn(`[ORDER_POINTS_REFUSED] ${r.error} ip=${ip}`);
        return NextResponse.json(
          { error: say('order.pointsChanged'), points: true },
          { status: 409 }
        );
      }
      loyalty.pointsUsed = q.points.used;
    }

    if (absorbed > SHIPPING_CONFIG.shippingCost * 1.25) {
      const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0);
      console.warn(
        `[ORDER_SHIPPING_ABSORB_HIGH] absorbed=${absorbed} cost=${SHIPPING_CONFIG.shippingCost} units=${totalUnits} ip=${ip}`
      );
    }

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
      await undoLoyalty();
      if (reservation.shortages.length > 0) {
        console.warn(
          `[ORDER_OUT_OF_STOCK] ip=${ip} ${reservation.shortages
            .map((s) => `${s.productId}/${s.size} want=${s.requested} have=${s.available}`)
            .join(' ')}`
        );
        return NextResponse.json(
          {
            error: say('order.sizeUnavailable'),
            shortages: reservation.shortages,
          },
          { status: 409 }
        );
      }
      console.error(`[ORDER_RESERVE_FAILED] ip=${ip} ${reservation.error ?? ''}`);
      return NextResponse.json(
        { error: say('order.failed') },
        { status: 500 }
      );
    }


    // Earned on this order: pending until it is delivered and paid (13.8).
    if (memberId && q.earn > 0) loyalty.pointsEarned = q.earn;

    const orderRow = {
      id: orderId,
      order_number: orderNumber,
      customer: {
        firstName: customer.firstName.trim(),
        lastName: customer.lastName.trim(),
        email,
        phone: customer.phone.trim(),
        // Kept as empty strings for pickup rather than dropped, so every reader
        // that expects the fields to exist keeps working.
        address: deliveryMethod === 'pickup' ? '' : (customer.address || '').trim(),
        city: deliveryMethod === 'pickup' ? '' : (customer.city || '').trim(),
        notes: (customer.notes || '').trim().substring(0, 500),
        deliveryMethod,
        // How they found the shop (D-025). Cleaned, never a reason to refuse an order.
        ...(source ? { source } : {}),
        // The account and the loyalty side (13.7), in `customer` like the two above.
        ...(memberId ? { userId: memberId } : {}),
        ...(Object.keys(loyalty).length ? { loyalty } : {}),
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
      // The order does not exist, so the reservation, the coupon use and the
      // spent points must not either.
      await revertOrderFromStock(supabase, stockLines);
      await undoLoyalty();
      throw error;
    }

    // ── Points earned ─────────────────────────────────────────────────────
    // Pending, without a date, until the order is delivered and paid (13.8).
    // Not fatal: the order stands, and the owner can add them by hand.
    if (memberId && q.earn > 0) {
      const r = await creditPoints(supabase, { userId: memberId, kind: 'earn', points: q.earn, orderId, orderNumber });
      if (r.error) console.error(`[ORDER_EARN_FAILED] orderNumber=${orderNumber} points=${q.earn} ${r.error}`);
    }

    // ── Ledger ────────────────────────────────────────────────────────────
    // Written after the order so it can carry the order reference. A failure
    // here is recoverable and deliberately not fatal: `sold[]` already has the
    // sale, so `npm run ledger:sync` closes the gap. Losing the order over a
    // ledger write would be the worse trade.
    const orderRowBack = { id: orderId };

    const productIds = [...new Set(orderItems.map((i) => i.productId))];
    // Read from products_costed: since migration 008 the cost lives in
    // product_costs and products.purchase_price is always empty. Should the
    // cost still come back null, the ledger trigger fills it on insert.
    const readMeta = (table: string) =>
      supabase.from(table).select('id, name, category, purchase_price').in('id', productIds);
    let { data: productMeta, error: metaErr } = await readMeta('products_costed');
    if (metaErr) ({ data: productMeta, error: metaErr } = await readMeta('products'));
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
      `[ORDER_CREATED] orderNumber=${orderNumber} ip=${ip} items=${items.length}`
    );

    // ── E-mails: to the shop (14.2) and the customer's copy (14.5) ────────
    // After the response: the customer never waits for them, and a failure is
    // only logged — the order stands either way. The customer's address stays
    // out of the log (D-038).
    after(async () => {
      const mail = {
        orderNumber,
        customer: orderRow.customer,
        items: orderRow.items,
        subtotal: netSubtotal,
        shipping,
        total,
        member: !!memberId,
      };
      const [shop, own] = await Promise.all([notifyShopOfOrder(supabase, mail), confirmOrderToCustomer(mail)]);
      if (shop.failed.length) console.error(`[ORDER_NOTIFY_FAILED] orderNumber=${orderNumber} ${shop.failed.join(' | ')}`);
      else if (shop.skipped) console.log(`[ORDER_NOTIFY_SKIPPED] orderNumber=${orderNumber} ${shop.skipped}`);
      if (own.error) console.error(`[ORDER_CONFIRM_FAILED] orderNumber=${orderNumber} ${own.error}`);
      else if (own.skipped) console.log(`[ORDER_CONFIRM_SKIPPED] orderNumber=${orderNumber} ${own.skipped}`);
    });

    return NextResponse.json({ orderNumber }, { status: 201 });
  } catch (err) {
    console.error('[ORDER_ERROR]', err);
    return NextResponse.json(
      { error: say('order.failed') },
      { status: 500 }
    );
  }
}
