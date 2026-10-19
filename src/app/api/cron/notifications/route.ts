import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';
import { fail, requireUser } from '@/lib/account-server';
import { emailConfigured } from '@/lib/email/brevo';
import { runNotifications } from '@/lib/notifications-server';

/**
 * The customer e-mails (Task 13.11).
 *
 *   GET   Vercel Cron, once a day (vercel.json). Vercel sends
 *         `Authorization: Bearer $CRON_SECRET`; without the secret set, or
 *         with another one, nothing runs.
 *   POST  the owner from /admin/loyalty: { dryRun: true } lists what would go
 *         out today and sends nothing; { dryRun: false } sends it now.
 *
 * Either way it is the same run, and a message already sent is never sent again.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const want = process.env.CRON_SECRET;
  if (!want || req.headers.get('authorization') !== `Bearer ${want}`) return fail(401, 'Не е дозволено.');
  if (!emailConfigured()) return fail(503, 'BREVO_API_KEY не е поставен.');
  try {
    const r = await runNotifications(getSupabaseAdmin(), { dryRun: false });
    console.log(`[NOTIFY_RUN] sent=${r.sent} already=${r.already} failed=${r.failed.length} skipped=${r.skipped} capped=${r.capped} birthdays=${r.birthdayGifts}`);
    return NextResponse.json({ ...r, planned: undefined });
  } catch (e) {
    console.error(`[NOTIFY_RUN_FAILED] ${(e as Error).message}`);
    return fail(500, (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  if (roleOf(auth.user) !== 'admin') return fail(403, 'Само за админ.');
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  if (!dryRun && !emailConfigured()) return fail(503, 'BREVO_API_KEY не е поставен.');
  try {
    return NextResponse.json(await runNotifications(getSupabaseAdmin(), { dryRun }));
  } catch (e) {
    console.error(`[NOTIFY_RUN_FAILED] ${(e as Error).message}`);
    return fail(500, 'Известувањата не се пратени. Пробај повторно.');
  }
}
