import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rowToOrder, OrderRow } from '@/lib/db-mappers';

export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber');

  if (!orderNumber || !orderNumber.trim()) {
    return NextResponse.json(
      { error: 'Order number is required.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const trimmed = orderNumber.trim();
    const upper = trimmed.toUpperCase();

    console.log('[ORDER_TRACK] Searching for orderNumber:', upper);

    // Try uppercase first (current format), then exact case as a fallback.
    let { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', upper)
      .maybeSingle();

    if (!data && !error) {
      ({ data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', trimmed)
        .maybeSingle());
    }

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const order = rowToOrder(data as OrderRow);

    return NextResponse.json(
      {
        order: {
          ...order,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[ORDER_TRACK_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to look up order. Please try again.' },
      { status: 500 }
    );
  }
}
