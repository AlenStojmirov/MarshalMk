import { Suspense } from 'react';
import SalePageContent from '@/components/SalePageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

export const metadata = {
  title: "Sale — Men's Fashion Deals & Discounts",
  description:
    "Shop men's clothing on sale — discounted t-shirts, polos, shirts, pants, jackets and more. Limited-time deals on premium fashion.",
  alternates: {
    canonical: '/sale',
  },
  openGraph: {
    title: "Sale — Men's Fashion Deals & Discounts",
    description:
      "Shop men's clothing on sale — limited-time deals on premium fashion.",
    url: '/sale',
    siteName: 'Marshal',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: "Marshal — Men's Fashion Sale",
      },
    ],
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: "Sale — Men's Fashion Deals & Discounts",
    description:
      "Shop men's clothing on sale — limited-time deals on premium fashion.",
    images: ['/og-image.jpg'],
  },
};

interface SalePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export default async function SalePage({ searchParams }: SalePageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <ProductGrid products={[]} loading />
          </div>
        </div>
      }
    >
      <SalePageLoader searchParams={searchParams} />
    </Suspense>
  );
}
