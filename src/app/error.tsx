'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/**
 * A page that failed to render (Task 14.6), inside the shop's header and footer
 * and in the customer's language. "Try again" fetches the page anew (`retry`,
 * stable since Next 16.3). The digest is the id the server log carries for the
 * same failure, so a screenshot from a customer can be matched to it.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <RefreshCw className="h-10 w-10 text-gray-300" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{t('errorPage.title')}</h1>
        <p className="text-gray-500 mb-8">{t('errorPage.description')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t('errorPage.retry')}
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t('errorPage.home')}
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 text-xs text-gray-400">
            {t('errorPage.code')}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
