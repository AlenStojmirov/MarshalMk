import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/lib/i18n";
import Header from "@/components/Header";
import FloatingContactButton from "@/components/FloatingContactButton";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://marshal.mk"),
  title: {
    default: "Marshal — Men's Fashion & Clothing Store",
    template: "%s | Marshal",
  },
  description:
    "Shop premium men's clothing — t-shirts, polos, shirts, pants, jackets and more. Quality fashion at great prices with free shipping.",
  keywords: [
    "men's fashion",
    "men's clothing",
    "t-shirts",
    "polos",
    "shirts",
    "pants",
    "jackets",
    "men's wear",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Marshal",
    title: "Marshal — Men's Fashion & Clothing Store",
    description:
      "Shop premium men's clothing — t-shirts, polos, shirts, pants, jackets and more.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Marshal — Men's Fashion Store",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Marshal — Men's Fashion & Clothing Store",
    description:
      "Shop premium men's clothing — t-shirts, polos, shirts, pants, jackets and more.",
    images: ["/og-image.jpg"],
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
    <html lang="en">
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
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <Header />
              <main className="min-h-screen">
                {children}
              </main>
              <Footer />
              <FloatingContactButton />
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
