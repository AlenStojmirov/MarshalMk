'use client';

import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/**
 * The 404 (Task 14.6): an old or mistyped link, a deleted product, an unknown
 * category. In the customer's language and inside the shop's header and footer,
 * with the way back to what is on the shelf now rather than a dead end.
 * Rendered by `app/not-found.tsx`.
 */
export default function NotFoundContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <SearchX className="h-10 w-10 text-gray-300" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{t('notFound.title')}</h1>
        <p className="text-gray-500 mb-8">{t('notFound.description')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('notFound.new')}
          </Link>
          <Link
            href="/sale"
            className="px-6 py-3 border border-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t('notFound.sale')}
          </Link>
          <Link
            href="/categories"
            className="px-6 py-3 border border-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t('notFound.categories')}
          </Link>
        </div>
        <Link href="/" className="inline-block mt-6 text-blue-600 hover:text-blue-800 font-medium">
          {t('notFound.home')}
        </Link>
      </div>
    </div>
  );
}
