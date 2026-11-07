'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];

  if (current > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('ellipsis');
  }

  pages.push(total);

  return pages;
}

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const hrefFor = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams]
  );

  // Links, not buttons (Task 16.2): a search engine follows ?page=2 to the
  // products past the first twelve. A click stays in the page as before,
  // dimmed while the next page loads; a middle click opens a tab.
  const linkTo = (page: number) => ({
    href: hrefFor(page),
    scroll: false,
    prefetch: false,
    onNavigate: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      startTransition(() => router.push(hrefFor(page), { scroll: false }));
    },
  });

  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);
  const stepClass =
    'flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm transition-all duration-150';
  const stepLive =
    'hover:bg-gray-50 hover:border-gray-400 hover:shadow active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1';

  return (
    <nav
      aria-label={t('pagination.label')}
      className={`flex items-center justify-center gap-1 mt-10 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {currentPage > 1 ? (
        <Link {...linkTo(currentPage - 1)} rel="prev" aria-label={t('pagination.previousPage')} className={`${stepClass} ${stepLive}`}>
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t('pagination.previous')}</span>
        </Link>
      ) : (
        <span aria-disabled="true" aria-label={t('pagination.previousPage')} className={`${stepClass} opacity-40 cursor-not-allowed`}>
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t('pagination.previous')}</span>
        </span>
      )}

      <div className="flex items-center gap-1">
        {pages.map((page, idx) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-2 py-2 text-sm text-gray-400"
            >
              ...
            </span>
          ) : (
            <Link
              key={page}
              {...linkTo(page)}
              aria-current={page === currentPage ? 'page' : undefined}
              className={`min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.95] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 ${
                page === currentPage
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'text-gray-700 bg-white border border-gray-300 shadow-sm hover:bg-gray-50 hover:border-gray-400 hover:shadow'
              }`}
            >
              {page}
            </Link>
          )
        )}
      </div>

      {currentPage < totalPages ? (
        <Link {...linkTo(currentPage + 1)} rel="next" aria-label={t('pagination.nextPage')} className={`${stepClass} ${stepLive}`}>
          <span className="hidden sm:inline">{t('pagination.next')}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-disabled="true" aria-label={t('pagination.nextPage')} className={`${stepClass} opacity-40 cursor-not-allowed`}>
          <span className="hidden sm:inline">{t('pagination.next')}</span>
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
