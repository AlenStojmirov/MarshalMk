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
 * Task 10.0 is the frame: the role, the door, and a count that proves the
 * catalogue reaches this account. The work itself arrives in 10.1–10.5.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Copy, Image as ImageIcon, LogOut, Megaphone, Target, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { ROLE_LABEL } from '@/lib/roles';
import type { Product } from '@/types';

const onShelf = (p: Product) => (p.sizes ?? []).some((s) => s.quantity >= 1);

/** What is coming, in the order it is built. */
const NEXT: Array<{ id: string; title: string; hint: string; icon: typeof Megaphone }> = [
  { id: '10.1', title: 'Што да објавиме', hint: 'предлози од залихата, сезоната и продажбите', icon: Sparkles },
  { id: '10.2', title: 'Текст за објава', hint: 'на македонски, со малку хумор и емоџи', icon: Copy },
  { id: '10.3', title: 'Пакет за објава', hint: 'слики по ред и картичка со цена и големини', icon: ImageIcon },
  { id: '10.4', title: 'Календар', hint: 'следниот месец по денови, рамка за три месеци', icon: CalendarDays },
  { id: '10.5', title: 'Цел до нула', hint: 'колку фали овој месец', icon: Target },
];

export default function MarketingPage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const { products, loading } = useProducts();

  const counts = useMemo(() => {
    const live = products.filter((p) => p.isVisible !== false && onShelf(p));
    return {
      live: live.length,
      hidden: products.filter((p) => p.isVisible === false && onShelf(p)).length,
      onSale: live.filter((p) => p.sale?.isActive).length,
    };
  }, [products]);

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
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

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'На сајтот', value: counts.live, hint: 'видливи, со залиха' },
          { label: 'Скриени', value: counts.hidden, hint: 'со залиха, чекаат слика' },
          { label: 'На попуст', value: counts.onSale, hint: 'од тие на сајтот' },
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
        <p className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Базата не врати ниту еден производ. Најверојатно миграцијата 011 сè уште не е пуштена.
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Што доаѓа тука</h2>
        <p className="text-sm text-slate-500 mb-4">
          Страната ја подготвува објавата. Објавувањето на Instagram и Facebook останува рачно.
        </p>
        <ul className="space-y-2">
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
