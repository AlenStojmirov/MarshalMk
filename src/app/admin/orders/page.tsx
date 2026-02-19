'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { getOrders, updateOrderStatus } from '@/lib/orders';
import { Order, OrderStatus } from '@/types';
import { useTranslation } from '@/lib/i18n';
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle,
  Truck,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';

const STATUS_CONFIG: Record<
  OrderStatus,
  { labelKey: string; color: string; icon: React.ElementType }
> = {
  pending: { labelKey: 'orders.statusPending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  confirmed: { labelKey: 'orders.statusConfirmed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  processing: { labelKey: 'orders.statusProcessing', color: 'bg-purple-100 text-purple-800', icon: Package },
  shipped: { labelKey: 'orders.statusShipped', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  delivered: { labelKey: 'orders.statusDelivered', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { labelKey: 'orders.statusCancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const STATUS_OPTIONS: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

function OrderCard({
  order,
  onStatusChange,
  t,
}: {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const statusInfo = STATUS_CONFIG[order.status];
  const StatusIcon = statusInfo.icon;

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setUpdating(true);
    try {
      await onStatusChange(order.id, newStatus);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900">
                {order.orderNumber}
              </span>
              <span className="text-sm text-gray-500">
                {order.createdAt.toLocaleDateString()} at{' '}
                {order.createdAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}
            >
              <StatusIcon className="h-4 w-4" />
              {t(statusInfo.labelKey)}
            </span>
            <span className="font-semibold text-gray-900">
              {order.total.toFixed(2)} ден.
            </span>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-600">
          {order.customer.firstName} {order.customer.lastName} &bull;{' '}
          {order.items.length} {order.items.length !== 1 ? t('orders.items') : t('orders.item')}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t">
          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Customer Info */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">{t('orders.customer')}</h4>
              <div className="space-y-1.5 sm:space-y-2 text-sm">
                <p className="font-medium">
                  {order.customer.firstName} {order.customer.lastName}
                </p>
                <p className="flex items-center gap-2 text-gray-600 break-all">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{order.customer.email}</span>
                </p>
                <p className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-4 w-4 shrink-0" />
                  {order.customer.phone}
                </p>
              </div>
            </div>

            {/* Delivery Address */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">{t('orders.deliveryAddress')}</h4>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>{order.customer.address}</p>
                  <p>{order.customer.city}</p>
                </div>
              </div>
              {order.customer.notes && (
                <div className="mt-2 sm:mt-3 p-2 bg-gray-50 rounded text-sm">
                  <span className="font-medium">{t('orders.notes')}: </span>
                  {order.customer.notes}
                </div>
              )}
            </div>

            {/* Update Status */}
            <div className="sm:col-span-2 lg:col-span-1">
              <h4 className="font-medium text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">{t('orders.updateStatus')}</h4>
              <select
                value={order.status}
                onChange={(e) =>
                  handleStatusChange(e.target.value as OrderStatus)
                }
                disabled={updating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm sm:text-base"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {t(STATUS_CONFIG[status].labelKey)}
                  </option>
                ))}
              </select>
              {updating && (
                <p className="mt-2 text-xs sm:text-sm text-gray-500">{t('orders.updating')}</p>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="border-t p-3 sm:p-4">
            <h4 className="font-medium text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">{t('orders.orderItems')}</h4>
            <div className="space-y-2 sm:space-y-3">
              {order.items.map((item, index) => (
                <div key={index} className="flex items-center gap-2 sm:gap-4">
                  <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
                    <Image
                      src={item.productImage || '/placeholder.png'}
                      alt={item.productName}
                      fill
                      className="object-cover rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                      {item.productName}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500">
                      {item.price.toFixed(2)} ден. x {item.quantity}
                      <span className="ml-2">({item.size})</span>
                    </p>
                  </div>
                  <p className="font-medium text-gray-900 text-sm sm:text-base">
                    {(item.price * item.quantity).toFixed(2)} ден.
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t flex justify-between font-semibold text-gray-900">
              <span className="text-sm sm:text-base">{t('orders.total')}</span>
              <span className="text-sm sm:text-base">{order.total.toFixed(2)} ден.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersManagement() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedOrders = await getOrders();
      setOrders(fetchedOrders);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(t('orders.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status: newStatus, updatedAt: new Date() }
            : order
        )
      );
    } catch (err) {
      console.error('Error updating order status:', err);
      alert(t('orders.updateFailed'));
    }
  };

  const filteredOrders =
    filter === 'all'
      ? orders
      : orders.filter((order) => order.status === filter);

  const orderCounts = orders.reduce(
    (acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('orders.backToDashboard')}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('orders.title')}</h1>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm sm:text-base self-start"
        >
          <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 ${loading ? 'animate-spin' : ''}`} />
          {t('orders.refresh')}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
        <div className="flex gap-2 min-w-max pb-2 sm:pb-0 sm:flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-sm sm:text-base whitespace-nowrap ${
              filter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('common.all')} ({orders.length})
          </button>
          {STATUS_OPTIONS.map((status) => {
            const count = orderCounts[status] || 0;
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-sm sm:text-base whitespace-nowrap ${
                  filter === status
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t(STATUS_CONFIG[status].labelKey)} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-500">{t('orders.loading')}</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">{error}</p>
          <button
            onClick={fetchOrders}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            {t('orders.tryAgain')}
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-xl text-gray-500">
            {filter === 'all'
              ? t('orders.noOrders')
              : t('orders.noOrdersWithStatus', { status: t(STATUS_CONFIG[filter].labelKey).toLowerCase() })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LoginPrompt() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-xl text-gray-500 mb-4">
          {t('orders.loginRequired')}
        </p>
        <Link
          href="/admin"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {t('orders.goToLogin')}
        </Link>
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <LoginPrompt />;
  }

  return <OrdersManagement />;
}
