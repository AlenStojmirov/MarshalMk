'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Truck, CreditCard, Loader2, Store, MapPin } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { CustomerInfo, DeliveryMethod, OrderItem } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { customerShippingFor, getShippingLabel } from '@/config/shipping';
import { STORE_MAPS_URL, storeAddress } from '@/config/store';
import FreeShippingProgress from '@/components/FreeShippingProgress';
import { getEffectivePrice, isOnSale, getPercentOff } from '@/lib/pricing';
import { ATTRIBUTION_KEY, HEARD_FROM, HEARD_LABEL, isFresh, type HeardFrom, type OrderSource } from '@/lib/attribution';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { accountFetch } from '@/lib/account-client';
import { languageHeaders } from '@/lib/i18n/messages';
import LoyaltyBox, { type QuoteResponse } from '@/components/checkout/LoyaltyBox';
import { rememberPlacedOrder } from '@/lib/order-track';
import { CHECKOUT_DETAIL_FIELDS, type CheckoutDetails } from '@/lib/account';

/** The tracked link this visitor arrived by, if it is recent enough to explain the order (D-025). */
function storedSource(): OrderSource | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    const s = raw ? (JSON.parse(raw) as OrderSource) : null;
    return isFresh(s) ? s : null;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clearCart, couponCode, setCouponCode } = useCart();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const formLoadedAt = useRef(Date.now());
  const errorBoxRef = useRef<HTMLDivElement>(null);
  const { t, language, price } = useTranslation();

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

  // Courier stays the default: it is what every existing customer expects, and
  // a checkout that silently changed its default would be noticed as a bug.
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('courier');
  // Optional: "how did you hear about us?" — never required, never blocks an order.
  const [heard, setHeard] = useState<HeardFrom | ''>('');
  const isPickup = deliveryMethod === 'pickup';

  // ── The server's numbers (13.7) ─────────────────────────────────────────
  // Prices, coupon, points and delivery as the order will book them. Asked
  // again whenever the cart, the delivery, the coupon or the slider moves; the
  // local sums below are only the fallback while the first answer is on its way.
  const [pointsWanted, setPointsWanted] = useState(0);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteReads, setQuoteReads] = useState(0);
  const userId = user?.id;
  const cartKey = JSON.stringify(items.map((i) => [i.product.id, i.selectedSize ?? null, i.quantity]));
  useEffect(() => {
    if (cartKey === '[]') return;
    let live = true;
    const timer = setTimeout(async () => {
      const r = await accountFetch<QuoteResponse>('/api/cart/quote', {
        method: 'POST',
        body: JSON.stringify({
          items: (JSON.parse(cartKey) as Array<[string, string | null, number]>).map(([productId, size, quantity]) => ({ productId, size, quantity })),
          deliveryMethod,
          couponCode: couponCode || undefined,
          pointsRequested: pointsWanted,
        }),
      });
      if (live && r.data) setQuote(r.data);
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [cartKey, deliveryMethod, couponCode, pointsWanted, userId, quoteReads]);

  // ── A signed-in customer's details, filled in (14.9) ───────────────────
  // From the profile, the address from their last delivery. Only empty fields
  // are filled, so nothing already typed is lost, and every field stays theirs
  // to change: a change here is for this order only, the profile stays as is.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      const r = await accountFetch<CheckoutDetails>('/api/account/checkout');
      const d = r.data;
      if (!live || !d || !CHECKOUT_DETAIL_FIELDS.some((k) => d[k])) return;
      setFormData((prev) => {
        const next = { ...prev };
        for (const k of CHECKOUT_DETAIL_FIELDS) if (!prev[k].trim() && d[k]) next[k] = d[k];
        return next;
      });
      setPrefilled(true);
    })();
    return () => { live = false; };
  }, [userId]);

  const q = quote?.quote;
  const shippingNow = q ? q.shipping : customerShippingFor(deliveryMethod, totalPrice);
  const totalNow = q ? q.total : totalPrice + shippingNow;

  // Order matters — used to determine which error field to scroll to first
  const FIELD_ORDER: (keyof CustomerInfo)[] = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'address',
    'city',
  ];

  const scrollToFirstError = (
    newErrors: Partial<Record<keyof CustomerInfo, string>>
  ) => {
    const firstErrorField = FIELD_ORDER.find((field) => newErrors[field]);
    if (!firstErrorField) return;

    // Wait for React to render the error styles before scrolling
    requestAnimationFrame(() => {
      const el = document.getElementById(firstErrorField);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus after scroll for accessibility — slight delay so smooth scroll isn't interrupted
      setTimeout(() => el.focus({ preventScroll: true }), 400);
    });
  };

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
    // No address to ask for when the customer is coming to the shop.
    if (!isPickup && !formData.address.trim()) {
      newErrors.address = `${t('checkout.streetAddress')} ${t('checkout.required')}`;
    }
    if (!isPickup && !formData.city.trim()) {
      newErrors.city = `${t('checkout.city')} ${t('checkout.required')}`;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToFirstError(newErrors);
      return false;
    }
    return true;
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
      const orderItems: OrderItem[] = items.map((item) => {
        const effectivePrice = getEffectivePrice(item.product);
        const onSale = isOnSale(item.product);
        return {
          productId: item.product.id,
          productName: item.product.name,
          productImage: item.product.imageUrl,
          price: effectivePrice,
          ...(onSale ? { originalPrice: item.product.price } : {}),
          quantity: item.quantity,
          size: item.selectedSize,
        };
      });

      // Signed in: the server checks the coupon and the points against the account.
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...languageHeaders(),
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          customer: formData,
          deliveryMethod,
          source: { ...(storedSource() ?? {}), ...(heard ? { heard } : {}) },
          items: orderItems,
          subtotal: totalPrice,
          ...(quote?.coupon?.applied ? { couponCode } : {}),
          ...(quote?.points.used ? { pointsUsed: quote.points.used } : {}),
          website: honeypot,
          _t: formLoadedAt.current,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // A coupon or points that changed since the summary: show the fresh numbers.
        if (data.coupon || data.points) setQuoteReads((n) => n + 1);
        setError(data.error || t('checkout.orderFailed'));
        requestAnimationFrame(() => {
          errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }

      // The confirmation looks the order up by number and phone (15.2); the link alone shows nothing.
      rememberPlacedOrder({
        orderNumber: data.orderNumber,
        phone: formData.phone,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        address: deliveryMethod === 'pickup' ? '' : formData.address,
        city: deliveryMethod === 'pickup' ? '' : formData.city,
        notes: formData.notes ?? '',
      });
      clearCart();
      router.push(`/checkout/confirmation?order=${encodeURIComponent(data.orderNumber)}`);
    } catch (err) {
      console.error('Error creating order:', err);
      setError(t('checkout.orderFailed'));
      requestAnimationFrame(() => {
        errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
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
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:gap-3 font-medium transition-all duration-200"
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
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 hover:gap-3 mb-6 transition-all duration-200 w-fit"
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
              {prefilled && <p className="-mt-2 mb-4 text-sm text-gray-500">{t('checkout.prefilled')}</p>}
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

            {/* How the order reaches the customer */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {t('checkout.deliveryMethod')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup">
                {([
                  { key: 'courier', icon: Truck, title: t('checkout.courier'), hint: t('checkout.courierHint') },
                  { key: 'pickup', icon: Store, title: t('checkout.pickup'), hint: t('checkout.pickupHint') },
                ] as const).map((opt) => {
                  const active = deliveryMethod === opt.key;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setDeliveryMethod(opt.key);
                        // Address errors belong to courier only; switching away
                        // must not leave a red field the customer can no longer see.
                        if (opt.key === 'pickup') {
                          setErrors((prev) => ({ ...prev, address: undefined, city: undefined }));
                        }
                      }}
                      className={`flex items-start gap-3 text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                        active ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span>
                        <span className="block font-medium text-gray-900">{opt.title}</span>
                        <span className="block text-sm text-gray-500">{opt.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {isPickup && (
                <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-start gap-3">
                  <MapPin className="h-5 w-5 shrink-0 mt-0.5 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t('checkout.pickupAt')}</p>
                    <p className="text-sm text-gray-700">{storeAddress(language)}</p>
                    <a
                      href={STORE_MAPS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      {t('checkout.openInMaps')}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Address — only when there is somewhere to deliver */}
            <div className="bg-white rounded-lg shadow-md p-6">
              {/* For pickup only the notes field remains, and it carries its own
                  label — a card heading repeating it would just say it twice. */}
              {!isPickup && (
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {t('checkout.deliveryAddress')}
                </h2>
              )}
              <div className="space-y-4">
                {!isPickup && (
                <>
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
                </>
                )}
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
                <div>
                  <label htmlFor="heardFrom" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('checkout.heardFrom')}
                  </label>
                  <select
                    id="heardFrom"
                    value={heard}
                    onChange={(e) => setHeard(e.target.value as HeardFrom | '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{t('checkout.heardFromChoose')}</option>
                    {HEARD_FROM.map((h) => (
                      <option key={h} value={h}>{HEARD_LABEL[h][language === 'en' ? 'en' : 'mk']}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{t('checkout.heardFromHint')}</p>
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

              {!isPickup && <FreeShippingProgress subtotal={q ? q.afterCoupon : totalPrice} className="mb-5" />}

              <LoyaltyBox
                data={quote}
                couponCode={couponCode}
                onCoupon={(code) => { setCouponCode(code); setError(null); }}
                pointsWanted={pointsWanted}
                onPoints={setPointsWanted}
              />

              {quote && quote.unavailable.length > 0 && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {t('loyalty.unavailable')}
                </div>
              )}

              {/* Order Items */}
              <div className="mb-6 max-h-80 sm:max-h-72 overflow-y-auto -mx-2 px-2 scrollbar-thin">
                <div className="divide-y divide-gray-100">
                  {items.map((item, index) => {
                    const onSale = isOnSale(item.product);
                    const unitPrice = getEffectivePrice(item.product);
                    const percentOff = getPercentOff(item.product);
                    return (
                    <div key={`${item.product.id}-${item.selectedSize || index}`} className="flex gap-3 sm:gap-4 py-4 first:pt-2 last:pb-0">
                      <div className="relative h-16 w-16 sm:h-[68px] sm:w-[68px] flex-shrink-0">
                        <Image
                          src={item.product.imageUrl || '/placeholder.png'}
                          alt={item.product.name}
                          fill
                          className={`object-cover rounded-xl ring-1 ${onSale ? 'ring-red-200' : 'ring-gray-100'}`}
                        />
                        <span className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white text-[10px] font-medium rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
                          {item.quantity}
                        </span>
                        {onSale && (
                          <span className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                            {t('product.sale')}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <p className="text-[13px] sm:text-sm font-semibold text-gray-900 truncate leading-tight">
                          {item.product.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {item.selectedSize && (
                            <span className="text-[11px] sm:text-xs text-gray-500 bg-gray-50 py-0.5 rounded">{t('cart.size')}: {item.selectedSize}</span>
                          )}
                          {onSale ? (
                            <span className="flex items-baseline gap-1.5">
                              <span className="text-[11px] sm:text-xs text-red-600 font-semibold">
                                {price(unitPrice)}
                              </span>
                              <span className="text-[10px] sm:text-[11px] text-gray-400 line-through">
                                {price(item.product.price)}
                              </span>
                              {percentOff > 0 && (
                                <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded">
                                  -{percentOff}%
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[11px] sm:text-xs text-gray-400">
                              {price(unitPrice)} {t('checkout.each')}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-[13px] sm:text-sm font-bold tabular-nums self-center whitespace-nowrap pl-1 ${onSale ? 'text-red-600' : 'text-gray-900'}`}>
                        {price(unitPrice * item.quantity)}
                      </p>
                    </div>
                    );
                  })}
                </div>
              </div>

              <hr className="mb-4" />

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>{t('common.subtotal')}</span>
                  <span>{price(q ? q.goods : totalPrice)}</span>
                </div>
                {(() => {
                  const totalSavings = items.reduce(
                    (sum, item) => sum + (item.product.price - getEffectivePrice(item.product)) * item.quantity,
                    0
                  );
                  return totalSavings > 0 ? (
                    <div className="flex justify-between items-center bg-red-50 border border-red-100 px-3 py-2 rounded-md">
                      <span className="text-red-700 font-medium text-sm flex items-center gap-1.5">
                        <span className="inline-block bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                          {t('product.sale')}
                        </span>
                        {t('cart.youSaved')}
                      </span>
                      <span className="text-red-700 font-semibold tabular-nums">
                        -{price(totalSavings)}
                      </span>
                    </div>
                  ) : null;
                })()}
                {q?.coupon?.applied && q.coupon.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>{t('loyalty.couponLine', { code: q.coupon.code })}</span>
                    <span className="tabular-nums">-{price(q.coupon.discount)}</span>
                  </div>
                )}
                {q && q.points.used > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>{t('loyalty.pointsLine')}</span>
                    <span className="tabular-nums">-{price(q.points.used)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-2">
                    {isPickup ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    {isPickup ? t('checkout.pickupLine') : t('common.shipping')}
                  </span>
                  <span className="text-green-600">
                    {isPickup
                      ? t('checkout.noShipping')
                      : q
                        ? q.shipping > 0
                          ? price(q.shipping)
                          : q.freeShipping === 'coupon' ? `${t('common.free')} (${t('loyalty.couponFreeShipping')})` : t('common.free')
                        : getShippingLabel(totalPrice, t('common.free'), language)}
                  </span>
                </div>
                <hr />
                <div className="flex justify-between text-lg font-bold text-gray-900">
                  <span>{t('common.total')}</span>
                  <span>{price(totalNow)}</span>
                </div>
              </div>

              {error && (
                <div
                  ref={errorBoxRef}
                  className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg"
                >
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-all duration-200 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 flex items-center justify-center gap-2"
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
