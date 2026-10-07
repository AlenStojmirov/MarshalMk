/**
 * QR codes for the labels on the garments (Task 11.5), from the `qrcode` package.
 *
 * Error correction level M: a label rubs against hangers and bags, and M still
 * reads with about 15% of the code scuffed, while staying small — the longest
 * link today (61 bytes) is a version 4 code, 33 × 33 modules.
 *
 * While the package could not be fetched, an encoder was written here; before
 * it was replaced it was compared with the package module by module, 216 texts
 * of every length up to 213 bytes, all identical (2026-10-07). Labels printed
 * from either read the same.
 *
 * Only the drawing is ours: an SVG with each row's dark run as one rectangle,
 * which keeps a sheet of a few hundred labels light.
 */

import { create } from 'qrcode';

/** The code as an SVG string, with `margin` light modules around it. */
export function qrSvg(text: string, margin = 2): string {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  const dim = size + margin * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!modules.get(y, x)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && modules.get(y, x + run)) run++;
      path += `M${x + margin},${y + margin}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
