import type { MetadataRoute } from 'next';

/**
 * What a phone needs to keep the shop on its home screen as an app (Task 14.1):
 * a name, icons at 192 and 512, and `standalone`, so it opens without the
 * browser's bar. The icons are the mark alone, white on the header's black —
 * the lettering does not survive 48 pixels. `maskable` is the same mark
 * smaller, inside the circle Android may cut an icon to.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Маршал — машка облека',
    short_name: 'Маршал',
    description: 'Машка облека од Виница. Плаќање при достава или подигање во продавница.',
    lang: 'mk',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
