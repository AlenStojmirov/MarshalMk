'use client';

/**
 * Goods received.
 *
 * The only moment a batch's real cost and its arrival date exist. Miss it and
 * they are gone for that batch, and stock ageing — every clearance and
 * slow-mover rule downstream — has nothing to measure from.
 *
 * Recording a delivery does three things at once: it files the batch cost, it
 * puts the units on the shelf, and it stamps `first_received_at` the first time
 * a product arrives. That last one is the ageing clock, and it is only ever set
 * once — ageing runs from the first arrival, not the most recent.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import {
  Purchase,
  PurchaseLine,
  Supplier,
  addSupplier,
  getPurchases,
  getSuppliers,
  receivePurchase,
} from '@/lib/purchasing';
import { ArrowLeft, Check, Package, Plus, Search, Truck, X } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const today = () => new Date().toISOString().slice(0, 10);

interface DraftLine extends PurchaseLine {
  key: string;
  productName: string;
}

function ReceivingView() {
  const { products, loading: productsLoading, refetch } = useProducts();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const [head, setHead] = useState({
    supplierId: '',
    orderedAt: '',
    receivedAt: today(),
    invoiceNo: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<Product | null>(null);
  const [newSupplier, setNewSupplier] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [s, p] = await Promise.all([getSuppliers(), getPurchases()]);
      setSuppliers(s);
      setPurchases(p);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error && /suppliers|purchases/.test(err.message)
          ? 'Табелите не постојат — пушти supabase/migrations/004_purchasing.sql'
          : 'Не може да се вчита.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const addLine = (p: Product, size: string) => {
    setLines((prev) => [
      ...prev,
      {
        key: `${p.id}|${size}|${Date.now()}`,
        productId: p.id,
        productName: getProductDisplayName(p.name, p.category, p.brand),
        size,
        qty: 1,
        // Prefilled from the last known cost — the usual case is the same price
        // again, and a wrong number is more visible than an empty one.
        unitCost: p.purchasePrice ?? 0,
      },
    ]);
    setPicking(null);
    setSearch('');
  };

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totalUnits = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const totalCost = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const incomplete = lines.some((l) => !(Number(l.qty) > 0) || !(Number(l.unitCost) >= 0));

  const handleSave = async () => {
    if (lines.length === 0 || incomplete) return;
    setSaving(true);
    try {
      await receivePurchase({
        supplierId: head.supplierId || undefined,
        orderedAt: head.orderedAt || undefined,
        receivedAt: head.receivedAt,
        invoiceNo: head.invoiceNo,
        lines: lines.map((l) => ({
          productId: l.productId,
          size: l.size,
          qty: Number(l.qty),
          unitCost: Number(l.unitCost),
        })),
      });
      setSaved(`Примени ${totalUnits} парчиња · ${fmt(totalCost)} ден.`);
      setLines([]);
      setHead((h) => ({ ...h, invoiceNo: '', orderedAt: '' }));
      await Promise.all([load(), refetch()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Приемот не успеа');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.trim()) return;
    await addSupplier({ name: newSupplier });
    setNewSupplier('');
    await load();
  };

  if (productsLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Прием на стока</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Ова е единствениот момент кога набавната цена и датумот на прием постојат. Внеси ги тука и
          стареењето на залихата почнува да се мери — инаку за таа серија се губат засекогаш.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {saved && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <Check className="h-4 w-4" />
            {saved}
          </div>
        )}

        {/* delivery head */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Нова испорака</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Добавувач</label>
              <select
                value={head.supplierId}
                onChange={(e) => setHead((h) => ({ ...h, supplierId: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Нарачано на</label>
              <input
                type="date"
                value={head.orderedAt}
                onChange={(e) => setHead((h) => ({ ...h, orderedAt: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Примено на</label>
              <input
                type="date"
                value={head.receivedAt}
                onChange={(e) => setHead((h) => ({ ...h, receivedAt: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Фактура</label>
              <input
                type="text"
                value={head.invoiceNo}
                onChange={(e) => setHead((h) => ({ ...h, invoiceNo: e.target.value }))}
                placeholder="бр."
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          {head.orderedAt && head.receivedAt && (
            <p className="text-[11px] text-slate-400 mt-2">
              Измерен lead time: {Math.round((Date.parse(head.receivedAt) - Date.parse(head.orderedAt)) / 86400000)} дена
              — подобар податок од проценка кога ќе дојде ред на reorder точката.
            </p>
          )}
        </div>

        {/* line entry */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Што пристигна</h2>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Барај производ по ID или име…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            {matches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPicking(p)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {getProductDisplayName(p.name, p.category, p.brand)}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {p.id} · залиха {p.stock}
                      {p.purchasePrice !== undefined ? ` · последна набавна ${fmt(p.purchasePrice)}` : ' · нема набавна цена'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {picking && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-800">
                  {getProductDisplayName(picking.name, picking.category, picking.brand)} — избери големина
                </p>
                <button onClick={() => setPicking(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(picking.sizes ?? []).map((s) => (
                  <button
                    key={s.size}
                    onClick={() => addLine(picking, s.size)}
                    className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:border-blue-400"
                  >
                    {s.size} <span className="text-slate-400">({s.quantity})</span>
                  </button>
                ))}
                <NewSizeButton onAdd={(size) => addLine(picking, size)} />
              </div>
            </div>
          )}

          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Нема додадени ставки.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{l.productName}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{l.productId} · {l.size || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">Количина</label>
                    <input
                      type="number"
                      min="1"
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: Number(e.target.value) })}
                      className="w-16 px-2 py-1 text-sm border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">Набавна</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={l.unitCost}
                      onChange={(e) => patchLine(l.key, { unitCost: Number(e.target.value) })}
                      className="w-20 px-2 py-1 text-sm border border-slate-300 rounded tabular-nums"
                    />
                  </div>
                  <div className="w-20 text-right tabular-nums text-sm font-semibold text-slate-700">
                    {fmt((Number(l.qty) || 0) * (Number(l.unitCost) || 0))}
                  </div>
                  <button
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t text-sm">
                <span className="font-semibold text-slate-700">
                  {totalUnits} парчиња
                </span>
                <span className="font-bold text-slate-900 tabular-nums">{fmt(totalCost)} ден.</span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || incomplete}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
                {saving ? 'Се запишува…' : 'Прими на залиха'}
              </button>
            </div>
          )}
        </div>

        {/* suppliers */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
          <h2 className="font-bold text-slate-800 text-sm mb-3">Добавувачи</h2>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {suppliers.length === 0 ? (
              <p className="text-sm text-slate-400">Нема внесени добавувачи.</p>
            ) : (
              suppliers.map((s) => (
                <span key={s.id} className="px-2.5 py-1 text-xs bg-slate-100 rounded-lg text-slate-700">
                  {s.name} <span className="text-slate-400">· {s.leadTimeDays}д</span>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              placeholder="Име на добавувач"
              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
            />
            <button
              onClick={handleAddSupplier}
              disabled={!newSupplier.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Додади
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Lead time почнува на 14 дена. Секоја испорака со внесен датум на нарачка го мери вистинскиот,
            па проценката се заменува со податок.
          </p>
        </div>

        {/* history */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <h2 className="font-bold text-slate-800 text-sm">Претходни испораки</h2>
          </div>
          {purchases.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Сè уште нема запишани испораки.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">
                      {p.supplierName ?? 'без добавувач'}
                      {p.invoiceNo ? <span className="text-slate-400 font-normal"> · {p.invoiceNo}</span> : null}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      примено {p.receivedAt}
                      {p.actualLeadDays !== undefined ? ` · lead time ${p.actualLeadDays} дена` : ''}
                    </p>
                  </div>
                  <span className="text-slate-500 tabular-nums">{p.totalUnits} парч.</span>
                  <span className="font-semibold text-slate-800 tabular-nums w-24 text-right">
                    {fmt(p.totalCost)} ден.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A delivery is often the first time a size is carried at all. */
function NewSizeButton({ onAdd }: { onAdd: (size: string) => void }) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 text-xs font-medium border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400"
      >
        + нова големина
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); }
          if (e.key === 'Escape') { setValue(''); setOpen(false); }
        }}
        placeholder="XL"
        className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
      />
      <button
        onClick={() => { if (value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); } }}
        className="text-xs text-blue-600 font-medium"
      >
        ок
      </button>
    </span>
  );
}

export default function ReceivingPage() {
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

  return <ReceivingView />;
}
