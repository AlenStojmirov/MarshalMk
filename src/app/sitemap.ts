import { MetadataRoute } from "next";
import { fetchAllVisibleProducts } from "@/lib/products-server";
import { POLICIES } from "@/config/policies";

const BASE_URL = "https://marshal.mk";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await fetchAllVisibleProducts();

  // Extract unique category slugs from products
  const categorySlugs = [
    ...new Set(
      products.map((p) => p.category.toLowerCase().replace(/\s+/g, "-"))
    ),
  ];

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
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: `${BASE_URL}/mens/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
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
