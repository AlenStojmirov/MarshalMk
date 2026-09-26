'use client';

import Link from 'next/link';
import {
  AlertTriangle, CalendarDays, Camera, Clock, Coins, Database, Gauge, Grid2x2, Package,
  PackagePlus, Receipt, Ruler, ShoppingBag, Truck, Users, Wallet, type LucideIcon,
} from 'lucide-react';

/**
 * The owner's screens, grouped by the question they answer (Task 8.6).
 *
 * Seventeen tiles in one grid had to be read one by one to find anything.
 * Grouped, the first glance says where to look: the day's work, the stock and
 * the season, buying, money. Every screen stays one click from /admin.
 */

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Kept reachable but marked, so it is not mistaken for part of the routine. */
  muted?: boolean;
}

interface NavGroup {
  title: string;
  tone: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Секој ден',
    tone: 'text-blue-700',
    items: [
      { href: '/admin/orders', label: 'Online нарачки', hint: 'обработка, исход', icon: Package },
      { href: '/admin/in-store-sales', label: 'Продажба во дуќан', hint: 'внес и историја', icon: ShoppingBag },
      { href: '/admin/sold-out', label: 'Распродадено', hint: 'модели без залиха', icon: AlertTriangle },
      { href: '/admin/publishing', label: 'Објавување', hint: 'што чека фотографија', icon: Camera },
    ],
  },
  {
    title: 'Стока и сезона',
    tone: 'text-rose-700',
    items: [
      { href: '/admin/season', label: 'Сезонски календар', hint: 'што да се намали сега', icon: CalendarDays },
      { href: '/admin/aging', label: 'Стареење', hint: 'стока што стои', icon: Clock },
      { href: '/admin/velocity', label: 'Sell-through и темпо', hint: 'што се продава', icon: Gauge },
      { href: '/admin/matrix', label: 'Брзина × маржа', hint: 'каде се губи', icon: Grid2x2 },
      { href: '/admin/sizes', label: 'Скршени серии', hint: 'фали големина', icon: Ruler },
    ],
  },
  {
    title: 'Набавка',
    tone: 'text-cyan-700',
    items: [
      { href: '/admin/reorder', label: 'План за набавка', hint: 'што да се нарача', icon: PackagePlus },
      { href: '/admin/capital', label: 'Каде да инвестирам', hint: 'пари по категорија', icon: Coins },
      { href: '/admin/receiving', label: 'Прием на стока', hint: 'не се користи (D-015)', icon: Truck, muted: true },
    ],
  },
  {
    title: 'Пари и купувачи',
    tone: 'text-indigo-700',
    items: [
      { href: '/admin/finance', label: 'Трошоци и резултат', hint: 'месец по месец', icon: Wallet },
      { href: '/admin/expenses', label: 'Без наплата', hint: 'подароци, лично, отпис', icon: Receipt },
      { href: '/admin/customers', label: 'Online купувачи', hint: 'повторни, одбиени', icon: Users },
    ],
  },
  {
    title: 'Систем',
    tone: 'text-slate-600',
    items: [
      { href: '/admin/inventory', label: 'Синхронизација со Firebase', hint: 'до денот на преминот', icon: Database },
    ],
  },
];

export default function AdminNav() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
      {GROUPS.map((g) => (
        <section key={g.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <h2 className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 px-1 ${g.tone}`}>{g.title}</h2>
          <ul>
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 ${it.muted ? 'opacity-60' : ''}`}
                >
                  <it.icon className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-800">{it.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400 text-right truncate">{it.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
