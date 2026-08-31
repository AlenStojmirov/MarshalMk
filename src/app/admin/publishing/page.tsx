'use client';

/**
 * Publishing queue — the working screen for action A3 in docs/TURNAROUND.md.
 *
 * 61% of the stock capital has never been on the storefront, and only one hidden
 * product has a photograph. "Photograph 194 products" is not something anyone
 * starts on a Monday, so this screen answers a smaller question: what do I shoot
 * next, and what can I publish right now without shooting anything.
 *
 * Two lists, because they are two different jobs:
 *   Ready to publish  — hidden but already has an image → one click
 *   Photo queue       — hidden, sells, no image → the shoot list, ranked
 *
 * Ranking is tied-up retail value weighted by proven demand, and groups are
 * ordered by GMROI rather than by value: the biggest pile of money sits in the
 * group that sells worst, so working by value alone spends the most effort in
 * the worst place.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useProducts, updateProduct } from '@/hooks/useProducts';
import { Product, ProductFormData } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { grossMargin } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import { useTranslation } from '@/lib/i18n';
import {
  ArrowLeft,
  Camera,
  Eye,
  ImageOff,
  Lightbulb,
  PackageX,
  TrendingUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Grouping — same 23 -> 9 consolidation the reports use
// ---------------------------------------------------------------------------

const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло', oversizeTshirts: 'Маици & Поло', polos: 'Маици & Поло',
  shirts: 'Кошули', shortSleevedShirt: 'Кошули', blouses: 'Кошули',
  cardigans: 'Плетиво', turtleNecks: 'Плетиво', halfZips: 'Плетиво',
  hoodies: 'Дуксери', fullZips: 'Дуксери',
  jeans: 'Фармерки', shortsJeans: 'Фармерки',
  pants: 'Панталони', cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили', coats: 'Јакни & Мантили', vests: 'Јакни & Мантили',
  suits: 'Свечено', blazers: 'Свечено', suitJackets: 'Свечено',
  belts: 'Аксесоари', accessories: 'Аксесоари',
};
const NON_MERCHANDISE = new Set(['vaucer']);
const groupOf = (c: string) => CATEGORY_GROUPS[c] ?? c ?? '—';

/** Groups whose season runs autumn into winter. */
const AUTUMN_GROUPS = new Set(['Јакни & Мантили', 'Плетиво', 'Дуксери']);

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

const isUsableUrl = (u?: string | null) => {
  if (!u) return false;
  const s = u.trim();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');
};

interface Entry {
  p: Product;
  units: number;
  price: number;
  retail: number;
  margin: number | null;
  sold180: number;
  soldEver: number;
  group: string;
  hasImage: boolean;
  score: number;
}

function PublishingView() {
  const { t } = useTranslation();
  const { products, loading, refetch } = useProducts();
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [publishing, setPublishing] = useState<string | null>(null);

  // Frozen once per mount rather than read during render: ages do not need to
  // tick, and reading the clock inside a memo makes the render impure.
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    const merch = products.filter((p) => !NON_MERCHANDISE.has(p.category));

    const unitsOf = (p: Product) =>
      (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
    const soldSince = (p: Product, days: number) =>
      (p.sold ?? []).filter(
        (s) => Number(s.price) > 0 && Date.parse(String(s.soldDate)) >= now - days * DAY
      ).length;

    // Group GMROI, from the last year. Only used to order the groups.
    const gStats = new Map<string, { cost: number; profit: number }>();
    for (const p of merch) {
      const g = groupOf(p.category);
      const st = gStats.get(g) ?? { cost: 0, profit: 0 };
      const c = p.purchasePrice;
      if (c !== undefined) {
        st.cost += unitsOf(p) * c;
        for (const s of p.sold ?? []) {
          const price = Number(s.price) || 0;
          if (price > 0 && Date.parse(String(s.soldDate)) >= now - 365 * DAY) {
            st.profit += price - c;
          }
        }
      }
      gStats.set(g, st);
    }
    const gmroi = (g: string) => {
      const st = gStats.get(g);
      return st && st.cost > 0 ? st.profit / st.cost : 0;
    };

    const entries: Entry[] = merch
      .filter((p) => p.isVisible === false && unitsOf(p) > 0)
      .map((p) => {
        const units = unitsOf(p);
        const price = getEffectivePrice(p);
        const sold180 = soldSince(p, 180);
        const soldEver = (p.sold ?? []).filter((s) => Number(s.price) > 0).length;
        const group = groupOf(p.category);
        // A hidden product that sold in the shop is a safer bet online than a
        // bigger pile that never moved, so demand weights the tied-up value.
        const demand = 1 + sold180 * 1.5 + Math.min(soldEver, 10) * 0.3;
        return {
          p, units, price, retail: units * price,
          margin: grossMargin(price, p.purchasePrice),
          sold180, soldEver, group,
          hasImage: isUsableUrl(p.imageUrl) || (p.images ?? []).some(isUsableUrl),
          score: units * price * demand * (1 + gmroi(group) / 4),
        };
      });

    const ready = entries.filter((e) => e.hasImage && e.soldEver > 0).sort((a, b) => b.score - a.score);
    const queue = entries.filter((e) => !e.hasImage && e.soldEver > 0).sort((a, b) => b.score - a.score);
    const dead = entries.filter((e) => e.soldEver === 0).sort((a, b) => b.retail - a.retail);

    const groups = [...new Set(queue.map((e) => e.group))]
      .map((g) => ({
        name: g,
        gmroi: gmroi(g),
        count: queue.filter((e) => e.group === g).length,
        retail: queue.filter((e) => e.group === g).reduce((a, e) => a + e.retail, 0),
      }))
      .sort((a, b) => b.gmroi - a.gmroi);

    const publishedMerch = merch.filter((p) => p.isVisible !== false && unitsOf(p) > 0).length;
    const hiddenMerch = entries.length;

    return { ready, queue, dead, groups, publishedMerch, hiddenMerch };
  }, [products, now]);

  const handlePublish = async (p: Product) => {
    setPublishing(p.id);
    try {
      await updateProduct(p.id, { isVisible: true } as Partial<ProductFormData>);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPublishing(null);
    }
  };

  const visibleQueue =
    activeGroup === 'all' ? model.queue : model.queue.filter((e) => e.group === activeGroup);

  const queueValue = model.queue.reduce((a, e) => a + e.retail, 0);
  const readyValue = model.ready.reduce((a, e) => a + e.retail, 0);
  const deadValue = model.dead.reduce((a, e) => a + e.retail, 0);
  const total = model.publishedMerch + model.hiddenMerch;
  const pct = total > 0 ? (model.publishedMerch / total) * 100 : 0;

  // Suggestions are derived, not decoration: the first two groups by GMROI, plus
  // a seasonal nudge while the autumn window is open.
  const month = new Date().getMonth() + 1;
  const preSeason = month >= 7 && month <= 10;
  const topGroups = model.groups.slice(0, 2);
  const autumnGroup = model.groups.find((g) => AUTUMN_GROUPS.has(g.name) && g.count > 0);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const Row = ({ e, rank, action }: { e: Entry; rank?: number; action: 'publish' | 'shoot' }) => (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors">
      {rank !== undefined && (
        <span className="w-6 shrink-0 text-xs font-mono text-slate-400 tabular-nums">{rank}</span>
      )}
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
        {e.hasImage ? (
          <Image src={e.p.imageUrl} alt="" fill className="object-cover" sizes="48px" />
        ) : (
          <ImageOff className="h-5 w-5 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/product/${e.p.id}`}
          className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate"
        >
          {getProductDisplayName(e.p.name, e.p.category, e.p.brand)}
        </Link>
        <p className="text-[11px] text-slate-400 font-mono truncate">{e.p.id}</p>
      </div>
      <div className="hidden sm:block text-xs text-slate-500 w-24 shrink-0">{e.group}</div>
      <div className="text-right w-16 shrink-0 tabular-nums">
        <p className="text-sm font-semibold text-slate-800">{e.units}</p>
        <p className="text-[11px] text-slate-400">парч.</p>
      </div>
      <div className="text-right w-24 shrink-0 tabular-nums">
        <p className="text-sm font-semibold text-slate-800">{fmt(e.retail)}</p>
        <p className="text-[11px] text-slate-400">ден.</p>
      </div>
      <div className="hidden md:block text-right w-16 shrink-0 tabular-nums">
        <p className={`text-sm font-semibold ${
          e.margin === null ? 'text-slate-300'
            : e.margin < 0.25 ? 'text-red-700'
            : e.margin < 0.4 ? 'text-amber-700' : 'text-green-700'
        }`}>
          {e.margin === null ? '—' : `${(e.margin * 100).toFixed(0)}%`}
        </p>
        <p className="text-[11px] text-slate-400">маржа</p>
      </div>
      <div className="hidden lg:block text-right w-20 shrink-0 tabular-nums">
        <p className="text-sm font-semibold text-slate-800">{e.sold180}</p>
        <p className="text-[11px] text-slate-400">180 дена</p>
      </div>
      {action === 'publish' ? (
        <button
          onClick={() => handlePublish(e.p)}
          disabled={publishing === e.p.id}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          {publishing === e.p.id ? '…' : 'Објави'}
        </button>
      ) : (
        <span className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">
          <Camera className="h-3.5 w-3.5" />
          Фото
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          {t('inventory.backToDashboard')}
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Редица за објавување</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Стоката е платена и стои на полица. Единственото што ја дели од продажба online е фотографија.
        </p>

        {/* progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-slate-700">
              {model.publishedMerch} од {total} модели се на storefront
            </span>
            <span className="tabular-nums text-slate-500">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Спремни за објавување</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums">{model.ready.length}</p>
            <p className="text-xs text-slate-400">{fmt(readyValue)} ден. · имаат слика</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Треба фотографија</p>
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{model.queue.length}</p>
            <p className="text-xs text-slate-400">{fmt(queueValue)} ден. врзани</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Не вреди да се фотографира</p>
            <p className="text-2xl font-bold text-slate-600 tabular-nums">{model.dead.length}</p>
            <p className="text-xs text-slate-400">{fmt(deadValue)} ден. · никогаш не се продале</p>
          </div>
        </div>

        {/* suggestions */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-900">Што предлагам</h2>
          </div>
          <ul className="text-sm text-amber-900/90 space-y-1.5 list-disc pl-5">
            {model.ready.length > 0 && (
              <li>
                <strong>{model.ready.length}</strong> модели веќе имаат слика —
                објави ги сега, тоа е {fmt(readyValue)} ден. без ниту една фотографија.
              </li>
            )}
            {topGroups.length > 0 && (
              <li>
                Почни од{' '}
                {topGroups.map((g, i) => (
                  <span key={g.name}>
                    {i > 0 ? ' и ' : ''}
                    <strong>{g.name}</strong> (GMROI {g.gmroi.toFixed(2)})
                  </span>
                ))}
                {' '}— таа стока се врти најбрзо, значи фотографијата таму се исплаќа прва.
              </li>
            )}
            {preSeason && autumnGroup && (
              <li>
                Есенска сезона доаѓа: <strong>{autumnGroup.name}</strong> ({autumnGroup.count} модели)
                треба да се фотографираат <strong>пред септември</strong>, не после.
                Нискиот GMROI таму е мерен надвор од нивната сезона.
              </li>
            )}
            {visibleQueue[0] && (
              <li>
                Најдобар поединечен: <strong>{visibleQueue[0].p.id}</strong> — {visibleQueue[0].units} парчиња,
                {' '}{visibleQueue[0].sold180} продадени за 180 дена. Една сесија отклучува докажана побарувачка.
              </li>
            )}
            <li className="text-amber-900/70">
              Фотографирај → стави го фајлот во <code className="font-mono text-xs">public/images/products/</code> како
              {' '}<code className="font-mono text-xs">{'{id}-1.jpg'}</code> → моделот сам скока во „Спремни за објавување“.
            </li>
          </ul>
        </div>

        {/* ready to publish */}
        {model.ready.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-green-50/60 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-700" />
              <h2 className="font-bold text-slate-800 text-sm">Спремни за објавување — само еден клик</h2>
            </div>
            {model.ready.map((e) => <Row key={e.p.id} e={e} action="publish" />)}
          </div>
        )}

        {/* photo queue */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-4 w-4 text-blue-700" />
              <h2 className="font-bold text-slate-800 text-sm">Редица за фотографирање</h2>
              <span className="text-xs text-slate-400">по GMROI на групата, потоа по потенцијал</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveGroup('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeGroup === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Сите ({model.queue.length})
              </button>
              {model.groups.map((g) => (
                <button
                  key={g.name}
                  onClick={() => setActiveGroup(g.name)}
                  title={`GMROI ${g.gmroi.toFixed(2)} · ${fmt(g.retail)} ден.`}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeGroup === g.name
                      ? 'bg-slate-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {g.name} ({g.count})
                  <span className={`ml-1 tabular-nums ${
                    activeGroup === g.name ? 'text-slate-300' : g.gmroi >= 1.3 ? 'text-green-600' : 'text-slate-400'
                  }`}>
                    {g.gmroi.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {visibleQueue.length === 0 ? (
            <p className="px-4 py-10 text-center text-slate-400 text-sm">Нема модели во оваа група.</p>
          ) : (
            visibleQueue.map((e, i) => <Row key={e.p.id} e={e} rank={i + 1} action="shoot" />)
          )}
        </div>

        {/* clearance */}
        {model.dead.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mt-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
              <PackageX className="h-4 w-4 text-slate-500" />
              <h2 className="font-bold text-slate-800 text-sm">Не фотографирај — расчисти</h2>
              <span className="text-xs text-slate-400">никогаш не се продале</span>
            </div>
            {model.dead.map((e) => <Row key={e.p.id} e={e} action="shoot" />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublishingPage() {
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

  return <PublishingView />;
}
