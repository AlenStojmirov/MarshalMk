'use client';

/** The wheel page's heading in the visitor's language; the page around it is a server component. */

import { useTranslation } from '@/lib/i18n';

export default function WheelHeading() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-2xl font-bold text-stone-900 text-center">{t('wheel.title')}</h1>
      <p className="text-sm text-stone-600 text-center mt-1 mb-6">{t('wheel.everySpinWins')}</p>
    </>
  );
}
