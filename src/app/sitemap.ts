import { MetadataRoute } from "next";
import { fetchAllVisibleProducts } from "@/lib/products-server";
import { POLICIES } from "@/config/policies";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchLoyaltySettings } from "@/lib/loyalty-settings";
import { canonicalCategory, groupForSlug, groupHref, menuEntries, slugOf } from "@/config/categories";

const BASE_URL = "https://marshal.mk";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await fetchAllVisibleProducts();
  // The wheel's page exists only while the owner has it on (13.10).
  const wheelOn = await fetchLoyaltySettings(getSupabaseAdmin()).then((r) => r.settings.wheelEnabled).catch(() => false);

  // The groups with something on the shelf (Task 2.4), and inside a group of
  // several kinds on the shelf each kind's chip: /mens/knitwear?type=turtlenecks is where
  // the old /mens/turtlenecks now lands.
  const shelf = products.map((p) => p.category);
  const kinds = new Set(shelf.map((c) => slugOf(canonicalCategory(c))));
  const categoryPaths = menuEntries(shelf).flatMap((entry) => {
    if (entry.kind !== "group") return [{ path: entry.href, priority: 0.8 }];
    const group = groupForSlug(entry.key)!;
    const chips = group.categories.filter((c) => kinds.has(slugOf(c)));
    return [
      { path: entry.href, priority: 0.8 },
      ...(chips.length > 1 ? chips.map((c) => ({ path: groupHref(group.key, c), priority: 0.6 })) : []),
    ];
  });

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/new`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/sale`,
      lastModified: new Date(),
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
  const categoryPages: MetadataRoute.Sitemap = categoryPaths.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
  }));

  // Product pages
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${BASE_URL}/product/${product.id}`,
    lastModified:
      product.updatedAt instanceof Date
        ? product.updatedAt
        : (product.updatedAt as unknown as { toDate?: () => Date })
              ?.toDate?.() || new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
