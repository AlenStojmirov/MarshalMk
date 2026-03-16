import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber');

  if (!orderNumber || !orderNumber.trim()) {
    return NextResponse.json(
      { error: 'Order number is required.' },
      { status: 400 }
    );
  }

  try {
    const searchValue = orderNumber.trim().toUpperCase();
    console.log('[ORDER_TRACK] Searching for orderNumber:', searchValue);

    const db = getAdminFirestore();
    const snapshot = await db
      .collection('orders')
      .where('orderNumber', '==', searchValue)
      .limit(1)
      .get();

    console.log('[ORDER_TRACK] Query result - empty:', snapshot.empty, 'size:', snapshot.size);

    if (snapshot.empty) {
      // Also try without uppercase in case orders were stored differently
      const snapshotOriginal = await db
        .collection('orders')
        .where('orderNumber', '==', orderNumber.trim())
        .limit(1)
        .get();

      console.log('[ORDER_TRACK] Retry with original case - empty:', snapshotOriginal.empty);

      if (snapshotOriginal.empty) {
        return NextResponse.json(
          { error: 'Order not found.' },
          { status: 404 }
        );
      }

      // Use the result from the retry
      const retryDoc = snapshotOriginal.docs[0];
      const retryData = retryDoc.data();

      const order = {
        id: retryDoc.id,
        orderNumber: retryData.orderNumber,
        customer: retryData.customer,
        items: retryData.items,
        subtotal: retryData.subtotal,
        shipping: retryData.shipping,
        total: retryData.total,
        status: retryData.status,
        paymentMethod: retryData.paymentMethod,
        createdAt: retryData.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        updatedAt: retryData.updatedAt?.toDate()?.toISOString() || new Date().toISOString(),
      };

      return NextResponse.json({ order }, { status: 200 });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    const order = {
      id: doc.id,
      orderNumber: data.orderNumber,
      customer: data.customer,
      items: data.items,
      subtotal: data.subtotal,
      shipping: data.shipping,
      total: data.total,
      status: data.status,
      paymentMethod: data.paymentMethod,
      createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate()?.toISOString() || new Date().toISOString(),
    };

    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    console.error('[ORDER_TRACK_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to look up order. Please try again.' },
      { status: 500 }
    );
  }
}
