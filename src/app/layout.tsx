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
import Footer from "@/components/Footer";
import MiniCart from "@/components/MiniCart";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mk">
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link
          rel="dns-prefetch"
          href="https://firebasestorage.googleapis.com"
        />
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
              <Header />
              <main className="min-h-screen">
                {children}
              </main>
              <Footer />
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
