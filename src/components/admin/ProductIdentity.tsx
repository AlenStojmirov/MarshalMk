'use client';

/**
 * Who a product is, for the shop floor (owner, 2026-11-23, at the stock count:
 * "не можам да ги препознаам само по шифра").
 *
 * The count used to read "Jackets - #AG003": an English category and the
 * supplier's code. The title written from the attributes says what the piece
 * looks like ("Јакна, слим крој, темно зелена", D-041), and the line under it
 * holds what is on its tag: the colour, the supplier, the code, the price.
 * Measured on the open count the same day: colour and cut on 259 of 311
 * products, supplier and price on all, a photo on 121.
 *
 * The supplier brand is for the back office only; customers never see it.
 */

import { COLORS } from '@/lib/attributes';
import { productTitle } from '@/lib/product-display';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import { mkDen } from '@/lib/mk-format';
import type { Product } from '@/types';

/** The name the shop floor reads: the generated title, else "Маици - #BT051" in Macedonian. */
export const floorName = (p: Product) => productTitle(p, 'mk');

/** Colour, supplier, code and price, on one line. */
export function TagLine({ product: p, className = '' }: { product: Product; className?: string }) {
  const color = p.attributes?.color ? COLORS[p.attributes.color] : undefined;
  const onSale = isOnSale(p);
  return (
    <p className={`flex min-w-0 items-start gap-1.5 text-[11px] text-slate-500 ${className}`}>
      {color && (
        <span
          className="mt-[0.2em] h-3 w-3 shrink-0 rounded-full border border-slate-300"
          style={{ backgroundColor: color.hex }}
          title={color.mk}
          aria-hidden="true"
        />
      )}
      {/* Wraps rather than cuts: on a phone the sale price is what would go. */}
      <span className="min-w-0 break-words">
        {[p.brand, p.name].filter(Boolean).join(' · ')}
        {p.price > 0 && (
          <>
            {' · '}
            <span className="whitespace-nowrap tabular-nums text-slate-700">{mkDen(p.price)}</span>
            {onSale && <span className="whitespace-nowrap tabular-nums text-red-700"> → {mkDen(getEffectivePrice(p))}</span>}
          </>
        )}
      </span>
    </p>
  );
}
