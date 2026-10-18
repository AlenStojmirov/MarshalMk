'use client';

/**
 * /smetka (Task 13.6): sign-in when signed out, and the customer's own page
 * when signed in. The points, coupons and orders join it in 13.9.
 *
 * Coming back from the confirmation e-mail, Supabase signs the customer in
 * from the link (`?potvrdeno=1`); the first read of the profile then hands
 * out the welcome coupon and bonus, once (server side).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { POLICIES } from '@/config/policies';
import type { AccountView } from '@/lib/account';
import { accountFetch, resendConfirmation } from '@/lib/account-client';
import AccountFrame, { Notice } from './AccountFrame';
import LoginForm from './LoginForm';
import ProfileForm from './ProfileForm';

function Spinner() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin h-10 w-10 border-4 border-stone-900 border-t-transparent rounded-full" />
    </div>
  );
}

export default function AccountHome() {
  const { user, loading, signOut } = useAuth();
  const confirmedNow = useSearchParams().get('potvrdeno') === '1';
  const userId = user?.id;
  const [view, setView] = useState<AccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const [resent, setResent] = useState<string | null>(null);

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
    <AccountFrame title={`Здраво, ${view.profile.firstName}`} subtitle={view.email}>
      <div className="space-y-3 mb-6">
        {confirmedNow && view.emailConfirmed && <Notice tone="green">Е-поштата е потврдена. Добредојде!</Notice>}
        {!view.emailConfirmed && (
          <Notice tone="amber">
            Потврди ја е-поштата: кликни на линкот што ти го пративме. Дотогаш нема поени ни купони.
            <button
              type="button"
              onClick={async () => setResent((await resendConfirmation(view.email)) ?? 'Линкот е пратен повторно.')}
              className="block mt-1 font-medium underline underline-offset-2"
            >
              Прати го линкот повторно
            </button>
            {resent && <span className="block mt-1">{resent}</span>}
          </Notice>
        )}
      </div>

      <section className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-semibold text-stone-900 mb-3">Мои податоци</h2>
        <ProfileForm initial={view.profile} requireConsent={false} onSaved={setView} />
      </section>

      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {Object.values(POLICIES).filter((p) => p.live).map((p) => (
          <Link key={p.path} href={p.path} className="text-stone-600 underline underline-offset-2">{p.title}</Link>
        ))}
      </nav>
      {logout}
    </AccountFrame>
  );
}
