'use client';

/**
 * Ваучери: the voucher screen (Task 18.2, D-048, migration 026).
 *
 * - Sell: one card or several (a larger sum) under one number, with who it is
 *   for or a phone. The number goes on the card; the term is 12 months.
 * - Redeem: find it by number or name, pick the pieces like in an exchange.
 *   Its sale is deleted, the pieces are sold on the day the voucher was
 *   bought with the top-up inside their prices, and taking less loses the
 *   rest (the owner, 2026-11-11). The cards go back to the drawer.
 * - Card sales without a number (the vouchers out before this screen, or
 *   sold in Firebase) get one here.
 * - The admin may redeem past the term, undo a redemption and cancel a
 *   voucher.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, Loader2, Minus, Plus, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types';
import { mkDen } from '@/lib/mk-format';
import { FIREBASE_SYNC_LIVE } from '@/lib/stock-count';
import { NOT_EXCHANGED, bookExchange, firebaseSteps, type Exchange } from '@/lib/exchange';
import {
  STATE_LABEL, VOUCHER_CATEGORY, VOUCHER_TERM_MONTHS, cancelFirebaseSteps, isOut, sellFirebaseSteps,
  unnumberedSales, voucherMatches, voucherState, vouchersWithoutSale,
  type UnnumberedSale, type Voucher, type VoucherState,
} from '@/lib/vouchers';
import { fetchVouchers, numberSale, type VoucherList } from '@/lib/voucher-db';
import { cancelVoucher, redeemVoucher, sellVoucher, undoVoucher } from '@/lib/stock';
import { countWhen } from '@/components/admin/StockCountPanel';
import {
  AddButton, ExchangeLines, OutList, OutPicker, ago, dayText, localDay, newOut, pieces, shelfOf, type Out,
} from '@/components/admin/ExchangeParts';

type Mode =
  | { kind: 'list' }
  | { kind: 'sell' }
  | { kind: 'sold'; v: Voucher }
  | { kind: 'redeem'; v: Voucher }
  | { kind: 'redeemed'; v: Voucher; x: Exchange };

interface Notice { title: string; lines: string[] }

const inDrawer = (p: Product) =>
  (p.sizes ?? []).length > 0
    ? (p.sizes ?? []).reduce((s, z) => s + Math.max(0, Number(z.quantity) || 0), 0)
    : Math.max(0, Number(p.stock) || 0);

const STATE_TONE: Record<VoucherState, string> = {
  valid: 'bg-green-100 text-green-800',
  expired: 'bg-amber-100 text-amber-800',
  redeemed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-slate-100 text-slate-500',
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function VoucherScreen() {
  const { role, isAdmin } = useAuth();
  const { products, loading, refetch } = useProducts();
  const [today] = useState(() => localDay(new Date()));
  const [data, setData] = useState<VoucherList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!role) return;
    let live = true;
    fetchVouchers(supabase).then(
      (d) => { if (live) { setData(d); setLoadError(null); } },
      (err) => {
        if (!live) return;
        setData({ missing: false, list: [] });
        setLoadError(message(err));
      },
    );
    return () => { live = false; };
  }, [role, version]);

  const reload = () => {
    setVersion((v) => v + 1);
    refetch();
  };

  const cards = useMemo(
    () => products.filter((p) => p.category === VOUCHER_CATEGORY).sort((a, b) => (a.price || 0) - (b.price || 0)),
    [products],
  );
  const list = useMemo(() => data?.list ?? [], [data]);
  const unnumbered = useMemo(() => unnumberedSales(cards, list), [cards, list]);
  const withoutSale = useMemo(() => vouchersWithoutSale(cards, list), [cards, list]);
  const shown = list.filter((v) => voucherMatches(v, q));
  const valid = shown.filter((v) => voucherState(v, today) === 'valid');
  const expired = shown.filter((v) => voucherState(v, today) === 'expired');
  const done = shown.filter((v) => !isOut(v));
  const outValid = list.filter((v) => voucherState(v, today) === 'valid');
  const outExpired = list.filter((v) => voucherState(v, today) === 'expired');
  const sum = (vs: Voucher[]) => vs.reduce((s, v) => s + v.amount, 0);

  if (loading || !data) {
    return (
      <Shell>
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      </Shell>
    );
  }

  if (data.missing) {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {isAdmin
            ? 'Ваучерите чекаат миграција 026 (supabase/migrations/026_vouchers.sql), по 025. Пушти ја во Supabase SQL Editor, па освежи ја страната.'
            : 'Ваучерите уште не се подготвени.'}
        </div>
      </Shell>
    );
  }

  if (mode.kind === 'sell') {
    return (
      <Shell>
        <SellForm
          cards={cards}
          onSold={(v) => { setMode({ kind: 'sold', v }); reload(); }}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </Shell>
    );
  }
  if (mode.kind === 'sold') {
    return <Shell><SoldCard v={mode.v} onClose={() => setMode({ kind: 'list' })} /></Shell>;
  }
  if (mode.kind === 'redeem') {
    return (
      <Shell>
        <RedeemPanel
          v={mode.v}
          products={products}
          today={today}
          onRedeemed={(x) => { setMode({ kind: 'redeemed', v: mode.v, x }); reload(); }}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </Shell>
    );
  }
  if (mode.kind === 'redeemed') {
    return <Shell><RedeemedCard v={mode.v} x={mode.x} onClose={() => setMode({ kind: 'list' })} /></Shell>;
  }

  const itemProps = {
    today,
    isAdmin,
    onRedeem: (v: Voucher) => setMode({ kind: 'redeem', v }),
    onChanged: (n: Notice | null) => { setNotice(n); reload(); },
  };

  return (
    <Shell>
      {notice && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{notice.title}</p>
            <button onClick={() => setNotice(null)} className="text-xs underline shrink-0">затвори</button>
          </div>
          {notice.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
              {notice.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Број, име или телефон"
          className="flex-1 min-w-0 px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
        />
        <button
          onClick={() => { setNotice(null); setMode({ kind: 'sell' }); }}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold shrink-0"
        >
          <Plus className="h-4 w-4" /> Продај ваучер
        </button>
      </div>

      {isAdmin && (outValid.length > 0 || outExpired.length > 0) && (
        <p className="mb-4 text-sm text-slate-600">
          Во оптек: <b className="tabular-nums">{outValid.length}</b> {outValid.length === 1 ? 'ваучер' : 'ваучери'} ·{' '}
          <b className="tabular-nums">{mkDen(sum(outValid))}</b> во стока
          {outExpired.length > 0 && <> · истечени {outExpired.length} ({mkDen(sum(outExpired))})</>}
        </p>
      )}

      {loadError && <p className="mb-4 text-sm text-red-700">{loadError}</p>}

      {unnumbered.length > 0 && !q.trim() && (
        <UnnumberedList sales={unnumbered} onNumbered={(v) => itemProps.onChanged({
          title: `Ваучер бр. ${v.number}: напиши го бројот на картичката ако ја имаш.`, lines: [],
        })} />
      )}

      <Group title="Важат" empty={q.trim() ? 'Нема ваучер што важи со тоа.' : 'Нема ваучер што важи.'}>
        {valid.map((v) => <VoucherItem key={v.id} v={v} noSale={withoutSale.has(v.id)} {...itemProps} />)}
      </Group>

      {expired.length > 0 && (
        <Group
          title="Истечени"
          lead={`Рокот е ${VOUCHER_TERM_MONTHS} месеци од купувањето. Продажбата останува; само админот може сепак да го искористи.`}
        >
          {expired.map((v) => <VoucherItem key={v.id} v={v} noSale={withoutSale.has(v.id)} {...itemProps} />)}
        </Group>
      )}

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="text-sm font-semibold text-slate-500 uppercase tracking-wider cursor-pointer">
            Искористени и поништени ({done.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((v) => <VoucherItem key={v.id} v={v} noSale={false} {...itemProps} />)}
          </ul>
        </details>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 sm:py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Назад">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Ticket className="h-6 w-6 text-blue-600" /> Ваучери
        </h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Секој ваучер има број, за кого е и рок од {VOUCHER_TERM_MONTHS} месеци. При искористување ваучерот се брише, а
        парчињата се продадени на денот кога е купен ваучерот. Ако се земе помалку, остатокот пропаѓа.
      </p>
      {children}
    </div>
  );
}

function Group({ title, lead, empty, children }: { title: string; lead?: string; empty?: string; children: React.ReactNode[] }) {
  const none = children.length === 0;
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h2>
      {lead && <p className="text-xs text-slate-500 -mt-1 mb-2">{lead}</p>}
      {none && empty ? <p className="text-sm text-slate-500">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  );
}

function FirebaseBox({ lead, steps }: { lead: string; steps: string[] }) {
  if (!FIREBASE_SYNC_LIVE || steps.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Внеси го истото и во Firebase</p>
      <p className="mt-0.5">{lead}</p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ul>
    </div>
  );
}

function SellForm({ cards, onSold, onCancel }: { cards: Product[]; onSold: (v: Voucher) => void; onCancel: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [holder, setHolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = cards.flatMap((c) => Array.from({ length: counts[c.id] ?? 0 }, () => c.id));
  const total = cards.reduce((s, c) => s + (counts[c.id] ?? 0) * (c.price || 0), 0);
  const change = (c: Product, by: number) =>
    setCounts((all) => ({ ...all, [c.id]: Math.max(0, Math.min(inDrawer(c), (all[c.id] ?? 0) + by)) }));

  const save = async () => {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSold(await sellVoucher(supabase, picked, holder.trim()));
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="font-semibold text-slate-900 mb-1">Продај ваучер</h2>
      <p className="text-xs text-slate-500 mb-3">За поголема сума избери повеќе картички: добиваат еден број.</p>
      {cards.length === 0 ? (
        <p className="text-sm text-slate-500">Нема картички за ваучер во системот.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => {
            const n = counts[c.id] ?? 0;
            const left = inDrawer(c);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">Ваучер {mkDen(c.price || 0)}</p>
                  <p className="text-[11px] text-slate-500">{c.name} · во фиоката {left}</p>
                </div>
                <button onClick={() => change(c, -1)} disabled={n === 0} className="p-2 rounded-lg border border-slate-300 disabled:opacity-40" aria-label="Една помалку">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center tabular-nums font-semibold">{n}</span>
                <button onClick={() => change(c, 1)} disabled={n >= left} className="p-2 rounded-lg border border-slate-300 disabled:opacity-40" aria-label="Уште една">
                  <Plus className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        value={holder}
        onChange={(e) => setHolder(e.target.value)}
        maxLength={200}
        placeholder="За кого е / телефон"
        className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      {FIREBASE_SYNC_LIVE && (
        <p className="mt-3 text-xs text-amber-800 flex gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Firebase сè уште е изворот на залихата: по продажбата ќе ти кажам што да внесеш и таму.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-700">Откажи</button>
        <button
          onClick={save}
          disabled={picked.length === 0 || saving}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ticket className="h-5 w-5" />}
          Продај{total > 0 ? ` · ${mkDen(total)}` : ''}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function SoldCard({ v, onClose }: { v: Voucher; onClose: () => void }) {
  return (
    <section className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-green-700" />
        </div>
        <div>
          <p className="font-semibold text-green-800">Ваучерот е продаден · наплати {mkDen(v.amount)}</p>
          <p className="text-sm text-slate-700">Важи до {dayText(v.expiresOn)}{v.holder ? ` · ${v.holder}` : ''}</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-blue-50 py-4 text-center">
        <p className="text-xs text-blue-900">Напиши го бројот на {v.cards.length > 1 ? 'секоја картичка' : 'картичката'}</p>
        <p className="text-4xl font-bold text-blue-900 tabular-nums">бр. {v.number}</p>
      </div>
      <FirebaseBox lead="Инаку следниот Sync All ја враќа картичката во фиоката:" steps={sellFirebaseSteps(v, dayText, mkDen)} />
      <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Готово
      </button>
    </section>
  );
}

function VoucherHead({ v, today }: { v: Voucher; today: string }) {
  const state = voucherState(v, today);
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-bold text-slate-900 tabular-nums">бр. {v.number}</span>
        <span className="font-semibold tabular-nums">{mkDen(v.amount)}</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
      </p>
      <p className="text-xs text-slate-500">
        купен {dayText(v.soldDay)} · важи до {dayText(v.expiresOn)}
        {v.cards.length > 1 && <> · картички {v.cards.map((c) => mkDen(c.price)).join(' + ')}</>}
      </p>
      <p className="text-sm text-slate-700 truncate">{v.holder || <span className="text-slate-400">без име</span>}</p>
    </div>
  );
}

function VoucherItem({
  v, today, isAdmin, noSale, onRedeem, onChanged,
}: {
  v: Voucher;
  today: string;
  isAdmin: boolean;
  noSale: boolean;
  onRedeem: (v: Voucher) => void;
  onChanged: (n: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = voucherState(v, today);

  const run = async (ask: string, act: () => Promise<Notice | null>) => {
    if (!confirm(ask)) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await act());
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => run(
    v.soldHere
      ? `Да се поништи ваучерот бр. ${v.number}? Картичките се враќаат во фиоката, а продажбата од ${dayText(v.soldDay)} се брише.`
      : `Да се поништи ваучерот бр. ${v.number}? Продажбата од ${dayText(v.soldDay)} останува, без број.`,
    async () => {
      const c = await cancelVoucher(supabase, v.id);
      return { title: `Ваучерот бр. ${c.number} е поништен.`, lines: FIREBASE_SYNC_LIVE ? cancelFirebaseSteps(c, dayText, mkDen) : [] };
    },
  );
  const undo = () => run(
    `Ваучерот бр. ${v.number} да биде пак неискористен? Парчињата се враќаат на залиха, а ваучерот пак е продаден на ${dayText(v.soldDay)}.`,
    async () => {
      const u = await undoVoucher(supabase, v.id);
      return { title: `Ваучерот бр. ${u.number} пак важи.`, lines: [] };
    },
  );

  return (
    <li className={`bg-white rounded-xl border p-3 ${state === 'valid' ? 'border-slate-200' : 'border-slate-200 opacity-80'}`}>
      <div className="flex items-start gap-3">
        <VoucherHead v={v} today={today} />
        {(state === 'valid' || (state === 'expired' && isAdmin)) && (
          <button
            onClick={() => onRedeem(v)}
            disabled={noSale || busy}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shrink-0 disabled:opacity-40"
          >
            Искористи
          </button>
        )}
      </div>
      {noSale && (
        <p className="mt-1 text-xs text-amber-800">
          Продажбата на овој ваучер ја нема во системот (искористен или вратен во Firebase?).{isAdmin ? ' Поништи го ако е искористен.' : ' Кажи му на админот.'}
        </p>
      )}
      {v.redeemedAt && (
        <p className="mt-1 text-[11px] text-slate-500">Искористен {countWhen(v.redeemedAt)}{v.redeemedBy ? ` · ${v.redeemedBy}` : ''}</p>
      )}
      {v.cancelledAt && (
        <p className="mt-1 text-[11px] text-slate-500">Поништен {countWhen(v.cancelledAt)}{v.cancelledBy ? ` · ${v.cancelledBy}` : ''}</p>
      )}
      {isAdmin && (isOut(v) || v.redeemedAt) && (
        <div className="mt-2 flex gap-3 text-xs">
          {isOut(v) && <button onClick={cancel} disabled={busy} className="text-slate-600 underline disabled:opacity-50">Поништи ваучер</button>}
          {v.redeemedAt && <button onClick={undo} disabled={busy} className="text-slate-600 underline disabled:opacity-50">Врати како неискористен</button>}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  );
}

function UnnumberedList({ sales, onNumbered }: { sales: UnnumberedSale[]; onNumbered: (v: Voucher) => void }) {
  return (
    <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
      <h2 className="text-sm font-semibold text-slate-800">Продадени ваучери без број</h2>
      <p className="text-xs text-slate-600 mb-2">
        Продадени пред овој екран или во Firebase. Дај им број и запиши за кого се, ако знаеш. Рокот е од денот на продажбата.
      </p>
      <ul className="space-y-2">
        {sales.map((s) => <UnnumberedRow key={`${s.productId}|${s.day}|${s.price}`} sale={s} onNumbered={onNumbered} />)}
      </ul>
    </div>
  );
}

function UnnumberedRow({ sale, onNumbered }: { sale: UnnumberedSale; onNumbered: (v: Voucher) => void }) {
  const [holder, setHolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const give = async () => {
    setBusy(true);
    setError(null);
    try {
      onNumbered(await numberSale(supabase, sale.productId, sale.day, sale.price, holder.trim()));
      setHolder('');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="bg-white rounded-lg border border-slate-200 p-2">
      <p className="text-sm">
        <b className="tabular-nums">{mkDen(sale.price)}</b> · продаден {dayText(sale.day)}
        {sale.count > 1 && <span className="text-slate-500"> · ×{sale.count}</span>}
      </p>
      <div className="mt-1.5 flex gap-2">
        <input
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          maxLength={200}
          placeholder="За кого е / телефон (ако знаеш)"
          className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
        />
        <button onClick={give} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm shrink-0 disabled:opacity-50">
          {busy ? '…' : 'Дај број'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  );
}

function RedeemPanel({
  v, products, today, onRedeemed, onCancel,
}: {
  v: Voucher;
  products: Product[];
  today: string;
  onRedeemed: (x: Exchange) => void;
  onCancel: () => void;
}) {
  const [out, setOut] = useState<Out[]>([]);
  const [picking, setPicking] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);

  const candidates = useMemo(() => products.filter((p) => !NOT_EXCHANGED.has(p.category)), [products]);
  const booking = useMemo(
    () => bookExchange(v.cards.map((c) => c.price), out.map((o) => Number(o.agreed) || 0)),
    [v, out],
  );
  const badPrice = out.some((o) => !(Number(o.agreed) > 0));
  const expired = today > v.expiresOn;

  const available = (p: Product, size: string) =>
    shelfOf(p, size) - out.filter((o) => o.product.id === p.id && o.size === size).length;
  const addOut = (product: Product, size: string) => {
    const key = nextKey.current++;
    setOut((list) => [...list, newOut(key, product, size)]);
    setPicking(false);
    setError(null);
  };

  const save = async () => {
    if (out.length === 0 || badPrice || saving) return;
    if (expired && !confirm(`Ваучерот истекол на ${dayText(v.expiresOn)}. Сепак да се искористи?`)) return;
    setSaving(true);
    setError(null);
    try {
      onRedeemed(await redeemVoucher(
        supabase,
        v.id,
        out.map((o) => ({ productId: o.product.id, size: o.size, agreed: Number(o.agreed) })),
        note.trim(),
      ));
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <VoucherHead v={v} today={today} />
          <button onClick={onCancel} className="text-xs text-blue-700 underline shrink-0">друг ваучер</button>
        </div>
        {expired && (
          <p className="mt-2 text-xs text-amber-800">Истечен на {dayText(v.expiresOn)}: само админот може сепак да го искористи.</p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="font-semibold text-slate-900 mb-3">Што зема</h2>
        <OutList out={out} onChange={setOut} />
        {picking ? (
          <OutPicker products={candidates} available={available} onPick={addOut} onClose={() => setPicking(false)} />
        ) : (
          <AddButton onClick={() => setPicking(true)}>
            {out.length === 0 ? 'Избери парче од залиха' : 'Уште едно парче'}
          </AddButton>
        )}
      </section>

      {out.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="font-semibold text-slate-900 mb-3">Пресметка</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Ваучер бр. {v.number}, купен {dayText(v.soldDay)} ({ago(v.soldDay, today)})</dt>
              <dd className="tabular-nums">{mkDen(booking.returnedTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Зема {pieces(out.length)}</dt>
              <dd className="tabular-nums">{mkDen(booking.givenTotal)}</dd>
            </div>
          </dl>
          {badPrice ? (
            <p className="mt-3 text-sm text-red-700">Секое парче мора да има цена.</p>
          ) : booking.leftOver > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Остануваат {mkDen(booking.leftOver)} од ваучерот.</p>
              <p className="mt-0.5">
                Остатокот пропаѓа, пари не се враќаат: купувачот може да земе уште нешто. Ако продолжиш, парчињата се книжат
                по {mkDen(booking.returnedTotal)} вкупно.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-baseline justify-between rounded-lg bg-blue-50 px-3 py-2">
                <span className="text-sm font-medium text-blue-900">{booking.topUp > 0 ? 'Доплата' : 'Без доплата'}</span>
                {booking.topUp > 0 && <span className="text-2xl font-bold text-blue-900 tabular-nums">{mkDen(booking.topUp)}</span>}
              </div>
              {booking.topUp > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  Доплатата се книжи со парчињата, на {dayText(v.soldDay)}, денот кога е купен ваучерот.
                </p>
              )}
            </>
          )}
          {FIREBASE_SYNC_LIVE && (
            <p className="mt-3 text-xs text-amber-800 flex gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Firebase сè уште е изворот на залихата: потоа ќе ти кажам што да внесеш и таму.
            </p>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={150}
            placeholder="Белешка (не мора)"
            className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button
            onClick={save}
            disabled={saving || badPrice}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ticket className="h-5 w-5" />}
            Искористи ваучер{booking.topUp > 0 && !badPrice ? ` · доплата ${mkDen(booking.topUp)}` : ''}
          </button>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </section>
      )}
    </div>
  );
}

function RedeemedCard({ v, x, onClose }: { v: Voucher; x: Exchange; onClose: () => void }) {
  return (
    <section className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-green-700" />
        </div>
        <div>
          <p className="font-semibold text-green-800">Ваучерот бр. {v.number} е искористен</p>
          <p className="text-sm text-slate-700">
            {x.topUp > 0 ? <>Наплати доплата: <b className="tabular-nums">{mkDen(x.topUp)}</b></> : 'Без доплата.'}
          </p>
        </div>
      </div>
      <ExchangeLines returned={x.returned} given={x.given} backWord="ваучер" />
      <p className="mt-2 text-xs text-slate-500">
        {v.cards.length > 1 ? 'Картичките врати ги во фиоката.' : 'Картичката врати ја во фиоката.'} Парчињата се во продажбите
        на {dayText(x.purchaseDay)}, денот кога е купен ваучерот.
      </p>
      <FirebaseBox lead="Инаку следниот Sync All го враќа ваучерот како продаден:" steps={firebaseSteps(x, dayText, mkDen)} />
      <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Готово
      </button>
    </section>
  );
}
