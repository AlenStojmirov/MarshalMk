import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { userFromRequest } from '@/lib/basket-server';
import { wheelState } from '@/lib/wheel-server';
import { apiSay } from '@/lib/i18n/messages';

/**
 * GET /api/wheel — what the wheel offers now and what this visitor may do
 * (Task 13.10). With the wheel off it says so and nothing else.
 */
export async function GET(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const user = await userFromRequest(sb, req.headers.get('authorization'));
    return NextResponse.json(await wheelState(sb, user));
  } catch (e) {
    console.error(`[WHEEL_STATE_FAILED] ${(e as Error).message}`);
    return NextResponse.json({ error: apiSay(req)('wheel.read') }, { status: 500 });
  }
}
