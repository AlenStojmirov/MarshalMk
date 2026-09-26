'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { EyeOff, LogOut, Package, Pencil, Plus, Search, Shirt, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProducts, createProduct } from '@/hooks/useProducts';
import { getOrders } from '@/lib/orders';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import { getProductDisplayName } from '@/lib/product-display';
import { ROLE_LABEL } from '@/lib/roles';
import { Product, ProductFormData } from '@/types';
import ProductForm, { saveProductEdit } from '@/components/admin/ProductForm';

/**
 * The warehouse screen (Task 8.5): what staff see at /admin.
 *
 * Only the work of a shift — record a sale, process an order, find a piece,
 * add or correct a product. No margins, no costs, no totals: those are the
 * owner's (8.2). The data behind it is limited the same way in the database
 * (8.4), so nothing here hides what the screen could still fetch.
 */

type StockFilter = 'in' | 'empty' | 'all';

/** Orders someone still has to act on. */
const OPEN_STATUSES = new Set(['pending', 'confirmed', 'processing']);

export default function StaffHome() {
  const { user, role, signOut } = useAuth();
  // Rendered for staff only — checked here as well as by the caller, so no
  // path through the admin can ever show it to an account without the role.
  if (role !== 'staff') return null;
  return <StaffHomeView email={user?.email ?? ''} onSignOut={signOut} />;
}

function StaffHomeView({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { products, loading, refetch } = useProducts();
  const [openOrders, setOpenOrders] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState<StockFilter>('in');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>();

  useEffect(() => {
    getOrders()
      .then((all) => setOpenOrders(all.filter((o) => OPEN_STATUSES.has(o.status)).length))
      .catch(() => setOpenOrders(null));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => {
        if (category && p.category !== category) return false;
        if (stock === 'in' && p.stock <= 0) return false;
        if (stock === 'empty' && p.stock > 0) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          getProductDisplayName(p.name, p.category, p.brand).toLowerCase().includes(q)
        );
      })
      .slice(0, 200);
  }, [products, query, category, stock]);

  const handleCreate = async (data: ProductFormData, customId?: string) => {
    const id = await createProduct(data, customId);
    setCreating(false);
    refetch();
    return id;
  };

  const handleUpdate = async (data: ProductFormData) => {
    if (!editing) return;
    const err = await saveProductEdit(editing, data);
    if (err) {
      alert(err);
      return;
    }
    setEditing(undefined);
    refetch();
    return editing.id;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Магацин</h1>
          <p className="text-xs text-slate-500 truncate">
            {email} · {ROLE_LABEL.staff}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Одјава
        </button>
      </div>

      {/* The things a shift does */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link
          href="/admin/in-store-sales"
          className="flex items-center gap-3 p-4 bg-blue-600 text-white rounded-xl shadow-sm hover:bg-blue-700"
        >
          <ShoppingBag className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-semibold">Продажба во дуќан</p>
            <p className="text-xs text-blue-100">Внеси што се продало</p>
          </div>
        </Link>
        <Link
          href="/admin/orders"
          className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50"
        >
          <Package className="h-6 w-6 text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Online нарачки</p>
            <p className="text-xs text-slate-500">Спакувај, испрати, затвори</p>
          </div>
          {openOrders !== null && openOrders > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold tabular-nums">
              {openOrders} чекаат
            </span>
          )}
        </Link>
        <Link
          href="/admin/catalog"
          className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50"
        >
          <Shirt className="h-6 w-6 text-blue-600 shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">Каталог</p>
            <p className="text-xs text-slate-500">Состав, боја, крој</p>
          </div>
        </Link>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50 text-left"
        >
          <Plus className="h-6 w-6 text-blue-600 shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">Нов производ</p>
            <p className="text-xs text-slate-500">Стока што стигнала во дуќан</p>
          </div>
        </button>
      </div>

      {/* Stock */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Барај по име или шифра"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Сите категории</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={stock}
            onChange={(e) => setStock(e.target.value as StockFilter)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="in">Со залиха</option>
            <option value="empty">Празни</option>
            <option value="all">Сите</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-10">Нема производи за овој избор.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((p) => (
              <StockRow key={p.id} product={p} onEdit={() => setEditing(p)} />
            ))}
          </ul>
        )}
        {shown.length === 200 && (
          <p className="text-center text-xs text-slate-400 py-2">Прикажани се првите 200 — стесни го пребарувањето.</p>
        )}
      </div>

      {creating && (
        <ProductForm showCost={false} onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}
      {editing && (
        <ProductForm
          showCost={false}
          product={editing}
          onSave={handleUpdate}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function StockRow({ product: p, onEdit }: { product: Product; onEdit: () => void }) {
  const price = getEffectivePrice(p);
  const sizes = (p.sizes ?? []).filter((s) => s.size);

  return (
    <li className="flex items-center gap-3 px-3 sm:px-4 py-3">
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
        {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="48px" />}
      </div>

      <Link href={`/admin/product/${p.id}`} className="flex-1 min-w-0 group">
        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-700">
          {getProductDisplayName(p.name, p.category, p.brand)}
          {p.isVisible === false && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-slate-500">
              <EyeOff className="h-3 w-3" /> скриен
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-400 truncate">{p.id}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {sizes.length === 0 ? (
            <span className="text-[11px] text-slate-400">без големини</span>
          ) : (
            sizes.map((s) => (
              <span
                key={s.size}
                className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                  s.quantity > 0 ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-400 line-through'
                }`}
              >
                {s.size}·{s.quantity}
              </span>
            ))
          )}
        </div>
      </Link>

      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-slate-900 tabular-nums">{Math.round(price)} ден.</p>
        {isOnSale(p) && (
          <p className="text-[11px] text-slate-400 line-through tabular-nums">{Math.round(p.price)} ден.</p>
        )}
      </div>

      <button
        onClick={onEdit}
        title="Измени"
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700 shrink-0"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}
