import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';
import { forMarketing } from '@/lib/break-even';
import { computePace } from '@/lib/pace-server';

/**
 * How far this month is from zero (Task 10.5). Admin and marketing.
 *
 * Gross profit needs the cost of every unit sold, which lives in the ledger —
 * and the marketing role never reads the ledger or a cost (D-021). So the sum
 * is made here with the service-role key, and the answer depends on who asks:
 * the admin gets the denars, marketing gets only how far along the month is
 * and whether it is ahead of or behind its pace.
 *
 * The role is read from the server's copy of the user, as in /api/admin/users,
 * so a role taken away applies at once.
 *
 *   GET  → { role: 'admin', pace } | { role: 'marketing', pace }
 */

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Не си најавен.');
  const sb = getSupabaseAdmin();
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth.user) return fail(401, 'Најавата е истечена. Најави се повторно.');
  const role = roleOf(auth.user);
  if (role !== 'admin' && role !== 'marketing') return fail(403, 'Нема пристап.');

  const result = await computePace(sb);
  if ('error' in result) return fail(500, result.error);
  const { pace } = result;

  return role === 'admin'
    ? NextResponse.json({ role, pace })
    : NextResponse.json({ role, pace: forMarketing(pace) });
}
