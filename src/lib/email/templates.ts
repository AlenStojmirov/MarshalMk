/**
 * The customer e-mails, in Macedonian (Task 13.11), and at the end the one to
 * the shop for a new order (14.2). Short, one thing each,
 * with a button to the page it is about. Plain HTML with inline styles: mail
 * clients ignore stylesheets.
 *
 * Two kinds of message, and the footer says which: account notices (points
 * or a coupon about to lapse, the welcome) go to every customer; offers (the
 * birthday) only to those who agreed, with a one-click way out.
 */

import { mkDate, mkDen, mkNumber } from '@/lib/mk-format';
import type { CustomerInfo, OrderItem } from '@/types';

export const SITE = 'https://marshal.mk';

export interface Rendered { subject: string; html: string; text: string }

function layout(body: string, button: { label: string; href: string } | null, footer: string): string {
  return `<!doctype html><html lang="mk"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:0 auto;padding:24px 16px">
  <p style="font-size:20px;font-weight:bold;letter-spacing:2px;margin:0 0 16px">MARSHAL</p>
  <div style="background:#ffffff;border-radius:12px;padding:20px;font-size:15px;line-height:1.5">
    ${body}
    ${button ? `<p style="margin:24px 0 4px"><a href="${button.href}" style="background:#1c1917;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${button.label}</a></p>` : ''}
  </div>
  <p style="font-size:12px;color:#78716c;margin:16px 4px 0">${footer}</p>
</div></body></html>`;
}

const NOTICE_FOOTER = `Ова е известување за твојот профил на <a href="${SITE}/smetka" style="color:#78716c">marshal.mk</a>.`;
const offerFooter = (unsubscribe: string) =>
  `Ја добиваш оваа порака затоа што сакаше понуди од Маршал. <a href="${unsubscribe}" style="color:#78716c">Не сакам понуди</a>.`;

const hi = (name: string) => (name ? `Здраво ${name},` : 'Здраво,');
/** A code read off a phone: kept on one line. */
const code = (c: string) => `<strong style="white-space:nowrap">${c}</strong>`;

export function welcomeEmail(a: { firstName: string; couponCode: string; pct: number; until: Date; minBasket: number }): Rendered {
  const basket = a.minBasket > 0 ? `, за кошничка од ${mkDen(a.minBasket)}` : '';
  return {
    subject: `Добредојде во Маршал: −${mkNumber(a.pct)}% за прва нарачка`,
    html: layout(
      `<p>${hi(a.firstName)}</p>
       <p>Ти благодариме што отвори профил. Еве подарок за првата нарачка:</p>
       <p style="font-size:22px;font-weight:bold;letter-spacing:2px;margin:12px 0;white-space:nowrap">${a.couponCode}</p>
       <p>−${mkNumber(a.pct)}% попуст, важи до ${mkDate(a.until)}${basket}. Со секоја нарачка собираш и поени.</p>`,
      { label: 'Кон продавницата', href: SITE },
      NOTICE_FOOTER,
    ),
    text: `${hi(a.firstName)}\n\nТи благодариме што отвори профил. Подарок за првата нарачка: купон ${a.couponCode}, −${mkNumber(a.pct)}%, важи до ${mkDate(a.until)}${basket}.\n\n${SITE}`,
  };
}

export function pointsExpiringEmail(a: { firstName: string; points: number; until: Date; last: boolean }): Rendered {
  const when = mkDate(a.until);
  return {
    subject: a.last ? `Твоите ${mkNumber(a.points)} поени истекуваат на ${when}` : `${mkNumber(a.points)} поени истекуваат за еден месец`,
    html: layout(
      `<p>${hi(a.firstName)}</p>
       <p>Имаш <strong>${mkNumber(a.points)} поени</strong> (= ${mkDen(a.points)} попуст) што истекуваат на <strong>${when}</strong>.</p>
       <p>${a.last ? 'Ова е последниот потсетник.' : 'Искористи ги на следната нарачка: на наплатата избираш колку поени да потрошиш.'}</p>`,
      { label: 'Мои поени', href: `${SITE}/smetka?tab=poeni` },
      NOTICE_FOOTER,
    ),
    text: `${hi(a.firstName)}\n\nИмаш ${mkNumber(a.points)} поени што истекуваат на ${when}. Искористи ги на следната нарачка.\n\n${SITE}/smetka?tab=poeni`,
  };
}

export function couponExpiringEmail(a: { firstName: string; code: string; what: string; until: Date }): Rendered {
  return {
    subject: `Купонот ${a.code} истекува на ${mkDate(a.until)}`,
    html: layout(
      `<p>${hi(a.firstName)}</p>
       <p>Твојот купон ${code(a.code)} (${a.what}) истекува на <strong>${mkDate(a.until)}</strong>.</p>`,
      { label: 'Мои купони', href: `${SITE}/smetka?tab=kuponi` },
      NOTICE_FOOTER,
    ),
    text: `${hi(a.firstName)}\n\nТвојот купон ${a.code} (${a.what}) истекува на ${mkDate(a.until)}.\n\n${SITE}/smetka?tab=kuponi`,
  };
}

export function birthdayEmail(a: {
  firstName: string; points: number; couponCode?: string; pct?: number; until?: Date; unsubscribe: string;
}): Rendered {
  const gifts = [
    a.points > 0 ? `<strong>${mkNumber(a.points)} поени</strong>` : '',
    a.couponCode ? `купон ${code(a.couponCode)} за −${mkNumber(a.pct ?? 0)}%, до ${mkDate(a.until)}` : '',
  ].filter(Boolean);
  return {
    subject: `Среќен роденден${a.firstName ? `, ${a.firstName}` : ''}! Подарок од Маршал`,
    html: layout(
      `<p>${hi(a.firstName)}</p>
       <p>Среќен роденден од сите нас во Маршал! Ти оставивме подарок на профилот: ${gifts.join(' и ')}.</p>`,
      { label: 'Види го подарокот', href: `${SITE}/smetka` },
      offerFooter(a.unsubscribe),
    ),
    text: `${hi(a.firstName)}\n\nСреќен роденден од Маршал! Подарок на твојот профил.\n\n${SITE}/smetka\n\nНе сакам понуди: ${a.unsubscribe}`,
  };
}

// ---------------------------------------------------------------------------
// To the shop (Task 14.2)
// ---------------------------------------------------------------------------

/** Everything here was typed by a customer, so it is escaped before it goes into HTML. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface NewOrderMail {
  orderNumber: string;
  customer: Pick<CustomerInfo, 'firstName' | 'lastName' | 'email' | 'phone' | 'address' | 'city' | 'notes' | 'deliveryMethod' | 'loyalty'>;
  items: Array<Pick<OrderItem, 'productName' | 'quantity' | 'price'> & { size?: string | null }>;
  subtotal: number;
  shipping: number;
  total: number;
  /** Placed signed in to an account. */
  member: boolean;
  /** The "send a test" button: said in the subject and at the top. */
  test?: boolean;
}

/**
 * A new order, to the addresses the owner set in /admin/settings: who, what,
 * where to, how much to collect, and a button to the orders screen. Item prices
 * are already after coupon and points (D-031), so those are shown as what they
 * took, not taken again.
 */
export function newOrderEmail(o: NewOrderMail): Rendered {
  const c = o.customer;
  const pickup = c.deliveryMethod === 'pickup';
  const name = `${c.firstName} ${c.lastName}`.trim();
  const where = pickup ? 'Подигање во продавница' : [c.address, c.city].filter(Boolean).join(', ');
  const delivery = o.shipping > 0 ? mkDen(o.shipping) : pickup ? 'нема (подигање)' : 'бесплатна';
  const l = c.loyalty ?? {};
  const loyaltyParts = [
    l.couponCode ? `купон ${l.couponCode}${l.couponDiscount ? ` −${mkDen(l.couponDiscount)}` : ''}` : '',
    l.pointsUsed ? `поени −${mkDen(l.pointsUsed)}` : '',
  ].filter(Boolean);
  const units = o.items.reduce((a, i) => a + i.quantity, 0);
  const prefix = o.test ? '[ПРОБА] ' : '';

  const rows = o.items.map((i) =>
    `<tr>
       <td style="padding:6px 0;border-bottom:1px solid #e7e5e4">${esc(i.productName)}${i.size ? `<br><span style="color:#78716c;font-size:13px">Големина ${esc(String(i.size))}</span>` : ''}</td>
       <td style="padding:6px 0 6px 8px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap">${i.quantity} × ${mkDen(i.price)}</td>
     </tr>`).join('');

  const html = layout(
    `${o.test ? '<p style="background:#fef3c7;border-radius:6px;padding:8px 10px;margin:0 0 12px;font-size:13px">Ова е проба од Админ → Поставки. Нарачката не постои.</p>' : ''}
     <p style="margin:0 0 4px;font-size:18px;font-weight:bold">Нова нарачка ${esc(o.orderNumber)}</p>
     <p style="margin:0 0 16px;color:#57534e">${units} ${units === 1 ? 'парче' : 'парчиња'} · за наплата <strong style="color:#1c1917">${mkDen(o.total)}</strong></p>
     <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
     <p style="margin:12px 0 0;font-size:14px">Производи: ${mkDen(o.subtotal)}<br>Достава: ${delivery}<br><strong>За наплата: ${mkDen(o.total)}</strong></p>
     ${loyaltyParts.length ? `<p style="margin:8px 0 0;font-size:13px;color:#57534e">Веќе одземено од цените: ${esc(loyaltyParts.join(', '))}</p>` : ''}
     <p style="margin:16px 0 0;font-size:14px">
       <strong>${esc(name)}</strong>${o.member ? ' · со профил' : ''}<br>
       <a href="tel:${esc(c.phone)}" style="color:#1c1917">${esc(c.phone)}</a> · <a href="mailto:${esc(c.email)}" style="color:#1c1917">${esc(c.email)}</a><br>
       ${esc(where)}
     </p>
     ${c.notes ? `<p style="margin:8px 0 0;font-size:14px;background:#f5f5f4;border-radius:6px;padding:8px 10px">Забелешка: ${esc(c.notes)}</p>` : ''}`,
    { label: 'Отвори ги нарачките', href: `${SITE}/admin/orders` },
    'Известување за нова нарачка на marshal.mk. Адресите се менуваат во Админ → Поставки.',
  );

  const text = [
    `${prefix}Нова нарачка ${o.orderNumber}`,
    '',
    ...o.items.map((i) => `${i.productName}${i.size ? ` (${i.size})` : ''}: ${i.quantity} × ${mkDen(i.price)}`),
    '',
    `Производи: ${mkDen(o.subtotal)}`,
    `Достава: ${delivery}`,
    `За наплата: ${mkDen(o.total)}`,
    ...(loyaltyParts.length ? [`Веќе одземено од цените: ${loyaltyParts.join(', ')}`] : []),
    '',
    `${name}${o.member ? ' (со профил)' : ''}`,
    `${c.phone} · ${c.email}`,
    where,
    ...(c.notes ? [`Забелешка: ${c.notes}`] : []),
    '',
    `${SITE}/admin/orders`,
  ].join('\n');

  return {
    subject: `${prefix}Нова нарачка ${o.orderNumber} · ${mkDen(o.total)} · ${pickup ? 'подигање' : c.city || 'достава'}`,
    html,
    text,
  };
}
