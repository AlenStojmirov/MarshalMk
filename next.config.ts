import type { NextConfig } from "next";

/**
 * Sent with every page and route (Task 15.3). Vercel adds HSTS on its own.
 * - No page of ours is ever shown inside another site's frame, so a lookalike
 *   page cannot trick a click on the admin or the checkout.
 * - Files are taken for the type they are served as, never guessed.
 * - Other sites see where a visitor came from only as `https://marshal.mk`.
 * - No page uses the camera, microphone or location, so none may ask.
 * A Content-Security-Policy is its own task (15.9).
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/**
 * The customer pages added in EPIC 13 had Macedonian addresses while the rest
 * of the shop was English; they went English with the rest (D-039). The old
 * addresses are in e-mails already sent, Supabase's confirmation links and
 * search results, so they redirect for good. The query string goes along, and
 * the pages still read the Macedonian names in it (`?tab=kuponi`, `?broj=`).
 */
const OLD_ADDRESSES: [string, string][] = [
  ['/smetka/registracija', '/account/register'],
  ['/smetka/zaboravena-lozinka', '/account/forgot-password'],
  ['/smetka/nova-lozinka', '/account/new-password'],
  ['/smetka', '/account'],
  ['/pravila', '/terms'],
  ['/privatnost', '/privacy'],
  ['/dostava-i-zamena', '/shipping-returns'],
  ['/trkalo', '/wheel'],
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return OLD_ADDRESSES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'i.postimg.cc',
      },
    ],
  },
};

export default nextConfig;
