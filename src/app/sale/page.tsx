import type { Metadata } from 'next';
import { SALE_SEARCH, pageShare } from '@/lib/share-preview';
import { onPage, pageOf, withPage } from '@/lib/page-number';
import SalePageContent from '@/components/SalePageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';

interface SalePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Macedonian, like all page metadata (D-039, Task 16.3); ?page=N keeps its own canonical (16.2). */
export async function generateMetadata({ searchParams }: SalePageProps): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  const path = withPage('/sale', page);
  return {
    title: onPage(SALE_SEARCH.title, page),
    description: SALE_SEARCH.description,
    alternates: { canonical: path },
    ...pageShare(onPage(SALE_SEARCH.title, page), SALE_SEARCH.description, path),
  };
}

async function SalePageLoader({ searchParams }: SalePageProps) {
  const resolved = await searchParams;
  const queryParams = parseSearchParams(resolved);
  const paginatedData = await fetchPaginatedProducts({
    ...queryParams,
    saleOnly: true,
  });

  return <SalePageContent paginatedData={paginatedData} />;
}

// In the first HTML, not behind a Suspense boundary: see /mens/[category] (16.11).
export default async function SalePage({ searchParams }: SalePageProps) {
  return <SalePageLoader searchParams={searchParams} />;
}
