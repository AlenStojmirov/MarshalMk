import type { Metadata } from 'next';
import { NEW_SEARCH, pageShare } from '@/lib/share-preview';
import { onPage, pageOf, withPage } from '@/lib/page-number';
import NewPageContent from '@/components/NewPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';

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

// In the first HTML, not behind a Suspense boundary: see /mens/[category] (16.11).
export default async function NewPage({ searchParams }: NewPageProps) {
  return <NewPageLoader searchParams={searchParams} />;
}
