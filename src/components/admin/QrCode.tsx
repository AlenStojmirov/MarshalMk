/**
 * A QR code as inline SVG (Task 11.5), from the encoder in `src/lib/qr.ts`.
 *
 * SVG rather than a canvas or an image: it prints sharp at any label size and
 * needs no network.
 */

import { useMemo } from 'react';
import { qrSvg } from '@/lib/qr';

/** `size` is any CSS length: pixels on screen, millimetres on a label. */
export default function QrCode({ value, size = 96, className = '' }: { value: string; size?: number | string; className?: string }) {
  const svg = useMemo(() => qrSvg(value), [value]);
  return (
    <div
      className={`[&>svg]:w-full [&>svg]:h-full ${className}`}
      style={{ width: size, height: size }}
      aria-label={value}
      // Built by qr.ts from our own link: geometry only, the text never enters the markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
