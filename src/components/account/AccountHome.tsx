'use client';

/**
 * /smetka (Task 13.6): sign-in when signed out, and the customer's own page
 * when signed in — the dashboard with points, coupons, orders and the
 * profile (13.9), its tab kept in the address (`?tab=kuponi`) so a link or an
 * e-mail can open the right one.
 *
 * Coming back from the confirmation e-mail, Supabase signs the customer in
 * from the link (`?potvrdeno=1`); the first read of the profile then hands
 * out the welcome coupon and bonus, once (server side).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { AccountView } from '@/lib/account';
import { accountFetch } from '@/lib/account-client';
import AccountFrame, { Notice } from './AccountFrame';
import LoginForm from './LoginForm';
import ProfileForm from './ProfileForm';
import CustomerDashboard, { DASHBOARD_TABS, type DashboardTab } from './CustomerDashboard';

function Spinner() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin h-10 w-10 border-4 border-stone-900 border-t-transparent rounded-full" />
    </div>
  );
}

export default function AccountHome() {
  const { user, loading, signOut } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const confirmedNow = params.get('potvrdeno') === '1';
  const asked = params.get('tab');
  const tab: DashboardTab = DASHBOARD_TABS.some((t) => t.key === asked) ? (asked as DashboardTab) : 'pochetna';
  const userId = user?.id;
  const [view, setView] = useState<AccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    accountFetch<AccountView>('/api/account/me').then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else { setView(r.data!); setError(null); }
    });
    return () => { live = false; };
  }, [userId, reads]);

  if (loading) return <Spinner />;
  if (!user) return <LoginForm notice={confirmedNow ? 'Е-поштата е потврдена. Најави се.' : undefined} />;
  if (error) {
    return (
      <AccountFrame title="Мој профил">
        <Notice tone="red">{error}</Notice>
        <button type="button" onClick={() => setReads((n) => n + 1)} className="mt-3 text-sm underline underline-offset-2">Пробај повторно</button>
      </AccountFrame>
    );
  }
  // A view left over from a previous sign-in on this browser is not shown.
  if (!view || view.email !== user.email) return <Spinner />;

  const logout = (
    <button type="button" onClick={() => signOut()} className="mt-8 w-full rounded-lg border border-stone-300 py-2.5 text-sm text-stone-700 hover:bg-white">
      Одјави се
    </button>
  );

  if (view.backOffice) {
    return (
      <AccountFrame title="Профил на вработен" subtitle={view.email}>
        <Notice tone="stone">
          Со овој профил се работи во продавницата, не се купува. За поени и купони отвори профил со друга е-пошта.
        </Notice>
        <p className="mt-4 text-sm"><Link href="/admin" className="underline underline-offset-2">Кон админ</Link></p>
        {logout}
      </AccountFrame>
    );
  }

  if (!view.profile) {
    return (
      <AccountFrame title="Доврши го профилот" subtitle={view.email}>
        <ProfileForm initial={null} requireConsent onSaved={setView} />
        {logout}
      </AccountFrame>
    );
  }

  return (
    <CustomerDashboard
      view={view}
      userId={user.id}
      tab={tab}
      onTab={(t) => router.replace(t === 'pochetna' ? '/smetka' : `/smetka?tab=${t}`, { scroll: false })}
      confirmedNow={confirmedNow}
      onSaved={setView}
      onSignOut={() => signOut()}
    />
  );
}
