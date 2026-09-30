/**
 * "Може попуст" / "Полна цена" — the discount rule at the moment of sale (D-027).
 *
 * Discounts in the shop are agreed at the till, where no software can stop
 * one; the rule works only if it is in front of whoever is selling. So the
 * badge sits wherever a product is picked for a sale, with the reason on hover
 * and, for the admin, the lowest price the discount may reach.
 */

import { Product } from '@/types';
import { discountVerdict, KIND_LABEL } from '@/lib/discount-rule';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

export default function DiscountBadge({
  product,
  showReason = false,
  now,
}: {
  product: Product;
  /** Print the reason next to the badge, not only on hover. */
  showReason?: boolean;
  now?: number;
}) {
  const v = discountVerdict(product, now);
  const tone = v.allowed
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-slate-100 text-slate-700 border-slate-300';
  const floor = v.allowed && v.floorPrice !== null ? ` · не под ${fmt(v.floorPrice)}` : '';

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" title={`${v.reason}${floor}`}>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${tone}`}>
        {v.allowed ? '🟢' : '🔴'} {KIND_LABEL[v.kind]}
        {floor && <span className="font-normal">{floor}</span>}
      </span>
      {showReason && <span className="text-[11px] text-slate-500">{v.reason}</span>}
    </span>
  );
}

/**
 * The warning under a price typed at the till: a discount the rule does not
 * give, or one below the floor. Null when the price is fine.
 */
export function discountWarning(product: Product, price: number, now?: number): string | null {
  if (!(price > 0) || price >= product.price) return null;
  const v = discountVerdict(product, now);
  if (!v.allowed) return `Попуст на модел што оди по полна цена (${v.reason}).`;
  if (v.floorPrice !== null && price < v.floorPrice) return `Под подот од ${fmt(v.floorPrice)} ден. (набавна + 15%).`;
  return null;
}
