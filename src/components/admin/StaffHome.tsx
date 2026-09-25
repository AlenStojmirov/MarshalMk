'use client';

import Link from 'next/link';
import { LogOut, Package, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABEL } from '@/lib/roles';

/**
 * What staff see at /admin (Task 8.2). Deliberately a set of doors and nothing
 * else — the owner's dashboard is all margins and totals. The warehouse screen
 * with stock and product editing replaces this in 8.5.
 */
export default function StaffHome() {
  const { user, role, signOut } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Магацин</h1>
          <p className="text-xs text-slate-500">
            {user?.email} · {role ? ROLE_LABEL[role] : ''}
          </p>
        </div>
        <button
          onClick={signOut}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Одјава
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/in-store-sales"
          className="flex items-center gap-3 p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50"
        >
          <ShoppingBag className="h-6 w-6 text-blue-600" />
          <div>
            <p className="font-semibold text-slate-900">Продажба во дуќан</p>
            <p className="text-xs text-slate-500">Внеси што се продало</p>
          </div>
        </Link>
        <Link
          href="/admin/orders"
          className="flex items-center gap-3 p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50"
        >
          <Package className="h-6 w-6 text-blue-600" />
          <div>
            <p className="font-semibold text-slate-900">Online нарачки</p>
            <p className="text-xs text-slate-500">Спакувај, испрати, затвори</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
