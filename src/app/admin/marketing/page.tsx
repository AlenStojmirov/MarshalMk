'use client';

/**
 * Маркетинг — posts for Instagram and Facebook, prepared from what the shop
 * already knows (EPIC 10).
 *
 * Preparation only: nothing is published from here, there is no Meta API
 * (owner's decision, 2026-09-27). The marketing employee reads the catalogue —
 * products, photos, prices, sales, season, stock — and never a cost, a margin
 * or the ledger (D-021, migration 011). The database draws that line; this
 * screen only shows what it is given.
 *
 * 10.1: what to post, sorted into buckets that each carry a reason to post
 * (src/lib/marketing.ts). A discount is the message only in clearance.
 * 10.2: the text of each post (src/lib/post-copy.ts), edited and copied here.
 * 10.3: its pictures — the photos in order and a drawn price card (post-images.ts).
 * 10.4: the calendar — next month by day, three months by week (MarketingCalendar).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle, ArrowLeft, CalendarDays, ExternalLink, ImageOff, Lightbulb, LogOut,
  Megaphone, PenLine, ShieldCheck, Target, Truck,
} from 'lucide-react';
import PostCopyPanel from '@/components/admin/PostCopyPanel';
import MarketingCalendar from '@/components/admin/MarketingCalendar';
import { comboWriter, productKinds, productWriter, trustWriter, type Writing } from '@/components/admin/marketing-writers';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { fetchAllAttributes } from '@/lib/product-attributes';
import { ROLE_LABEL } from '@/lib/roles';
import { PHASE_LABEL } from '@/lib/seasons';
import {
  BUCKETS, COMBO_TARGET, POST_KIND_LABEL, READINESS_LABEL, buildMarketingPlan, den,
  type BucketKey, type Combo, type PostCandidate,
} from '@/lib/marketing';
import type { ProductAttributes } from '@/types';

type Tab = 'ideas' | 'calendar';

/** What is coming, in the order it is built. */
const NEXT: Array<{ id: string; title: string; hint: string; icon: typeof Megaphone }> = [
  { id: '10.5', title: 'Цел до нула', hint: 'колку фали овој месец', icon: Target },
];

const READINESS_TONE = {
  carousel: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  single: 'bg-amber-50 text-amber-700 border-amber-200',
  noPhoto: 'bg-slate-100 text-slate-500 border-slate-200',
} as const;

export default function MarketingPage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const { products, loading } = useProducts();
  const [attrs, setAttrs] = useState<Map<string, ProductAttributes>>(new Map());
  const [bucket, setBucket] = useState<BucketKey>('season');
  const [writing, setWriting] = useState<Writing | null>(null);
  const [tab, setTab] = useState<Tab>('ideas');

  useEffect(() => {
    fetchAllAttributes(supabase).then((r) => setAttrs(r.data));
  }, []);

  const plan = useMemo(() => buildMarketingPlan(products, attrs), [products, attrs]);
  const info = BUCKETS.find((b) => b.key === bucket)!;
  const list = plan.byBucket[bucket];
  const month = plan.month;

  const writeProduct = useCallback(
    (c: PostCandidate) => setWriting(productWriter(c, attrs, month, productKinds(info.kinds))),
    [info, attrs, month],
  );
  const writeCombo = useCallback((combo: Combo) => setWriting(comboWriter(combo, attrs, month)), [attrs, month]);
  const writeTrust = useCallback(() => setWriting(trustWriter(month)), [month]);

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
          Најави се
        </Link>
      </div>
    );
  }

  const onSale = plan.candidates.filter((c) => c.percentOff > 0).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center mb-6">
        <div className="min-w-0">
          {role === 'admin' && (
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-1">
              <ArrowLeft className="h-4 w-4" /> Назад
            </Link>
          )}
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-pink-600" /> Маркетинг
          </h1>
          <p className="text-xs text-slate-500 truncate">
            {user.email} · {role ? ROLE_LABEL[role] : ''} · објави за Instagram и Facebook
          </p>
        </div>
        {role === 'marketing' && (
          <button
            onClick={signOut}
            className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Одјава
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'На сајтот', value: plan.candidates.length, hint: 'видливи, со залиха' },
          { label: 'Готови за карусел', value: plan.candidates.filter((c) => c.readiness === 'carousel').length, hint: READINESS_LABEL.carousel },
          { label: 'На попуст', value: onSale, hint: 'од тие на сајтот' },
          { label: 'Скриени', value: plan.hiddenInStock, hint: `со залиха · ${plan.hiddenWithPhoto} со слика` },
        ].map((t) => (
          <div key={t.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? '…' : t.value}</p>
            <p className="text-[11px] text-slate-400">{t.hint}</p>
          </div>
        ))}
      </div>

      {!loading && products.length === 0 && (
        // Before migration 011 the database gives this role no rows at all.
        <p className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Базата не врати ниту еден производ. Најверојатно миграцијата 011 сè уште не е пуштена.
        </p>
      )}

      {role === 'admin' && plan.saleOutOfSeason.length > 0 && (
        // A1 is the owner's decision; marketing only learns not to lead with it.
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <strong>{plan.saleOutOfSeason.length}</strong> производи на сајтот се на попуст, а по сезонскиот календар
            не им следува. Маркетингот ќе ги објавува без попустот како порака, но купувачот сепак ја гледа
            намалената цена. Одлуката е твоја (A1):{' '}
            <Link href="/admin/matrix" className="underline font-medium">Брзина × маржа</Link>.
          </p>
        </div>
      )}

      <div className="flex gap-1 p-1 mb-4 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'ideas', label: 'Што да објавиме', icon: Lightbulb },
          { key: 'calendar', label: 'Календар', icon: CalendarDays },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <MarketingCalendar plan={plan} attrs={attrs} loading={loading} onWrite={setWriting} />
      ) : (
        <>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {BUCKETS.map((b) => {
            const n = b.key === 'combos' ? plan.combos.length : plan.byBucket[b.key].length;
            return (
              <button
                key={b.key}
                onClick={() => setBucket(b.key)}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium border ${
                  bucket === b.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {b.title} <span className="ml-1 tabular-nums opacity-70">{loading ? '' : n}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm text-slate-700">{info.why}</p>
            <p className="text-xs text-slate-500 mt-1">
              Вид на објава: {info.kinds.map((k) => POST_KIND_LABEL[k]).join(' · ')}
            </p>
          </div>
          <button
            onClick={writeTrust}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
            title="Како се нарачува, плаќање при достава, дуќанот во Виница"
          >
            <ShieldCheck className="h-4 w-4" /> Објава за доверба
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : bucket === 'combos' ? (
          plan.combos.length === 0 ? (
            <Empty text={`Нема горен и долен дел во сезона што заедно минуваат ${den(COMBO_TARGET)}.`} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {plan.combos.map((c) => (
                <ComboCard key={c.top.product.id + c.bottom.product.id} combo={c} onWrite={() => writeCombo(c)} />
              ))}
            </div>
          )
        ) : list.length === 0 ? (
          <Empty
            text={
              bucket === 'new'
                ? 'Нема стока стигната во последните 30 дена. По фотографирањето, новото на сајтот ќе се појави тука.'
                : 'Засега нема производи во оваа група.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => <CandidateCard key={c.product.id} c={c} bucket={bucket} onWrite={() => writeProduct(c)} />)}
          </div>
        )}

        {plan.hiddenInStock > 0 && !loading && (
          <p className="mt-4 text-xs text-slate-500">
            Уште {plan.hiddenInStock} производи со залиха се скриени од сајтот, од кои {plan.hiddenWithPhoto} со слика.
            Штом ќе бидат фотографирани и објавени, сами ќе се појават во групите.
          </p>
        )}
        </>
      )}

      {writing && (
        <PostCopyPanel
          heading={writing.heading}
          kinds={writing.kinds}
          make={writing.make}
          pack={writing.pack}
          initialText={writing.initialText}
          onSave={writing.onSave}
          onClose={() => setWriting(null)}
        />
      )}

      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Што доаѓа тука</h2>
        <p className="text-sm text-slate-500 mb-4">
          Страната ја подготвува објавата. Објавувањето на Instagram и Facebook останува рачно.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {NEXT.map((n) => (
            <li key={n.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <n.icon className="h-5 w-5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{n.title}</p>
                <p className="text-xs text-slate-500">{n.hint}</p>
              </div>
              <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{n.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{text}</p>;
}

function Thumb({ c, size }: { c: PostCandidate; size: number }) {
  return (
    <div className="relative shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center" style={{ width: size, height: size * 1.25 }}>
      {c.product.imageUrl ? (
        <Image src={c.product.imageUrl} alt="" fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <ImageOff className="h-5 w-5 text-slate-300" />
      )}
    </div>
  );
}

/**
 * The price as the customer will find it on the site. Struck-through list price
 * only where the post may talk about the discount; otherwise the one number.
 */
function Price({ c }: { c: PostCandidate }) {
  const showDiscount = c.discount.allowed && c.percentOff > 0;
  return (
    <p className="text-sm">
      <span className="font-semibold text-slate-900">{den(c.price)}</span>
      {showDiscount && (
        <>
          <span className="ml-1.5 text-xs text-slate-400 line-through">{den(c.listPrice)}</span>
          <span className="ml-1 text-xs font-medium text-rose-600">−{c.percentOff}%</span>
        </>
      )}
    </p>
  );
}

function WriteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-600 text-white hover:bg-pink-700"
    >
      <PenLine className="h-3.5 w-3.5" /> Текст за објава
    </button>
  );
}

function CandidateCard({ c, bucket, onWrite }: { c: PostCandidate; bucket: BucketKey; onWrite: () => void }) {
  const missing = [!c.hasComposition && 'состав', !c.hasColor && 'боја'].filter(Boolean) as string[];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex gap-3">
      <Thumb c={c} size={72} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <p className="font-semibold text-slate-800 text-sm truncate flex-1">{c.label}</p>
          <a
            href={`/product/${c.product.id}`} target="_blank" rel="noopener noreferrer"
            className="text-slate-400 hover:text-blue-600" title="Отвори на сајтот"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <Price c={c} />

        <div className="flex flex-wrap gap-1 mt-1.5">
          {c.sizes.map((s) => (
            <span
              key={s.size}
              className={`px-1.5 py-0.5 rounded text-[11px] border ${
                c.lastSizes.includes(s.size)
                  ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title={`${s.quantity} парч.`}
            >
              {s.size}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 mt-1.5 text-[11px]">
          <span className={`px-1.5 py-0.5 rounded border ${READINESS_TONE[c.readiness]}`}>
            {c.photos} {c.photos === 1 ? 'слика' : 'слики'}
          </span>
          <span className="px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
            {PHASE_LABEL[c.phase]}
          </span>
          {c.metrics.sold90 > 0 && (
            <span className="px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
              продадени {c.metrics.sold90} за 90 дена
            </span>
          )}
          {missing.length > 0 && (
            <span className="px-1.5 py-0.5 rounded border bg-slate-50 text-slate-500 border-slate-200">
              фали: {missing.join(', ')}
            </span>
          )}
        </div>

        {bucket === 'clearance' && c.discount.ladderPct !== null && (
          <p className="text-[11px] text-slate-500 mt-1.5">
            {c.discount.reason} · скалилото сега вели до −{c.discount.ladderPct}%
            {c.percentOff > c.discount.ladderPct && ` (на сајтот е −${c.percentOff}%)`}
          </p>
        )}
        {c.discount.saleOutOfSeason && (
          <p className="text-[11px] text-slate-500 mt-1.5">
            На сајтот е на попуст, но {c.discount.reason}: во објавата попустот не е пораката.
          </p>
        )}
        <WriteButton onClick={onWrite} />
      </div>
    </div>
  );
}

function ComboCard({ combo, onWrite }: { combo: Combo; onWrite: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="grid grid-cols-2 gap-3">
        {[combo.top, combo.bottom].map((c) => (
          <div key={c.product.id} className="flex gap-2 min-w-0">
            <Thumb c={c} size={56} />
            <div className="min-w-0">
              <a
                href={`/product/${c.product.id}`} target="_blank" rel="noopener noreferrer"
                className="block text-sm font-semibold text-slate-800 hover:text-blue-600 truncate"
              >
                {c.label}
              </a>
              <p className="text-sm text-slate-900">{den(c.price)}</p>
              <p className="text-[11px] text-slate-500 truncate">{c.sizes.map((s) => s.size).join(' · ')}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 pt-2 border-t border-slate-100 text-sm flex items-center gap-1.5">
        <span className="font-semibold text-slate-900">Заедно {den(combo.total)}</span>
        <span className="text-emerald-700 flex items-center gap-1 text-xs">
          <Truck className="h-3.5 w-3.5" /> бесплатна достава
        </span>
      </p>
      <WriteButton onClick={onWrite} />
    </div>
  );
}
