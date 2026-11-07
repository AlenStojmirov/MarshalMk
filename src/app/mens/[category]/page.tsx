import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import CategoryPageContent from '@/components/CategoryPageContent';
import { fetchPaginatedProducts, fetchShelfCategories, parseSearchParams } from '@/lib/products-server';
import { onPage, pageOf, withPage } from '@/lib/page-number';
import { categoryName, groupName, productTitle } from '@/lib/product-display';
import ProductGrid from '@/components/ProductGrid';
import { jsonLd } from '@/lib/json-ld';
import { categorySearch, categoryShare, SHARE_IMAGE, SHARE_LOCALE, SHARE_SITE_NAME } from '@/lib/share-preview';
import {
  canonicalCategory,
  categoryForSlug,
  groupForSlug,
  groupHref,
  groupOfCategory,
  slugOf,
  type CategoryGroup,
} from '@/config/categories';

/**
 * /mens/{group} (Task 2.4, D-042): one of the ten groups in src/config/categories.ts,
 * its raw categories as chips (?type=turtlenecks). The old address of a raw
 * category (/mens/halfZips) is sent on, for good, to its group's chip. A raw
 * category no group holds yet (a new one from the Firebase app) keeps its own
 * page, as before, while it has something on the shelf.
 */

type SearchParams = Record<string, string | string[] | undefined>;

interface CategoryPageProps {
  params: Promise<{
    category: string;
  }>;
  searchParams: Promise<SearchParams>;
}

const BASE = 'https://marshal.mk';

/** The chip asked for, if it is one of this group's; a group of one has none. */
function typeIn(group: CategoryGroup, type: string | string[] | undefined): string | undefined {
  if (typeof type !== 'string' || group.categories.length < 2) return undefined;
  const raw = categoryForSlug(type);
  return raw && group.categories.includes(raw) ? raw : undefined;
}

async function CategoryPageLoader({ params, searchParams }: CategoryPageProps) {
  const [{ category }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const slug = decodeURIComponent(category);
  const queryParams = parseSearchParams(resolvedSearchParams);
  const group = groupForSlug(slug);
  const type = group ? typeIn(group, resolvedSearchParams.type) : undefined;
  const paginatedData = await fetchPaginatedProducts({
    ...queryParams,
    categories: group ? group.categories : [slug],
    type,
  });

  // Macedonian, like the page's <title> and the product titles (9.7).
  const crumbs = group
    ? [
        { name: groupName(group.key), item: `${BASE}${groupHref(group.key)}` },
        ...(type ? [{ name: categoryName(type), item: `${BASE}${groupHref(group.key, type)}` }] : []),
      ]
    : [{ name: categoryName(slug), item: `${BASE}/mens/${encodeURIComponent(slugOf(slug))}` }];

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Маршал', item: BASE }, ...crumbs].map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(i === crumbs.length ? {} : { item: c.item }),
    })),
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: crumbs[crumbs.length - 1].name,
    numberOfItems: paginatedData.totalCount,
    itemListElement: paginatedData.products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/product/${p.id}`,
      name: productTitle(p),
    })),
  };

  return (
    <>
      {/* jsonLd, not JSON.stringify: the name falls back to the slug from the URL (15.3). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd) }}
      />
      <CategoryPageContent
        paginatedData={paginatedData}
        group={group?.key}
        type={type}
        category={group ? undefined : slug}
      />
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  // Decided before anything streams, so the status is real: a 308 for an old
  // address, a 404 for an unknown one (14.6). A group, empty for now or not,
  // goes straight on.
  let slug: string;
  try {
    slug = decodeURIComponent((await params).category);
  } catch {
    notFound();
  }

  if (!groupForSlug(slug)) {
    const raw = categoryForSlug(slug);
    const group = raw ? groupOfCategory(raw) : undefined;
    if (raw && group) {
      // /mens/halfZips?sizes=M → /mens/knitwear?type=halfzips&sizes=M
      const query = new URLSearchParams();
      if (group.categories.length > 1) query.set('type', slugOf(raw));
      for (const [k, v] of Object.entries(await searchParams)) {
        if (k === 'type' || v === undefined) continue;
        for (const value of Array.isArray(v) ? v : [v]) query.append(k, value);
      }
      const qs = query.toString();
      permanentRedirect(qs ? `${groupHref(group.key)}?${qs}` : groupHref(group.key));
    }
    if ((await fetchPaginatedProducts({ categories: [slug], limit: 1 })).totalCount === 0) {
      notFound();
    }
  }

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
      <CategoryPageLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps) {
  const [{ category }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  let slug: string;
  try {
    slug = decodeURIComponent(category);
  } catch {
    return {};
  }
  const group = groupForSlug(slug);
  const type = group ? typeIn(group, resolvedSearchParams.type) : undefined;

  // A chip has its own address and title ("Машки ролки"), so the old
  // /mens/turtlenecks lands, through its 308, on a page about turtlenecks.
  // Filters and order stay out of the canonical. The page number stays in
  // (16.2): page 2 holds other products, and pointed at page 1 it would ask
  // Google to drop them; its title says which page it is.
  // A group's own page carries the Latin spelling people search with in its
  // title and snippet (D-045, 16.4); its share card stays as written for people.
  const shared = group
    ? type
      ? categoryShare(`Машки ${categoryName(type).toLowerCase()}`, [])
      : categoryShare(group.seoTitle, group.categories.map((c) => categoryName(c)))
    : categoryShare(`Машки ${categoryName(slug).toLowerCase()}`, []);
  const search = group && !type ? categorySearch(group, group.categories.map((c) => categoryName(c))) : shared;
  const page = pageOf(resolvedSearchParams.page);
  const title = onPage(search.title, page);
  const description = search.description;

  // What is on the shelf decides two things (16.3). A group or a kind with
  // nothing in it is kept out of the index until it has: an empty page is not
  // a promise the shop can keep (the menu leaves it out too). A kind that is
  // the only one of its group on the shelf is the group's own page under a
  // second address, so it names the group as its canonical.
  const shelf = group ? await fetchShelfCategories().catch(() => null) : null;
  const kindsOnShelf = new Set(
    (shelf ?? []).filter((c) => groupOfCategory(c)?.key === group?.key).map((c) => slugOf(canonicalCategory(c))),
  );
  const empty = shelf !== null && (type ? !kindsOnShelf.has(slugOf(type)) : kindsOnShelf.size === 0);
  const soleKind = !!type && kindsOnShelf.size === 1 && kindsOnShelf.has(slugOf(type));
  const first = group ? groupHref(group.key, soleKind ? undefined : type) : `/mens/${encodeURIComponent(slugOf(slug))}`;
  const canonical = withPage(first, page);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: onPage(shared.title, page),
      description: shared.description,
      url: canonical,
      siteName: SHARE_SITE_NAME,
      images: [SHARE_IMAGE],
      type: 'website',
      locale: SHARE_LOCALE,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: onPage(shared.title, page),
      description: shared.description,
      images: [SHARE_IMAGE.url],
    },
  };
}
