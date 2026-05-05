'use client';

import { Truck, Headphones, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { useTranslation } from '@/lib/i18n';

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function HomeBenefitsSection() {
  const { t } = useTranslation();

  const benefits: Benefit[] = [
    {
      icon: ShieldCheck,
      title: t('benefits.secureShoppingTitle'),
      description: t('benefits.secureShoppingDescription'),
    },
    {
      icon: Truck,
      title: t('benefits.freeShippingTitle'),
      description: t('benefits.freeShippingDescription', {
        amount: SHIPPING_CONFIG.freeShippingThreshold,
      }),
    },
    {
      icon: Headphones,
      title: t('benefits.supportTitle'),
      description: t('benefits.supportDescription'),
    },
  ];

  return (
    <section className="bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="flex flex-col items-center text-center"
              >
                <Icon className="h-10 w-10 text-gray-900 mb-4" strokeWidth={1.5} />
                <h3 className="text-sm font-bold tracking-wide text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-gray-500">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
