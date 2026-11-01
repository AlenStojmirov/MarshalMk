import HomeContent from '@/components/HomeContent';
import type { HomeCard } from '@/components/HomeCategoriesSection';
import { fetchAllVisibleProducts } from '@/lib/products-server';
import { groupHref, groupOfCategory, groupsInSeasonOrder, type GroupKey } from '@/config/categories';
import type { Product } from '@/types';

/**
 * The home page reads on the server (Task 2.4): its big cards follow the
 * season and what is on the shelf, and are in the HTML from the start rather
 * than waiting for the browser to read the catalogue. Rebuilt at most once a
 * minute; a new product shows within one.
 */
export const revalidate = 60;

const HOME_CARDS = 3;
const NEW_PRODUCTS = 12;

const hasPhoto = (p: Product) => /^(https?:\/\/|\/)/.test(p.imageUrl?.trim() ?? '');

/**
 * The first three groups of this season's order that have something with a
 * photo on the shelf, each with the photo of its newest product (a featured
 * one first), so the card changes as the stock does.
 */
function seasonCards(products: Product[]): HomeCard[] {
  const byGroup = new Map<GroupKey, Product[]>();
  for (const p of products) {
    const g = groupOfCategory(p.category);
    if (!g || !hasPhoto(p)) continue;
    byGroup.set(g.key, [...(byGroup.get(g.key) ?? []), p]);
  }
  return groupsInSeasonOrder()
    .filter((g) => byGroup.has(g.key))
    .slice(0, HOME_CARDS)
    .map((g) => {
      const shelf = byGroup.get(g.key)!; // newest first, as read
      const pick = shelf.find((p) => p.featured) ?? shelf[0];
      return { group: g.key, href: groupHref(g.key), imageSrc: pick.imageUrl.trim() };
    });
}

export default async function Home() {
  const products = await fetchAllVisibleProducts(); // visible, in stock, newest first
  return <HomeContent cards={seasonCards(products)} newProducts={products.slice(0, NEW_PRODUCTS)} />;
}
