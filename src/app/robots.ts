import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/cart",
          "/checkout/",
          "/track-order",
          "/account",
        ],
      },
    ],
    sitemap: "https://marshal.mk/sitemap.xml",
  };
}
