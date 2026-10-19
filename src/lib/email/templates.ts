/**
 * The customer e-mails, in Macedonian (Task 13.11). Short, one thing each,
 * with a button to the page it is about. Plain HTML with inline styles: mail
 * clients ignore stylesheets.
 *
 * Two kinds of message, and the footer says which: account notices (points
 * or a coupon about to lapse, the welcome) go to every customer; offers (the
 * birthday) only to those who agreed, with a one-click way out.
 */

import { mkDate, mkDen, mkNumber } from '@/lib/mk-format';

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
