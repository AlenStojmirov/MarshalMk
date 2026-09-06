'use client';

/**
 * Broken size runs — action A5 in docs/TURNAROUND.md.
 *
 * Open-to-buy is zero (`/admin/capital`) and that is correct: stock sits at
 * roughly twelve months of supply. A5 is the one purchase the plan still
 * allows, and it is allowed precisely because it is not really a purchase — it
 * refills gaps in a size run that is already proven to sell, at a few hundred
 * denars a piece, instead of buying a new model on hope.
 *
 * The whole action is one rule applied twice:
 *
 *   sold in the last year  → top up only the missing M/L/XL
 *   nothing sold in a year → clear it, do not repair it
 *
 * "Missing" is narrowed once more before it becomes a bill. A size that is gone
 * *and sold in the last year* is measured demand; a size that is gone and never
 * sold is a guess about a customer nobody has met. Both are shown, but only the
 * first is counted by default — 64 of the 75 missing pieces, and 39.231 den.
 * instead of 45.587.
 *
 * Repairing a model that does not sell just buys the same dead stock a second
 * time, which is how a small budget disappears without anything changing. So
 * the screen refuses to put those two lists on the same page as one list: the
 * left-hand decision is "buy", the right-hand decision is "mark down", and they
 * go to different places.
 *
 * Only letter sizes are judged. A numeric run (29–34) has no fixed core and a
 * gap in it means something different, so those models are counted out loud and
 * left alone rather than quietly folded in.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { grossMargin } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import { ArrowLeft, Ban, ClipboardCopy, Ruler, ShoppingBasket } from 'lucide-react';

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const NON_MERCHANDISE = new Set(['vaucer']);

/** The sizes that carry the business. Everything else is a tail size. */
const CORE = ['M', 'L', 'XL'];
/** Any of these makes a model "letter sized" and therefore judgeable here. */
const LETTER = ['S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL'];

/** How many pieces a top-up assumes per missing size. One — the point of A5 is
 *  a small, certain spend, not a re-buy. */
const TOPUP_UNITS_PER_SIZE = 1;

interface Row {
  p: Product;
  /** Letter sizes currently on the shelf, with quantities. */
  inStock: Map<string, number>;
  missing: string[];
  /** Missing and sold within the year — measured demand. */
  provenMissing: string[];
  /** Missing and never sold — a guess, priced separately. */
  guessMissing: string[];
  unitCost: number;
  unitPrice: number;
  /** No core size at all — the middle of the run is gone, only edges remain. */
  edgesOnly: boolean;
  units: number;
  cost: number;
  sold365: number;
  soldBySize: Map<string, number>;
  margin: number | null;
}

function normSize(s: unknown) {
  return String(s).trim().toUpperCase();
}

function SizesView() {
  const { products, loading } = useProducts();
  const [tab, setTab] = useState<'topup' | 'clear'>('topup');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [includeGuess, setIncludeGuess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Frozen per mount: ages and windows do not need to tick, and reading the
  // clock during render makes the render impure.
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    let liveLetterModels = 0;
    let numericSkipped = 0;
    let complete = 0;

    const broken: Row[] = [];

    for (const p of products) {
      if (NON_MERCHANDISE.has(p.category)) continue;

      const sizes = (p.sizes ?? []).filter((s) => Number(s.quantity) >= 1);
      const units = sizes.reduce((a, s) => a + Number(s.quantity), 0);
      if (units === 0) continue;
      if (p.isVisible === false) continue; // A3's problem, not A5's

      const inStock = new Map<string, number>();
      for (const s of sizes) {
        const key = normSize(s.size);
        inStock.set(key, (inStock.get(key) ?? 0) + Number(s.quantity));
      }

      const isLetter = LETTER.some((l) => inStock.has(l));
      if (!isLetter) {
        numericSkipped += 1;
        continue;
      }
      liveLetterModels += 1;

      const missing = CORE.filter((c) => !inStock.has(c));
      if (missing.length === 0) {
        complete += 1;
        continue;
      }

      const soldBySize = new Map<string, number>();
      let sold365 = 0;
      for (const s of p.sold ?? []) {
        if (Number(s.price) <= 0) continue; // giveaways are not demand
        const t = Date.parse(String(s.soldDate));
        if (!Number.isFinite(t) || t < now - 365 * DAY) continue;
        sold365 += 1;
        const key = normSize(s.size);
        soldBySize.set(key, (soldBySize.get(key) ?? 0) + 1);
      }

      const cost = p.purchasePrice ?? 0;
      broken.push({
        p,
        inStock,
        missing,
        provenMissing: missing.filter((m) => (soldBySize.get(m) ?? 0) > 0),
        guessMissing: missing.filter((m) => (soldBySize.get(m) ?? 0) === 0),
        unitCost: cost,
        unitPrice: getEffectivePrice(p),
        edgesOnly: !CORE.some((c) => inStock.has(c)),
        units,
        cost: units * cost,
        sold365,
        soldBySize,
        margin: grossMargin(getEffectivePrice(p), p.purchasePrice),
      });
    }

    // Proven demand first: within the top-up list, the models that sold most
    // are the ones whose missing size is costing a sale right now.
    const topup = broken
      .filter((r) => r.sold365 > 0)
      .sort(
        (a, b) =>
          b.sold365 - a.sold365 ||
          b.provenMissing.length * b.unitPrice - a.provenMissing.length * a.unitPrice
      );
    const clear = broken
      .filter((r) => r.sold365 === 0)
      .sort((a, b) => b.cost - a.cost);

    return {
      liveLetterModels,
      numericSkipped,
      complete,
      broken,
      topup,
      clear,
      guessPieces: topup.reduce((a, r) => a + r.guessMissing.length, 0),
      guessCost: topup.reduce((a, r) => a + r.guessMissing.length * TOPUP_UNITS_PER_SIZE * r.unitCost, 0),
      clearCost: clear.reduce((a, r) => a + r.cost, 0),
    };
  }, [products, now]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // What a row would actually buy under the current basis. Everything money
  // is spoken about — the totals, the list, the copy — goes through this.
  const buys = (r: Row) => (includeGuess ? r.missing : r.provenMissing);
  const rowCost = (r: Row) => buys(r).length * TOPUP_UNITS_PER_SIZE * r.unitCost;
  const rowRetail = (r: Row) => buys(r).length * TOPUP_UNITS_PER_SIZE * r.unitPrice;

  const topupList = model.topup.filter((r) => buys(r).length > 0);
  const list = tab === 'topup' ? topupList : model.clear;
  const chosen = topupList.filter((r) => picked.has(r.p.id));
  const chosenCost = chosen.reduce((a, r) => a + rowCost(r), 0);
  const chosenRetail = chosen.reduce((a, r) => a + rowRetail(r), 0);
  const chosenPieces = chosen.reduce((a, r) => a + buys(r).length, 0);
  const listCost = topupList.reduce((a, r) => a + rowCost(r), 0);
  const listRetail = topupList.reduce((a, r) => a + rowRetail(r), 0);
  const listPieces = topupList.reduce((a, r) => a + buys(r).length, 0);
  const brokenPct = model.liveLetterModels > 0 ? model.broken.length / model.liveLetterModels : 0;

  const toggle = (id: string) => {
    setCopied(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPicked = topupList.length > 0 && topupList.every((r) => picked.has(r.p.id));
  const toggleAll = () => {
    setCopied(false);
    setPicked(allPicked ? new Set() : new Set(topupList.map((r) => r.p.id)));
  };

  // The list leaves this screen as text because that is the form it is used in:
  // read out to a supplier, or carried to the warehouse. A shopping list that
  // only exists behind a login is not a shopping list.
  const copyList = async () => {
    if (chosen.length === 0) return;
    const lines = chosen.map((r) => {
      const sold = [...r.soldBySize.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${s}×${n}`)
        .join(' ');
      return (
        `${getProductDisplayName(r.p.name, r.p.category, r.p.brand)} [${r.p.id}]` +
        `\n  земи: ${buys(r).join(', ')}` +
        `  ·  продадено 12м: ${sold || '—'}` +
        `  ·  ≈ ${fmt(rowCost(r))} ден.`
      );
    });
    const text =
      `Дополнување на серии — ${chosen.length} модели, ` +
      `${chosenPieces} парчиња\n` +
      `Вкупно набавна: ≈ ${fmt(chosenCost)} ден.  ·  продажна: ≈ ${fmt(chosenRetail)} ден.\n\n` +
      lines.join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Триажа на скршени серии</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Купувач што не ја наоѓа својата големина е изгубена продажба која никаде не се запишува.
          Но серија се поправа <strong>само</strong> ако моделот веќе се продава — инаку набавката ја
          купува истата мртва стока по втор пат.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Скршена серија</p>
            <p className="text-xl font-bold text-amber-700 tabular-nums">{model.broken.length}</p>
            <p className="text-[11px] text-slate-400">
              од {model.liveLetterModels} живи · {(brokenPct * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Вредни дополнување</p>
            <p className="text-xl font-bold text-green-700 tabular-nums">{topupList.length}</p>
            <p className="text-[11px] text-slate-400">{listPieces} парчиња што се продале</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Цена на дополнување</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{fmt(listCost)}</p>
            <p className="text-[11px] text-slate-400">ден. набавна · враќа ≈ {fmt(listRetail)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Не се поправаат</p>
            <p className="text-xl font-bold text-red-700 tabular-nums">{model.clear.length}</p>
            <p className="text-[11px] text-slate-400">{fmt(model.clearCost)} ден. заглавени</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex gap-2">
          <ShoppingBasket className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Open-to-buy е <strong>нула</strong> додека turnover не помине 2× — ова е единствениот
            исклучок што планот го дозволува. Затоа сумата е важна: {fmt(listCost)} ден. за цела
            листа, по {TOPUP_UNITS_PER_SIZE} парче на големина.{' '}
            <Link href="/admin/capital" className="underline font-medium">
              Види го буџетот
            </Link>
            .
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">
              {tab === 'topup' ? 'Дополни — има докажана продажба' : 'Расчисти — нема ниту една продажба'}
            </h2>
            <div className="ml-auto flex gap-1.5">
              {(['topup', 'clear'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setTab(k); setCopied(false); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    tab === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {k === 'topup' ? `Дополни (${model.topup.length})` : `Расчисти (${model.clear.length})`}
                </button>
              ))}
            </div>
          </div>

          {tab === 'topup' && model.guessPieces > 0 && (
            <label className="px-4 py-2 flex items-start gap-2 text-xs text-slate-500 bg-slate-50/60 border-b border-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={includeGuess}
                onChange={() => { setIncludeGuess((v) => !v); setCopied(false); }}
                className="h-3.5 w-3.5 mt-0.5 shrink-0 rounded border-slate-300 accent-slate-700"
              />
              <span>
                Земи ги и {model.guessPieces} големини што <strong>никогаш не се продале</strong> на тој
                модел (+{fmt(model.guessCost)} ден.). Стандардно се исклучени: празна големина што се
                продала е измерена побарувачка, празна големина што никогаш не се продала е претпоставка.
              </span>
            </label>
          )}

          {tab === 'clear' ? (
            <p className="px-4 py-2 text-xs text-slate-500 bg-red-50/50 border-b border-slate-100 flex items-start gap-1.5">
              <Ban className="h-3.5 w-3.5 shrink-0 mt-px text-red-500" />
              <span>
                Скршена серија <strong>и</strong> нула продажби. Дополнувањето овде би платило двапати за
                иста грешка — овие одат на намалување.{' '}
                <Link href="/admin/aging" className="underline font-medium">
                  Отвори расчистување
                </Link>
                .
              </span>
            </p>
          ) : (
            <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
              <button
                onClick={toggleAll}
                disabled={model.topup.length === 0}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {allPicked ? 'Одзначи ги сите' : `Означи ги сите (${model.topup.length})`}
              </button>
              {chosen.length > 0 && (
                <span className="text-xs text-slate-600">
                  <strong className="text-slate-800">{chosen.length}</strong> модели ·{' '}
                  <strong className="text-slate-800 tabular-nums">{chosenPieces}</strong> парчиња · ≈{' '}
                  <strong className="text-slate-800 tabular-nums">{fmt(chosenCost)}</strong> ден. →
                  враќа ≈{' '}
                  <strong className="text-green-700 tabular-nums">{fmt(chosenRetail)}</strong> ден.
                </span>
              )}
              <button
                onClick={copyList}
                disabled={chosen.length === 0}
                className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copied ? 'Копирано' : 'Копирај ја листата'}
              </button>
            </div>
          )}

          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {model.liveLetterModels === 0
                ? 'Нема живи модели со буквени големини.'
                : 'Сите серии во оваа листа се цели.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.slice(0, 80).map((r) => (
                <div
                  key={r.p.id}
                  className={`flex items-start gap-3 px-3 sm:px-4 py-3 ${
                    picked.has(r.p.id) ? 'bg-green-50/60' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {tab === 'topup' && (
                    <input
                      type="checkbox"
                      checked={picked.has(r.p.id)}
                      onChange={() => toggle(r.p.id)}
                      className="h-4 w-4 shrink-0 mt-1 rounded border-slate-300 accent-green-600"
                      aria-label={`Избери ${r.p.name}`}
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/product/${r.p.id}`}
                      className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate"
                    >
                      {getProductDisplayName(r.p.name, r.p.category, r.p.brand)}
                    </Link>

                    {/* The size run itself, in order — a gap you can see beats a
                        number that describes one. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {CORE.map((c) => {
                        const qty = r.inStock.get(c);
                        const willBuy = buys(r).includes(c);
                        const sold = (r.soldBySize.get(c) ?? 0) > 0;
                        return (
                          <span
                            key={c}
                            title={
                              qty ? 'на залиха'
                                : sold ? 'нема залиха, се продавала'
                                : 'нема залиха, никогаш не се продала'
                            }
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
                              qty
                                ? 'bg-slate-100 text-slate-700'
                                : willBuy
                                  ? 'bg-red-100 text-red-700 border border-dashed border-red-300'
                                  : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200'
                            }`}
                          >
                            {c}
                            {qty ? <span className="font-normal text-slate-400"> ·{qty}</span> : ' —'}
                          </span>
                        );
                      })}
                      {[...r.inStock.entries()]
                        .filter(([s]) => !CORE.includes(s))
                        .map(([s, q]) => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[11px] bg-slate-50 text-slate-400 tabular-nums">
                            {s}
                            <span className="text-slate-300"> ·{q}</span>
                          </span>
                        ))}
                      {r.edgesOnly && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          само рабни
                        </span>
                      )}
                    </div>

                    {r.sold365 > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        продадено 12м:{' '}
                        {[...r.soldBySize.entries()]
                          .sort((a, b) => b[1] - a[1])
                          .map(([s, n]) => `${s}×${n}`)
                          .join('  ')}
                      </p>
                    )}
                  </div>

                  <div className="text-right w-16 shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-slate-800">{r.sold365}</p>
                    <p className="text-[11px] text-slate-400">прод. 12м</p>
                  </div>
                  <div className="hidden sm:block text-right w-20 shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-slate-800">
                      {tab === 'topup' ? fmt(rowCost(r)) : fmt(r.cost)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {tab === 'topup' ? 'дополн.' : 'заглавени'}
                    </p>
                  </div>
                  <div className="hidden lg:block text-right w-14 shrink-0 tabular-nums">
                    <p className={`text-sm font-semibold ${
                      r.margin === null ? 'text-slate-300' : r.margin < 0.25 ? 'text-red-700' : 'text-slate-700'
                    }`}>
                      {r.margin === null ? '—' : (r.margin * 100).toFixed(0) + '%'}
                    </p>
                    <p className="text-[11px] text-slate-400">маржа</p>
                  </div>
                </div>
              ))}
              {list.length > 80 && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">… и уште {list.length - 80}.</p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-4">
          Судат се само живи модели со буквени големини. {model.numericSkipped} модели со бројчени
          серии (фармерки, панталони) се изоставени — таму нема фиксно јадро, па празнина во серијата
          значи нешто друго. Цената на дополнување претпоставува {TOPUP_UNITS_PER_SIZE} парче по
          големина, по последната позната набавна цена — што е претпоставка за цената, не понуда од
          добавувач. Испразнета големина се брои како побарувачка само ако таа големина се продала
          во последните 12 месеци.
        </p>
      </div>
    </div>
  );
}

export default function SizesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <SizesView />;
}
