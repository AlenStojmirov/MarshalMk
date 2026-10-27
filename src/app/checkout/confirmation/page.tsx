'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Package, Truck, Phone, Mail, MapPin, Copy, Check, Store, Search } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { STORE_MAPS_URL, storeAddress } from '@/config/store';
import { fetchTrackedOrder, recallPlacedOrder, type PlacedOrder, type TrackedOrder } from '@/lib/order-track';

/**
 * The page after the order. It reads the order by number and phone, which the
 * checkout left in this tab (15.2), and shows back the contact details typed
 * there. Opened anywhere else — a shared link, another device — it has only the
 * number and shows only that, with the way to the tracking page.
 */

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { t, language, price } = useTranslation();

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(order?.orderNumber || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mine = orderNumber ? recallPlacedOrder(orderNumber) : null;
      const found = mine ? await fetchTrackedOrder(mine.orderNumber, mine.phone) : null;
      if (cancelled) return;
      setPlaced(mine);
      setOrder(found && 'order' in found ? found.order : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderNumber]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">{t('confirmation.loadingOrder')}</p>
        </div>
      </div>
    );
  }

  if (!order || !placed) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          {orderNumber ? (
            <>
              <p className="text-sm text-gray-500">{t('confirmation.orderNumber')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{orderNumber}</p>
              <p className="mt-4 text-gray-600">{t('confirmation.trackHint')}</p>
              <Link
                href={`/track-order?number=${encodeURIComponent(orderNumber)}`}
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                <Search className="h-5 w-5" />
                {t('confirmation.trackOrder')}
              </Link>
            </>
          ) : (
            <p className="text-xl text-red-500">{t('confirmation.orderNotFound')}</p>
          )}
          <div className="mt-6">
            <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
              {t('confirmation.returnHome')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPickup = order.deliveryMethod === 'pickup';
  const total = price(order.total);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Success Header */}
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('confirmation.title')}
        </h1>
        <p className="text-gray-600">
          {isPickup
            ? t('confirmation.thankYouPickup')
            : t('confirmation.thankYou')}
        </p>
      </div>

      {/* Order Number */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-center">
        <p className="text-sm text-blue-600 mb-1">{t('confirmation.orderNumber')}</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-xl sm:text-2xl font-bold text-blue-800 break-words min-w-0">{order.orderNumber}</p>
          <button
            onClick={copyOrderNumber}
            className="p-1.5 rounded-md hover:bg-blue-100 transition-colors text-blue-600"
            title={copied ? t('common.copied') : t('common.copy')}
          >
            {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <p className="text-sm text-blue-600 mt-2">
          {t('confirmation.saveNumber')}
        </p>
      </div>

      {/* Order Details */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('confirmation.orderDetails')}
          </h2>
        </div>

        {/* Items — no price per line: above the threshold the stored prices carry the
            courier absorbed into them (D-006) and would not match the checkout. */}
        <div className="p-6 border-b">
          <h3 className="font-medium text-gray-900 mb-4">{t('confirmation.itemsOrdered')}</h3>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="relative h-16 w-16 flex-shrink-0">
                  <Image
                    src={item.productImage || '/placeholder.png'}
                    alt={item.productName}
                    fill
                    className={`object-cover rounded-md ring-1 ${item.onSale ? 'ring-red-200' : 'ring-transparent'}`}
                  />
                  {item.onSale && (
                    <span className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                      {t('product.sale')}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{item.productName}</p>
                  <p className="text-sm text-gray-500">
                    {item.size ? `${t('tracking.size')}: ${item.size} · ` : ''}{t('confirmation.qty')}: {item.quantity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="p-6 bg-gray-50">
          <div className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>{isPickup ? t('checkout.pickupLine') : t('checkout.courier')}</span>
              {isPickup && <span className="text-green-600">{t('checkout.noShipping')}</span>}
            </div>
            <hr className="my-2" />
            <div className="flex justify-between text-lg font-bold text-gray-900">
              <span>{t('confirmation.totalToPay')}</span>
              <span>{total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer & Delivery Info — as typed at checkout, from this tab */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t('confirmation.contactInfo')}</h3>
          <div className="space-y-3">
            <p className="text-gray-700">
              {placed.firstName} {placed.lastName}
            </p>
            <p className="flex items-center gap-2 text-gray-600 break-all">
              <Mail className="h-4 w-4 flex-shrink-0" />
              {placed.email}
            </p>
            <p className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4 flex-shrink-0" />
              {placed.phone}
            </p>
          </div>
        </div>

        {/* Where the goods go — the customer's address, or the shop's */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            {isPickup ? <Store className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
            {isPickup ? t('confirmation.pickupTitle') : t('confirmation.deliveryAddress')}
          </h3>
          <div className="flex items-start gap-2 text-gray-600">
            <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
            {isPickup ? (
              <div>
                <p>{storeAddress(language)}</p>
                <a
                  href={STORE_MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  {t('checkout.openInMaps')}
                </a>
              </div>
            ) : (
              <div>
                <p>{placed.address}</p>
                <p>{placed.city}</p>
              </div>
            )}
          </div>
          {placed.notes.trim() && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">{t('checkout.orderNotes')}:</p>
              <p className="text-gray-700">{placed.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
        <p className="font-medium text-amber-800">
          {isPickup ? t('confirmation.pickupPayment') : t('confirmation.paymentMethod')}
        </p>
        <p className="text-sm text-amber-700 mt-1">
          {isPickup
            ? t('confirmation.amountReadyPickup', { amount: total })
            : t('confirmation.amountReady', { amount: total })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
        >
          {t('confirmation.continueShopping')}
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">{t('common.loading')}</p>
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
