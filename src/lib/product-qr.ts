/**
 * QR labels on the garments: scan, and the sale is two taps away (Task 11.5).
 *
 * One QR per model (owner, 2026-10-06), not per size: a label is printed for a
 * model once and every piece of it carries the same code, whatever its size.
 * The size is picked on the sale screen — and when only one size is left on
 * the shelf it is picked already. The code is a plain link — a phone camera
 * opens it without any app — to the quick sale screen, which needs a
 * back-office login like every other admin page.
 *
 * The link always points at the production site: a label is printed once and
 * stays on the garment, so it must not depend on where it was printed from.
 *
 * Pure: no database, no browser.
 */

import { SITE_URL } from './attribution';

/** From this day this app is the only place sales are entered (D-012, TURNAROUND.md). */
export const SALES_ENTRY_FROM = '2026-11-01';

export const salesEntryOpen = (today: string) => today >= SALES_ENTRY_FROM;

/** The path of the quick sale screen for a model. */
export const sellPath = (productId: string) => `/admin/product/${encodeURIComponent(productId)}/sell`;

/** What the QR holds: the full link, on the production site. */
export const sellUrl = (productId: string) => `${SITE_URL}${sellPath(productId)}`;
