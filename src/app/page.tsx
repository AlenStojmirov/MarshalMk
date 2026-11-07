import type { Metadata } from 'next';
import HomeContent from '@/components/HomeContent';
import { jsonLd } from '@/lib/json-ld';
import { storeJsonLd, websiteJsonLd } from '@/lib/store-json-ld';
import { HOME_SEARCH, HOME_SHARE, SHARE_IMAGE, SHARE_LOCALE, SHARE_SITE_NAME } from '@/lib/share-preview';
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

/**
 * Its title and snippet in search (Task 16.1), its own canonical, and the
 * share card (10.8) with its own address. `absolute`: the home page is the
 * one title without "| Marshal" after it.
 */
export const metadata: Metadata = {
  title: { absolute: HOME_SEARCH.title },
  description: HOME_SEARCH.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: SHARE_LOCALE,
    alternateLocale: ['en_US'],
    url: '/',
    siteName: SHARE_SITE_NAME,
    title: HOME_SHARE.title,
    description: HOME_SHARE.description,
    images: [SHARE_IMAGE],
  },
};

export default async function Home() {
  const products = await fetchAllVisibleProducts(); // visible, in stock, newest first
  return (
    <>
      {/* The website and the shop in Vinica (16.1); the organization comes from the layout. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(storeJsonLd(products)) }} />
      <HomeContent cards={seasonCards(products)} newProducts={products.slice(0, NEW_PRODUCTS)} />
    </>
  );
}
