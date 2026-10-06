'use client';

/**
 * Quick sale from a scanned label (Task 11.5).
 *
 * The QR on the garment opens this page for its model; recording the sale is:
 * pick the size (already picked when only one is left), check the price, tap
 * "Продај". It goes
 * through `recordProductSale`, like the POS and the product page — stock
 * through stock.ts (D-013), the ledger row with it.
 *
 * The price starts at the price on the site today; a discount agreed at the
 * till is typed over it, and the badge and warning say whether the rule allows
 * one (D-027). Before the switchover day sales are still entered in Firebase
 * (D-012), and the page says so rather than refusing: the owner tests it first.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useProduct } from '@/hooks/useProducts';
import { recordProductSale } from '@/hooks/useInStoreSales';
import { Product } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { getProductDisplayName } from '@/lib/product-display';
import { salesEntryOpen, SALES_ENTRY_FROM } from '@/lib/product-qr';
import DiscountBadge, { discountWarning } from '@/components/admin/DiscountBadge';
import { AlertTriangle, ArrowLeft, Check } from 'lucide-react';

const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Skopje' }).format(d);

export default function QuickSellPage() {
  const params = useParams();
  const productId = params.id as string;
  const { product, loading, error } = useProduct(productId);

  const [current, setCurrent] = useState<Product | null>(null);
  const [size, setSize] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [selling, setSelling] = useState(false);
  const [done, setDone] = useState<{ size: string; price: number } | null>(null);
  const [today] = useState(() => localDay(new Date()));

  useEffect(() => {
    if (!product) return;
    setCurrent(product);
    setPrice(String(getEffectivePrice(product)));
    // One size left on the shelf: that is the one in the customer's hands.
    const live = (product.sizes ?? []).filter((s) => s.size && s.quantity >= 1);
    setSize((cur) => cur || (live.length === 1 ? live[0].size : ''));
  }, [product]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (error || !current) {
    return <p className="p-6 text-center text-red-700">Производот не е најден ({productId}).</p>;
  }

  const shelf = (current.sizes ?? []).filter((s) => s.size);
  const left = shelf.find((s) => s.size === size)?.quantity ?? 0;
  const amount = Math.max(0, Number(price) || 0);
  const warning = discountWarning(current, amount);
  const canSell = !selling && (shelf.length === 0 || (size !== '' && left >= 1)) && amount > 0;

  const sell = async () => {
    if (!canSell) return;
    setSelling(true);
    try {
      const written = await recordProductSale(current, size, amount, today);
      setCurrent({ ...current, ...written });
      setDone({ size, price: amount });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-5">
        <Link href={`/admin/product/${current.id}`} className="inline-flex items-center gap-2 text-slate-500 text-sm mb-4">
          <ArrowLeft className="h-4 w-4" /> Производот
        </Link>

        {!salesEntryOpen(today) && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              До {SALES_ENTRY_FROM.split('-').reverse().join('.')} продажбите се внесуваат во Firebase. Продажба запишана
              тука, а не и таму, ја запира синхронизацијата за овој производ. Истата продажба не смее да се внесе на двете места.
            </span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex gap-3">
            {current.imageUrl && (
              <div className="relative w-20 h-24 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                <Image src={current.imageUrl} alt="" fill className="object-cover" sizes="80px" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 leading-tight">
                {getProductDisplayName(current.name, current.category, current.brand)}
              </h1>
              <p className="text-[11px] text-slate-400">{current.id}</p>
              <div className="mt-1"><DiscountBadge product={current} showReason /></div>
            </div>
          </div>

          {done ? (
            <div className="mt-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
                <Check className="h-6 w-6 text-green-700" />
              </div>
              <p className="font-semibold text-green-800">
                Продадено{done.size ? ` · ${done.size}` : ''} · {Math.round(done.price).toLocaleString('mk-MK')} ден.
              </p>
              <p className="text-xs text-slate-500 mt-1">Скенирај ја следната етикета.</p>
              <button onClick={() => { setDone(null); setSize(''); }} className="mt-4 text-sm text-blue-700 underline">
                Уште едно парче од овој модел
              </button>
            </div>
          ) : (
            <>
              {shelf.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-600 mb-1">
                    Големина
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {shelf.map((s) => (
                      <button
                        key={s.size}
                        onClick={() => setSize(s.size)}
                        disabled={s.quantity < 1}
                        className={`px-3 py-2 rounded-lg border text-sm tabular-nums disabled:opacity-40 ${
                          size === s.size ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      >
                        {s.size} <span className="text-[11px] opacity-75">({s.quantity})</span>
                      </button>
                    ))}
                  </div>
                  {size && left < 1 && (
                    <p className="mt-1 text-xs text-red-700">Во системот нема парче во {size}. Провери ја залихата пред продажба.</p>
                  )}
                </div>
              )}

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">Цена (ден.)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-3 border border-slate-300 rounded-lg text-lg tabular-nums"
                />
                {amount !== current.price && (
                  <p className="text-[11px] text-slate-400 mt-1">Цена на етикета {Math.round(current.price).toLocaleString('mk-MK')} ден.</p>
                )}
                {warning && <p className="text-xs text-amber-700 mt-1">{warning}</p>}
              </div>

              <button
                onClick={sell}
                disabled={!canSell}
                className="mt-5 w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-lg disabled:opacity-50"
              >
                {selling ? 'Се запишува…' : 'Продај'}
              </button>
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Подарок, лична употреба или отпис (цена 0) се внесуваат на страната на производот.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
