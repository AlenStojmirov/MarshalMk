'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { OrderOutcome, OrderStatus } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { mkDate, mkNumber } from '@/lib/mk-format';
import { fetchTrackedOrder, ORDER_NUMBER_MAX, type TrackedOrder } from '@/lib/order-track';
import {
  Search,
  Package,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  ArrowLeft,
  Store,
} from 'lucide-react';

const STATUS_CONFIG: Record<
  OrderStatus,
  { labelKey: string; color: string; icon: React.ElementType; step: number }
> = {
  pending: { labelKey: 'orders.statusPending', color: 'bg-yellow-100 text-yellow-800', icon: Clock, step: 1 },
  confirmed: { labelKey: 'orders.statusConfirmed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle, step: 2 },
  processing: { labelKey: 'orders.statusProcessing', color: 'bg-purple-100 text-purple-800', icon: Package, step: 3 },
  shipped: { labelKey: 'orders.statusShipped', color: 'bg-indigo-100 text-indigo-800', icon: Truck, step: 4 },
  delivered: { labelKey: 'orders.statusDelivered', color: 'bg-green-100 text-green-800', icon: CheckCircle, step: 5 },
  cancelled: { labelKey: 'orders.statusCancelled', color: 'bg-red-100 text-red-800', icon: XCircle, step: 0 },
};

const STATUS_STEPS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function OrderTimeline({ currentStatus }: { currentStatus: OrderStatus }) {
  const { t } = useTranslation();
  const currentStep = STATUS_CONFIG[currentStatus].step;
  const isCancelled = currentStatus === 'cancelled';

  if (isCancelled) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2 text-red-600">
          <XCircle className="h-8 w-8" />
          <span className="text-lg font-medium">{t('orders.statusCancelled')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Mobile: vertical centered layout */}
      <div className="flex flex-col items-center sm:hidden">
        {STATUS_STEPS.map((status, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const StatusIcon = STATUS_CONFIG[status].icon;

          return (
            <div key={status} className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                <StatusIcon className="h-5 w-5" />
              </div>
              <span
                className={`mt-1.5 text-sm ${
                  isCompleted || isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'
                }`}
              >
                {t(STATUS_CONFIG[status].labelKey)}
              </span>
              {index < STATUS_STEPS.length - 1 && (
                <div
                  className={`w-0.5 h-5 my-1 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-center justify-between">
        {STATUS_STEPS.map((status, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const StatusIcon = STATUS_CONFIG[status].icon;

          return (
            <div key={status} className="flex flex-col items-center flex-1">
              <div className="relative flex items-center justify-center w-full">
                {index > 0 && (
                  <div
                    className={`absolute left-0 right-1/2 h-1 -translate-y-1/2 top-1/2 ${
                      isCompleted || isCurrent ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
                {index < STATUS_STEPS.length - 1 && (
                  <div
                    className={`absolute left-1/2 right-0 h-1 -translate-y-1/2 top-1/2 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <StatusIcon className="h-5 w-5" />
                </div>
              </div>
              <span
                className={`mt-2 text-xs text-center ${
                  isCompleted || isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'
                }`}
              >
                {t(STATUS_CONFIG[status].labelKey)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OUTCOME_KEY: Partial<Record<OrderOutcome, string>> = {
  refused: 'tracking.outcomeRefused',
  returned: 'tracking.outcomeReturned',
  not_collected: 'tracking.outcomeNotCollected',
};

const hhmm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

/** `?broj=` from the customer's e-mail (14.5) fills the number; the phone is always typed (D-038). */
function numberFromLink(raw: string | null): string {
  const n = (raw ?? '').trim().toUpperCase();
  return n.length <= ORDER_NUMBER_MAX && /^[A-Z0-9-]+$/.test(n) ? n : '';
}

export default function TrackOrderPage() {
  // Reading the link needs a Suspense boundary; until then the empty form shows,
  // so the page is never blank.
  return (
    <Suspense fallback={<TrackOrder initialNumber="" />}>
      <TrackOrderFromLink />
    </Suspense>
  );
}

function TrackOrderFromLink() {
  return <TrackOrder initialNumber={numberFromLink(useSearchParams().get('broj'))} />;
}

function TrackOrder({ initialNumber }: { initialNumber: string }) {
  const { t } = useTranslation();
  const [orderNumber, setOrderNumber] = useState(initialNumber);
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // The number and the phone it was ordered with (15.2): the number alone shows nothing.
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    const r = await fetchTrackedOrder(orderNumber.trim().toUpperCase(), phone.trim());
    if ('order' in r) {
      setOrder(r.order);
    } else {
      setOrder(null);
      setError(
        r.error === 'not_found' ? t('tracking.orderNotFound')
          : r.error === 'too_many' ? t('tracking.tooMany')
          : t('tracking.searchFailed')
      );
    }
    setLoading(false);
  };

  const statusInfo = order ? STATUS_CONFIG[order.status] : null;
  const createdAt = order ? new Date(order.createdAt) : null;
  const outcomeKey = order?.outcome ? OUTCOME_KEY[order.outcome] : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 hover:gap-3 mb-4 transition-all duration-200 w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('tracking.backToStore')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t('tracking.title')}</h1>
          <p className="mt-2 text-gray-600">{t('tracking.subtitle')}</p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <label htmlFor="orderNumber" className="sr-only">
                {t('tracking.orderNumber')}
              </label>
              <input
                type="text"
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={t('tracking.placeholder')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="sm:w-56">
              <label htmlFor="phone" className="sr-only">
                {t('tracking.phone')}
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('tracking.phonePlaceholder')}
                autoComplete="tel"
                inputMode="tel"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !orderNumber.trim() || !phone.trim()}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none flex items-center justify-center gap-2 transition-all duration-200"
            >
              {loading ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              {t('tracking.search')}
            </button>
          </form>
        </div>

        {/* Error State */}
        {error && searched && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-800 font-medium">{error}</p>
            <p className="text-red-600 text-sm mt-2">{t('tracking.checkNumber')}</p>
          </div>
        )}

        {/* Order Details */}
        {order && statusInfo && createdAt && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Order Header */}
            <div className="p-6 border-b bg-gray-50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('tracking.orderNumber')}</p>
                  <p className="text-xl font-bold text-gray-900 break-words">{order.orderNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${statusInfo.color}`}
                  >
                    <statusInfo.icon className="h-4 w-4" />
                    {t(statusInfo.labelKey)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {t('tracking.orderedOn')}: {mkDate(createdAt)} {t('tracking.at')} {hhmm(createdAt)}
              </p>
              {outcomeKey && <p className="text-sm font-medium text-gray-700 mt-1">{t(outcomeKey)}</p>}
            </div>

            {/* Order Timeline */}
            <div className="px-6 border-b">
              <OrderTimeline currentStatus={order.status} />
            </div>

            {/* Order Items — no price per line: above the threshold the stored prices
                carry the courier absorbed into them (D-006). */}
            <div className="p-6 border-b">
              <h3 className="font-semibold text-gray-900 mb-4">{t('tracking.items')}</h3>
              <div className="space-y-4">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="relative h-16 w-16 flex-shrink-0">
                      <Image
                        src={item.productImage || '/placeholder.png'}
                        alt={item.productName}
                        fill
                        className="object-cover rounded-lg"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.productName}</p>
                      <p className="text-sm text-gray-500">
                        {item.size ? `${t('tracking.size')}: ${item.size} · ` : ''}{t('tracking.qty')}: {item.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery */}
            <div className="p-6 border-b flex items-center gap-3 text-gray-700">
              {order.deliveryMethod === 'pickup' ? <Store className="h-5 w-5 flex-shrink-0" /> : <Truck className="h-5 w-5 flex-shrink-0" />}
              <span>{order.deliveryMethod === 'pickup' ? t('checkout.pickupAt') : t('checkout.courier')}</span>
            </div>

            {/* Order Total */}
            <div className="p-6 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-900">{t('tracking.total')}</span>
                <span className="text-2xl font-bold text-gray-900">{mkNumber(order.total)} ден.</span>
              </div>
            </div>
          </div>
        )}

        {/* Initial State */}
        {!searched && !order && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('tracking.enterOrderNumber')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
