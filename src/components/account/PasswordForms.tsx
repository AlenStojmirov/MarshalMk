'use client';

/**
 * Forgotten password and the new one (Task 13.6). Supabase sends the link;
 * following it signs the customer in for a recovery, and the second form sets
 * the new password on that session.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { MIN_PASSWORD, isEmail } from '@/lib/account';
import { resetRedirect } from '@/lib/account-client';
import AccountFrame, { Field, Notice, buttonCls, inputCls } from './AccountFrame';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) { setError('Внеси ја е-поштата на профилот.'); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: resetRedirect() });
    setBusy(false);
    // The same answer whether the e-mail has a profile or not.
    if (err && /rate limit|security purposes/i.test(err.message)) { setError('Почекај малку пред да побараш нов линк.'); return; }
    setSent(true);
  };

  return (
    <AccountFrame title="Заборавена лозинка" subtitle="Ќе ти пратиме линк за нова лозинка.">
      {sent ? (
        <Notice tone="green">Ако постои профил со таа е-пошта, линкот е пратен. Провери и во „Спам“.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Е-пошта">
            <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} />
          </Field>
          {error && <Notice tone="red">{error}</Notice>}
          <button type="submit" disabled={busy} className={buttonCls}>{busy ? 'Се праќа…' : 'Прати линк'}</button>
        </form>
      )}
      <p className="mt-4 text-sm text-center"><Link href="/smetka" className="text-stone-600 underline underline-offset-2">Назад кон најава</Link></p>
    </AccountFrame>
  );
}

export function NewPasswordForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(`Лозинката треба да има најмалку ${MIN_PASSWORD} знаци.`); return; }
    if (password !== again) { setError('Двете лозинки не се исти.'); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(/different from the old/i.test(err.message) ? 'Новата лозинка треба да е различна од старата.' : 'Лозинката не е сменета. Побарај нов линк.');
      return;
    }
    router.push('/smetka');
  };

  if (loading) return <AccountFrame title="Нова лозинка"><p className="text-sm text-stone-500">Се вчитува…</p></AccountFrame>;
  if (!user) {
    return (
      <AccountFrame title="Нова лозинка">
        <Notice tone="amber">Линкот е истечен или веќе искористен.</Notice>
        <p className="mt-4 text-sm"><Link href="/smetka/zaboravena-lozinka" className="underline underline-offset-2">Побарај нов линк</Link></p>
      </AccountFrame>
    );
  }
  return (
    <AccountFrame title="Нова лозинка" subtitle={user.email}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Нова лозинка" hint={`Најмалку ${MIN_PASSWORD} знаци.`}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls()} />
        </Field>
        <Field label="Повтори ја">
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={inputCls()} />
        </Field>
        {error && <Notice tone="red">{error}</Notice>}
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? 'Се зачувува…' : 'Зачувај ја лозинката'}</button>
      </form>
    </AccountFrame>
  );
}
