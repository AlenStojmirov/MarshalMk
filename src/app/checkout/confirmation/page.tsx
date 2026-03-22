'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Package, Truck, Phone, Mail, MapPin, Copy, Check } from 'lucide-react';
import { Order } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { getShippingCost, getShippingLabel } from '@/config/shipping';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(order?.orderNumber || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    async function fetchOrder() {
      if (!orderNumber) {
        setError(t('confirmation.orderNotFound'));
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/orders/track?orderNumber=${encodeURIComponent(orderNumber)}`);
        const data = await res.json();

        if (!res.ok || !data.order) {
          setError(t('confirmation.orderNotFound'));
        } else {
          const order = data.order;
          setOrder({
            ...order,
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt),
          });
        }
      } catch (err) {
        console.error('Error fetching order:', err);
        setError(t('confirmation.orderNotFound'));
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderNumber, t]);

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

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <p className="text-xl text-red-500 mb-4">{error || t('confirmation.orderNotFound')}</p>
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {t('confirmation.returnHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Success Header */}
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('confirmation.title')}
        </h1>
        <p className="text-gray-600">
          {t('confirmation.thankYou')}
        </p>
      </div>

      {/* Order Number */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-center">
        <p className="text-sm text-blue-600 mb-1">{t('confirmation.orderNumber')}</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-2xl font-bold text-blue-800">{order.orderNumber}</p>
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

        {/* Items */}
        <div className="p-6 border-b">
          <h3 className="font-medium text-gray-900 mb-4">{t('confirmation.itemsOrdered')}</h3>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="relative h-16 w-16 flex-shrink-0">
                  <Image
                    src={item.productImage || '/placeholder.png'}
                    alt={item.productName}
                    fill
                    className="object-cover rounded-md"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.productName}</p>
                  <p className="text-sm text-gray-500">{t('confirmation.qty')}: {item.quantity}</p>
                </div>
                <p className="font-medium text-gray-900">
                  {(item.price * item.quantity).toFixed(2)} ден.
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="p-6 bg-gray-50">
          <div className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>{t('common.subtotal')}</span>
              <span>{order.subtotal.toFixed(2)} </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{t('common.shipping')}</span>
              <span className="text-green-600">{getShippingLabel(order.total, t('common.free'))}</span>
            </div>
            <hr className="my-2" />
            <div className="flex justify-between text-lg font-bold text-gray-900">
              <span>{t('common.total')}</span>
              <span>{(order.total + getShippingCost(order.total)).toFixed(2)} ден.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer & Delivery Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold text-gray-900 mb-4">{t('confirmation.contactInfo')}</h3>
          <div className="space-y-3">
            <p className="text-gray-700">
              {order.customer.firstName} {order.customer.lastName}
            </p>
            <p className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4" />
              {order.customer.email}
            </p>
            <p className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4" />
              {order.customer.phone}
            </p>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {t('confirmation.deliveryAddress')}
          </h3>
          <div className="flex items-start gap-2 text-gray-600">
            <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
            <div>
              <p>{order.customer.address}</p>
              <p>{order.customer.city}</p>
            </div>
          </div>
          {order.customer.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500">{t('checkout.orderNotes')}:</p>
              <p className="text-gray-700">{order.customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
        <p className="font-medium text-amber-800">{t('confirmation.paymentMethod')}</p>
        <p className="text-sm text-amber-700 mt-1">
          {t('confirmation.amountReady', { amount: (order.total + getShippingCost(order.total)).toFixed(2) })}
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
