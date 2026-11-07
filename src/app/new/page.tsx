import { Suspense } from 'react';
import type { Metadata } from 'next';
import { NEW_SEARCH, pageShare } from '@/lib/share-preview';
import { onPage, pageOf, withPage } from '@/lib/page-number';
import NewPageContent from '@/components/NewPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

interface NewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Macedonian, like all page metadata (D-039, Task 16.3); ?page=N keeps its own canonical (16.2). */
export async function generateMetadata({ searchParams }: NewPageProps): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  const path = withPage('/new', page);
  return {
    title: onPage(NEW_SEARCH.title, page),
    description: NEW_SEARCH.description,
    alternates: { canonical: path },
    ...pageShare(onPage(NEW_SEARCH.shareTitle, page), NEW_SEARCH.description, path),
  };
}

async function NewPageLoader({ searchParams }: NewPageProps) {
  const resolved = await searchParams;
  const queryParams = parseSearchParams(resolved);
  const paginatedData = await fetchPaginatedProducts(queryParams);

  return <NewPageContent paginatedData={paginatedData} />;
}

export default async function NewPage({ searchParams }: NewPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white">
          {/* Hero skeleton */}
          <div className="w-full bg-stone-100 py-20 md:py-28 lg:py-36">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 animate-pulse">
              <div className="h-3 bg-stone-200 w-20 mb-5" />
              <div className="h-12 bg-stone-200 w-80 mb-5" />
              <div className="h-4 bg-stone-200 w-64 mb-10" />
              <div className="h-12 bg-stone-200 w-36" />
            </div>
          </div>
          {/* Product grid skeleton */}
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-16 md:py-20">
            <ProductGrid products={[]} loading />
          </div>
        </div>
      }
    >
      <NewPageLoader searchParams={searchParams} />
    </Suspense>
  );
}
