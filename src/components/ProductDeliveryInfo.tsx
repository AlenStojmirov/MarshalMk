'use client';

import Link from 'next/link';
import { Banknote, Repeat, Store, Truck } from 'lucide-react';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { EXCHANGE_REPORT_HOURS, STORE_ADDRESS, STORE_MAPS_URL } from '@/config/store';
import { POLICIES } from '@/config/policies';
import { useCart } from '@/context/CartContext';
import { useTranslation } from '@/lib/i18n';
import { mkDen } from '@/lib/mk-format';

/**
 * Payment, delivery, pickup and exchange under the add-to-cart button (Task 9.11).
 *
 * In a cash-on-delivery shop these are the questions before an order, and the
 * product page answered none of them. Every number comes from the same config
 * the checkout charges by, so the two cannot drift. The exchange terms in full,
 * and the no-refund rule, stay on the policy page only: that text is still
 * waiting on the lawyer, and it should change in one place.
 */
export default function ProductDeliveryInfo() {
  const { t } = useTranslation();
  const { totalItems, totalPrice } = useCart();
  const { shippingCost, freeShippingThreshold } = SHIPPING_CONFIG;

  // Same rule and same subtotal as the cart's progress bar: free from the threshold up.
  const remaining = freeShippingThreshold - totalPrice;
  const cartLine =
    totalItems === 0
      ? null
      : remaining > 0
      ? t('product.delivery.cartRemaining', { amount: mkDen(remaining) })
      : t('product.delivery.cartFree');

  const rows = [
    {
      icon: Banknote,
      title: t('product.delivery.payTitle'),
      text: t('product.delivery.payText'),
    },
    {
      icon: Truck,
      title: t('product.delivery.shipTitle', { amount: mkDen(shippingCost) }),
      text: t('product.delivery.shipText', { amount: mkDen(freeShippingThreshold) }),
      extra: cartLine,
    },
    {
      icon: Store,
      title: t('product.delivery.pickupTitle'),
      text: (
        <>
          <a
            href={STORE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-stone-900"
          >
            {STORE_ADDRESS}
          </a>
          {t('product.delivery.pickupText')}
        </>
      ),
    },
    {
      icon: Repeat,
      title: t('product.delivery.exchangeTitle'),
      text: (
        <>
          {t('product.delivery.exchangeText', { hours: EXCHANGE_REPORT_HOURS })}{' '}
          <Link
            href={`${POLICIES.delivery.path}#zamena`}
            className="underline underline-offset-2 hover:text-stone-900"
          >
            {t('product.delivery.exchangeLink')}
          </Link>
        </>
      ),
    },
  ];

  return (
    <ul className="mt-8 border-t border-stone-200 divide-y divide-stone-100">
      {rows.map(({ icon: Icon, title, text, extra }) => (
        <li key={title} className="flex gap-3 py-4">
          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-stone-500" aria-hidden="true" />
          <div className="text-xs leading-relaxed">
            <p className="text-stone-900 font-medium">{title}</p>
            <p className="text-stone-500">{text}</p>
            {extra && <p className="mt-1 text-stone-700">{extra}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
