import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyUnsubscribe } from '@/lib/notifications-server';
import { CUSTOMERS, logConsents } from '@/lib/account-server';

/**
 * GET /api/account/unsubscribe?u=…&t=… — "no more offers" from an e-mail,
 * in one click, without signing in (Task 13.11). The link carries a token
 * signed on the server, so only the customer it was sent to can use it.
 * Account notices (points, coupons) keep coming: they are about the account.
 */

function page(title: string, text: string, status = 200) {
  const html = `<!doctype html><html lang="mk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917"><div style="max-width:420px;margin:48px auto;padding:24px;background:#fff;border-radius:12px">
<p style="font-weight:bold;letter-spacing:2px">MARSHAL</p><h1 style="font-size:20px">${title}</h1><p>${text}</p>
<p><a href="https://marshal.mk/account?tab=profile" style="color:#1c1917">Кон профилот</a></p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  const t = req.nextUrl.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(u) || !t || !verifyUnsubscribe(u, t)) {
    return page('Линкот не важи', 'Понудите можете да ги исклучите и во својот профил, под „Профил“.', 400);
  }
  const sb = getSupabaseAdmin();
  const { data } = await sb.from(CUSTOMERS).update({ marketing_consent: false }).eq('user_id', u).eq('marketing_consent', true).select('user_id');
  if (data && data.length) await logConsents(u, [{ kind: 'marketing', version: null, granted: false }]).catch(() => {});
  return page('Се одјавивте од понудите', 'Повеќе нема да ви праќаме понуди. Известувањата за вашите поени и купони ќе стигнуваат и понатаму.');
}
