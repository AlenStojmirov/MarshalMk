import { MetadataRoute } from "next";
import { fetchAllVisibleProducts } from "@/lib/products-server";
import { POLICIES } from "@/config/policies";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchLoyaltySettings } from "@/lib/loyalty-settings";
import { canonicalCategory, groupForSlug, groupHref, groupOfCategory, menuEntries, slugOf } from "@/config/categories";
import type { Product } from "@/types";

const BASE_URL = "https://marshal.mk";

// Redrawn at most an hour after a request (Task 16.2). Built once, it kept the
// products of the last deploy, and after the switchover products are added
// in the back office without one.
export const revalidate = 3600;

/** When the product last changed, for its <lastmod>. */
function changedAt(product: Product): Date {
  const at = product.updatedAt as unknown;
  if (at instanceof Date) return at;
  return (at as { toDate?: () => Date })?.toDate?.() ?? new Date();
}

/** A listing changes when a product in it does: the newest of them, so the
 * date tells Google something rather than the hour the file was drawn. */
function newest(products: Product[]): Date {
  return products.reduce<Date | undefined>((a, p) => {
    const at = changedAt(p);
    return a && a >= at ? a : at;
  }, undefined) ?? new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await fetchAllVisibleProducts();
  // The wheel's page exists only while the owner has it on (13.10).
  const wheelOn = await fetchLoyaltySettings(getSupabaseAdmin()).then((r) => r.settings.wheelEnabled).catch(() => false);

  // The groups with something on the shelf (Task 2.4), and inside a group of
  // several kinds on the shelf each kind's chip: /mens/knitwear?type=turtlenecks is where
  // the old /mens/turtlenecks now lands.
  const shelf = products.map((p) => p.category);
  const kinds = new Set(shelf.map((c) => slugOf(canonicalCategory(c))));
  const kindOf = (p: Product) => slugOf(canonicalCategory(p.category ?? ""));
  const categoryPaths = menuEntries(shelf).flatMap((entry) => {
    if (entry.kind !== "group") {
      const items = products.filter((p) => kindOf(p) === slugOf(entry.key));
      return [{ path: entry.href, priority: 0.8, items }];
    }
    const group = groupForSlug(entry.key)!;
    const items = products.filter((p) => groupOfCategory(p.category)?.key === group.key);
    const chips = group.categories.filter((c) => kinds.has(slugOf(c)));
    return [
      { path: entry.href, priority: 0.8, items },
      ...(chips.length > 1
        ? chips.map((c) => ({ path: groupHref(group.key, c), priority: 0.6, items: items.filter((p) => kindOf(p) === slugOf(c)) }))
        : []),
    ];
  });
  const onSale = products.filter((p) => p.sale?.isActive);

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: newest(products),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/new`,
      lastModified: newest(products),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/sale`,
      lastModified: newest(onSale.length ? onSale : products),
      changeFrequency: "daily",
      priority: 0.9,
    },
    // Delivery, exchange, privacy (13.5) and the points rules (13.6).
    ...Object.values(POLICIES)
      .filter((p) => p.live)
      .map((p) => ({
        url: `${BASE_URL}${p.path}`,
        lastModified: new Date(p.version),
        changeFrequency: "yearly" as const,
        priority: 0.4,
      })),
    ...(wheelOn ? [{ url: `${BASE_URL}/wheel`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.5 }] : []),
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = categoryPaths.map(({ path, priority, items }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: newest(items),
    changeFrequency: "weekly",
    priority,
  }));

  // Product pages
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${BASE_URL}/product/${product.id}`,
    lastModified: changedAt(product),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
