'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Truck, CreditCard, Loader2 } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { CustomerInfo, OrderItem } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { getShippingCost, getShippingLabel } from '@/config/shipping';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const formLoadedAt = useRef(Date.now());
  const { t } = useTranslation();

  const [formData, setFormData] = useState<CustomerInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CustomerInfo, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CustomerInfo, string>> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = `${t('checkout.firstName')} ${t('checkout.required')}`;
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = `${t('checkout.lastName')} ${t('checkout.required')}`;
    }
    if (!formData.email.trim()) {
      newErrors.email = `${t('checkout.email')} ${t('checkout.required')}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('checkout.invalidEmail');
    }
    if (!formData.phone.trim()) {
      newErrors.phone = `${t('checkout.phone')} ${t('checkout.required')}`;
    }
    if (!formData.address.trim()) {
      newErrors.address = `${t('checkout.streetAddress')} ${t('checkout.required')}`;
    }
    if (!formData.city.trim()) {
      newErrors.city = `${t('checkout.city')} ${t('checkout.required')}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof CustomerInfo]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderItems: OrderItem[] = items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        productImage: item.product.imageUrl,
        price: item.product.price,
        quantity: item.quantity,
        size: item.selectedSize,
      }));

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: formData,
          items: orderItems,
          subtotal: totalPrice,
          website: honeypot,
          _t: formLoadedAt.current,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('checkout.orderFailed'));
        return;
      }

      clearCart();
      router.push(`/checkout/confirmation?order=${data.orderNumber}`);
    } catch (err) {
      console.error('Error creating order:', err);
      setError(t('checkout.orderFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <p className="text-xl text-gray-500 mb-4">{t('cart.empty')}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="h-5 w-5" />
            {t('cart.continueShopping')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-5 w-5" />
        {t('checkout.backToCart')}
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('checkout.title')}</h1>

      <form onSubmit={handleSubmit}>
        {/* Honeypot field — invisible to real users, bots auto-fill it */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Customer Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {t('checkout.contactInfo')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="firstName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.firstName')} *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.firstName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.lastName')} *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.lastName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.email')} *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.email ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-500">{errors.email}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.phone')} *
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.phone ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-500">{errors.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {t('checkout.deliveryAddress')}
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="address"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.streetAddress')} *
                  </label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.address ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.address && (
                    <p className="mt-1 text-sm text-red-500">{errors.address}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.city')} *
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.city ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.city && (
                    <p className="mt-1 text-sm text-red-500">{errors.city}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('checkout.orderNotes')}
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder={t('checkout.orderNotesPlaceholder')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {t('checkout.paymentMethod')}
              </h2>
              <div className="flex items-center gap-4 p-4 border-2 border-blue-500 rounded-lg bg-blue-50">
                <CreditCard className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">{t('checkout.cashOnDelivery')}</p>
                  <p className="text-sm text-gray-500">
                    {t('checkout.cashOnDeliveryDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {t('checkout.orderSummary')}
              </h2>

              {/* Order Items */}
              <div className="mb-6 max-h-80 sm:max-h-72 overflow-y-auto -mx-2 px-2 scrollbar-thin">
                <div className="divide-y divide-gray-100">
                  {items.map((item, index) => (
                    <div key={`${item.product.id}-${item.selectedSize || index}`} className="flex gap-3 sm:gap-4 py-4 first:pt-2 last:pb-0">
                      <div className="relative h-16 w-16 sm:h-[68px] sm:w-[68px] flex-shrink-0">
                        <Image
                          src={item.product.imageUrl || '/placeholder.png'}
                          alt={item.product.name}
                          fill
                          className="object-cover rounded-xl ring-1 ring-gray-100"
                        />
                        <span className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white text-[10px] font-medium rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <p className="text-[13px] sm:text-sm font-semibold text-gray-900 truncate leading-tight">
                          {item.product.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {item.selectedSize && (
                            <span className="text-[11px] sm:text-xs text-gray-500 bg-gray-50 py-0.5 rounded">{t('cart.size')}: {item.selectedSize}</span>
                          )}
                          <span className="text-[11px] sm:text-xs text-gray-400">
                            {item.product.price.toFixed(2)} ден. {t('checkout.each')}
                          </span>
                        </div>
                      </div>
                      <p className="text-[13px] sm:text-sm font-bold text-gray-900 tabular-nums self-center whitespace-nowrap pl-1">
                        {(item.product.price * item.quantity).toFixed(2)} ден.
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="mb-4" />

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>{t('common.subtotal')}</span>
                  <span>{totalPrice.toFixed(2)} ден.</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    {t('common.shipping')}
                  </span>
                  <span className="text-green-600">{getShippingLabel(totalPrice, t('common.free'))}</span>
                </div>
                <hr />
                <div className="flex justify-between text-lg font-bold text-gray-900">
                  <span>{t('common.total')}</span>
                  <span>{(totalPrice + getShippingCost(totalPrice)).toFixed(2)} ден.</span>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t('checkout.placingOrder')}
                  </>
                ) : (
                  t('checkout.placeOrder')
                )}
              </button>

              <p className="text-xs text-gray-500 mt-4 text-center">
                {t('checkout.termsNotice')}
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
