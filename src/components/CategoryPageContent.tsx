'use client';

import { PaginatedResult } from '@/types';
import ProductListingLayout from './ProductListingLayout';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { groupForSlug, groupHref, orList, type GroupKey } from '@/config/categories';

interface CategoryPageContentProps {
  paginatedData: PaginatedResult;
  /** The group this page is (Task 2.4) … */
  group?: GroupKey;
  /** … and the chip chosen in it, a raw category. */
  type?: string;
  /** Or, instead of a group, a raw category no group holds yet. */
  category?: string;
}

export default function CategoryPageContent({
  paginatedData,
  group,
  type,
  category,
}: CategoryPageContentProps) {
  const { t } = useTranslation();

  // A name the translations lack shows as the raw key rather than as "categoryNames.x".
  const named = (key: string, fallback: string) => {
    const s = t(key);
    return s === key ? fallback : s;
  };
  const groupLabel = group ? named(`categoryGroups.${group}`, group) : '';
  const typeLabel = (c: string) => named(`categoryNames.${c}`, c);
  const heading = type ? typeLabel(type) : group ? groupLabel : typeLabel(category ?? '');

  // The chips: the group's categories with something on the shelf, and the
  // one chosen even if it has nothing (an old link). None for a group of one.
  const types = paginatedData.filterMeta.types ?? [];
  const chips = group && (types.length > 1 || type) ? [...types] : [];
  if (type && chips.length > 0 && !chips.some((c) => c.category === type)) {
    chips.push({ category: type, count: 0 });
  }
  const groupCount = types.reduce((a, c) => a + c.count, 0);

  // A few lines on the group (D-045, Task 16.4): what it holds, the Latin
  // spelling people search with, delivery (its price is in the banner above). On the group's own first page only
  // (its chips and page 2 are about other products), and not while it is empty.
  const searchTerms = group ? groupForSlug(group)?.searchTerms ?? [] : [];
  const intro = group && !type && paginatedData.currentPage === 1 && groupCount > 0 && searchTerms.length > 0
    ? [
        t(`categoryIntro.${group}`),
        t('categoryIntro.search', { terms: orList(searchTerms, t('categoryIntro.or')) }),
        t('categoryIntro.delivery'),
      ].join(' ')
    : null;

  const chip = (href: string, label: string, count: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 px-4 py-2 text-[13px] tracking-wide border transition-colors duration-200 ${
        active
          ? 'bg-stone-900 border-stone-900 text-white'
          : 'bg-white border-stone-200 text-stone-700 hover:border-stone-500'
      }`}
    >
      {label}
      <span className={`ml-1.5 ${active ? 'text-stone-300' : 'text-stone-400'}`}>{count}</span>
    </Link>
  );

  return (
    <section className="min-h-screen bg-gray-50" aria-labelledby="category-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductListingLayout
          paginatedData={paginatedData}
          header={
            <>
              <nav aria-label={t('a11y.breadcrumb')} className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link href="/" className="hover:text-gray-900 transition-colors">
                  {t('header.home')}
                </Link>
                <ChevronRight className="h-4 w-4" />
                {group && type ? (
                  <>
                    <Link href={groupHref(group)} className="hover:text-gray-900 transition-colors">
                      {groupLabel}
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    <span className="text-gray-900 font-medium">{heading}</span>
                  </>
                ) : (
                  <span className="text-gray-900 font-medium">{heading}</span>
                )}
              </nav>

              <div className={chips.length > 0 ? 'mb-5' : 'mb-8'}>
                <h1 id="category-heading" className="text-2xl md:text-3xl font-bold text-gray-900">
                  {heading}
                </h1>
                {intro && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-500">{intro}</p>}
              </div>

              {group && chips.length > 0 && (
                <nav
                  aria-label={groupLabel}
                  className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap"
                >
                  {chip(groupHref(group), t('common.all'), groupCount, !type)}
                  {chips.map((c) => chip(groupHref(group, c.category), typeLabel(c.category), c.count, c.category === type))}
                </nav>
              )}
            </>
          }
        />
      </div>
    </section>
  );
}
