import { NextResponse } from 'next/server';
import { fetchLiveCampaign } from '@/lib/campaign-server';

/**
 * The campaign whose prices hold now, with its prices (D-051), or null.
 *
 * For the till: the shop's counter reads products the back office's way, at
 * their own prices, and staff cannot read the settings row; the QR sale and the
 * POS start at the campaign price from here. Public on purpose — while it
 * holds, every one of these prices is on the shop's pages anyway; before the
 * start it says nothing.
 */
export async function GET() {
  const campaign = await fetchLiveCampaign();
  return NextResponse.json({ campaign }, { headers: { 'Cache-Control': 'no-store' } });
}
