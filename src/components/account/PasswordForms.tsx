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
import { useTranslation } from '@/lib/i18n';
import AccountFrame, { Field, Notice, buttonCls, inputCls } from './AccountFrame';

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) { setError(t('account.forgot.missing')); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: resetRedirect() });
    setBusy(false);
    // The same answer whether the e-mail has a profile or not.
    if (err && /rate limit|security purposes/i.test(err.message)) { setError(t('account.forgot.wait')); return; }
    setSent(true);
  };

  return (
    <AccountFrame title={t('account.forgot.title')} subtitle={t('account.forgot.subtitle')}>
      {sent ? (
        <Notice tone="green">{t('account.forgot.sent')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t('account.fields.email')}>
            <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} />
          </Field>
          {error && <Notice tone="red">{error}</Notice>}
          <button type="submit" disabled={busy} className={buttonCls}>{busy ? t('account.forgot.sending') : t('account.forgot.submit')}</button>
        </form>
      )}
      <p className="mt-4 text-sm text-center"><Link href="/account" className="text-stone-600 underline underline-offset-2">{t('account.forgot.back')}</Link></p>
    </AccountFrame>
  );
}

export function NewPasswordForm() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(t('errors.fields.passwordShort', { min: MIN_PASSWORD })); return; }
    if (password !== again) { setError(t('account.newPassword.mismatch')); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(/different from the old/i.test(err.message) ? t('account.newPassword.sameAsOld') : t('account.newPassword.failed'));
      return;
    }
    router.push('/account');
  };

  if (loading) return <AccountFrame title={t('account.newPassword.title')}><p className="text-sm text-stone-500">{t('account.newPassword.loading')}</p></AccountFrame>;
  if (!user) {
    return (
      <AccountFrame title={t('account.newPassword.title')}>
        <Notice tone="amber">{t('account.newPassword.expired')}</Notice>
        <p className="mt-4 text-sm"><Link href="/account/forgot-password" className="underline underline-offset-2">{t('account.newPassword.askNew')}</Link></p>
      </AccountFrame>
    );
  }
  return (
    <AccountFrame title={t('account.newPassword.title')} subtitle={user.email}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('account.newPassword.label')} hint={t('account.fields.passwordHint', { min: MIN_PASSWORD })}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls()} />
        </Field>
        <Field label={t('account.newPassword.again')}>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={inputCls()} />
        </Field>
        {error && <Notice tone="red">{error}</Notice>}
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? t('account.common.saving') : t('account.newPassword.submit')}</button>
      </form>
    </AccountFrame>
  );
}
