import type { Metadata } from 'next';
import CategoriesContent from '@/components/CategoriesContent';
import { fetchShelfCategories } from '@/lib/products-server';
import { categoriesSearch, pageShare } from '@/lib/share-preview';
import { menuEntryName } from '@/lib/product-display';
import { menuEntries } from '@/config/categories';

/**
 * /categories (Task 2.4), read on the server (16.3): it was drawn in the
 * browser with no metadata of its own, so it took the home page's title and
 * canonical, and Google read it as a copy of the home page. Redrawn with the
 * shelf, every five minutes at most.
 */
async function shelf(): Promise<string[]> {
  return fetchShelfCategories().catch((err) => {
    console.error('Shelf categories could not be read:', err);
    return [];
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = categoriesSearch(menuEntries(await shelf()).map((e) => menuEntryName(e)));
  return {
    title,
    description,
    alternates: { canonical: '/categories' },
    ...pageShare(title, description, '/categories'),
  };
}

export default async function CategoriesPage() {
  return <CategoriesContent shelf={await shelf()} />;
}
