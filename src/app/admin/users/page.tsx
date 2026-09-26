'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ROLE_LABEL, Role } from '@/lib/roles';

/**
 * Back-office accounts (Task 8.7): add someone for the warehouse, change a
 * role, set a new password. Everything goes through /api/admin/users, which
 * holds the service-role key and checks that the caller is the admin.
 */

interface Account {
  id: string;
  email: string;
  role: Role | null;
  createdAt: string;
  lastSignInAt: string | null;
}

type Wanted = Role | 'none';

/** The roles an account can be given from here. Customers sign up themselves. */
const ASSIGNABLE: Wanted[] = ['staff', 'admin', 'none'];
const WANTED_LABEL: Record<Wanted, string> = { ...ROLE_LABEL, none: 'Без пристап' };

async function call(method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Грешка ${res.status}`);
  return json;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('mk-MK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function UsersView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '', role: 'staff' as 'staff' | 'admin' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await call('GET');
      setAccounts(json.users);
      setMe(json.me);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await call('POST', form);
      setNotice(`Профилот ${form.email} е направен. Предај му ја лозинката лично.`);
      setForm({ email: '', password: '', role: 'staff' });
      await load();
    } catch (err) {
      setNotice(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (a: Account, role: Wanted) => {
    setError(null);
    setNotice(null);
    try {
      await call('PATCH', { id: a.id, role });
      setNotice(`${a.email} → ${WANTED_LABEL[role]}. Важи при следното отворање; до еден час во базата.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const newPassword = async (a: Account) => {
    const password = window.prompt(`Нова лозинка за ${a.email} (барем 8 знаци):`);
    if (!password) return;
    setError(null);
    setNotice(null);
    try {
      await call('PATCH', { id: a.id, password });
      setNotice(`Лозинката за ${a.email} е сменета.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Корисници</h1>
          <p className="text-sm text-slate-500">Кој може да влезе во администрацијата и што гледа</p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{notice}</p>}

      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-600" /> Нов профил
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="email" required placeholder="е-пошта" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="text" required minLength={8} placeholder="лозинка (барем 8)" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            autoComplete="new-password"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'staff' | 'admin' })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="staff">{ROLE_LABEL.staff}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Магацин: залиха, производи, продажба, online нарачки — без статистики, набавни цени и збирови.
          Не се праќа мејл; лозинката ја предаваш ти.
        </p>
        <button
          type="submit" disabled={busy}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Се прави…' : 'Направи профил'}
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {a.email}
                    {a.id === me && <span className="ml-2 text-[11px] text-slate-400">(ти)</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    направен {fmtDate(a.createdAt)} · последна најава {fmtDate(a.lastSignInAt)}
                  </p>
                </div>
                <select
                  value={a.role ?? 'none'}
                  disabled={a.id === me}
                  onChange={(e) => changeRole(a, e.target.value as Wanted)}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  title={a.id === me ? 'Сопствената улога не се менува' : undefined}
                >
                  {a.role === 'customer' && <option value="customer">{ROLE_LABEL.customer}</option>}
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{WANTED_LABEL[r]}</option>
                  ))}
                </select>
                <button
                  onClick={() => newPassword(a)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Лозинка
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user, isAdmin, loading } = useAuth();
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
        <Link href="/admin" className="text-blue-600 font-medium">Најави се</Link>
      </div>
    );
  }
  // AdminGate already stops staff; this only keeps the fetch from firing.
  return isAdmin ? <UsersView /> : null;
}
