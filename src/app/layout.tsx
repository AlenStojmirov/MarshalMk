import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/lib/i18n";
import Header from "@/components/Header";
import FloatingContactButton from "@/components/FloatingContactButton";
import AttributionCapture from "@/components/AttributionCapture";
import HomeScreenGuide from "@/components/HomeScreenGuide";
import { HOME_SEARCH, HOME_SHARE, SHARE_IMAGE, SHARE_LOCALE, SHARE_SITE_NAME } from "@/lib/share-preview";
import { jsonLd } from "@/lib/json-ld";
import { organizationJsonLd } from "@/lib/store-json-ld";
import { fetchMenuEntries } from "@/lib/products-server";
import Footer from "@/components/Footer";
import MiniCart from "@/components/MiniCart";
import { Analytics } from "@vercel/analytics/next";

// Not preloaded (Task 16.5). The shop's text is Arial (globals.css) and Geist
// has no Cyrillic in this subset, so the storefront never draws either face;
// preloaded, they were 52 KB on every page, asked for ahead of the photo a
// phone shows first. Mono is the back office's codes and IDs, fetched there
// the moment one is drawn.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

/**
 * Where a signed-in visitor's session is refreshed as a page opens
 * (AuthContext). Only its name is looked up early, without opening a
 * connection (16.5): since the menu is read on the server (16.2) a visitor who
 * is not signed in never asks Supabase anything, and the photos come through
 * this site's own /_next/image, never from Firebase Storage, which the old
 * hint here connected to on every page.
 */
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

// No canonical and no share address here: they are the home page's own
// (src/app/page.tsx). Set here, they were inherited by every page without its
// own, and Google read /categories as a copy of the home page (Task 16.1).
export const metadata: Metadata = {
  metadataBase: new URL("https://marshal.mk"),
  // Macedonian, like all page metadata (D-039, Task 16.1).
  title: {
    default: HOME_SEARCH.title,
    template: "%s | Marshal",
  },
  description: HOME_SEARCH.description,
  // Kept on an iPhone's home screen, the shop opens as an app under its own
  // name (Task 14.1); the icon is src/app/apple-icon.png, the rest manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Маршал",
    statusBarStyle: "default",
  },
  // What a shared link shows on Facebook, Instagram and Viber (Task 10.8):
  // Macedonian, with the shop's own card. <title> above stays for search (9.7).
  openGraph: {
    type: "website",
    locale: SHARE_LOCALE,
    alternateLocale: ["en_US"],
    siteName: SHARE_SITE_NAME,
    title: HOME_SHARE.title,
    description: HOME_SHARE.description,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_SHARE.title,
    description: HOME_SHARE.description,
    images: [SHARE_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // In the header and footer as links in the HTML (16.2). If the read fails
  // the page still renders, and the header asks from the browser instead.
  const menu = await fetchMenuEntries().catch((err) => {
    console.error("Menu entries could not be read:", err);
    return [];
  });

  return (
    <html lang="mk">
      <head>
        {SUPABASE_ORIGIN && <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        {/* The shop as an organization, on every page; the home page adds the store (16.1). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd()) }}
        />
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <Header categories={menu} />
              <main className="min-h-screen">
                {children}
              </main>
              <Footer categories={menu} />
              <FloatingContactButton />
              <AttributionCapture />
              <HomeScreenGuide />
              <MiniCart />
              <Analytics />
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
