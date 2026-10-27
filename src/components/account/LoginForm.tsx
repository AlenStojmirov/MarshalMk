'use client';

/** Sign-in for customers (Task 13.6). The same Supabase sign-in as the back office, its own words. */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { isEmail } from '@/lib/account';
import { resendConfirmation, signInErrorText } from '@/lib/account-client';
import { useTranslation } from '@/lib/i18n';
import AccountFrame, { Field, Notice, buttonCls, inputCls } from './AccountFrame';

export default function LoginForm({ notice }: { notice?: string }) {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; unconfirmed: boolean } | null>(null);
  const [resent, setResent] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(email) || !password) { setError({ text: t('account.login.missing'), unconfirmed: false }); return; }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(signInErrorText((err as Error).message ?? ''));
    }
    setBusy(false);
  };

  return (
    <AccountFrame
      title={t('account.login.title')}
      subtitle={<>{t('account.login.subtitleBefore')} <Link href="/account/register" className="underline underline-offset-2">{t('account.login.subtitleLink')}</Link> {t('account.login.subtitleAfter')}</>}
    >
      {notice && <div className="mb-4"><Notice tone="green">{notice}</Notice></div>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('account.fields.email')}>
          <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls()} />
        </Field>
        <Field label={t('account.fields.password')}>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls()} />
        </Field>
        {error && (
          <Notice tone="red">
            {error.text}
            {error.unconfirmed && (
              <button
                type="button"
                onClick={async () => setResent((await resendConfirmation(email.trim().toLowerCase())) ?? t('account.common.linkResent'))}
                className="block mt-1 font-medium underline underline-offset-2"
              >
                {t('account.common.resendLink')}
              </button>
            )}
            {resent && <span className="block mt-1">{resent}</span>}
          </Notice>
        )}
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? t('account.login.submitting') : t('account.login.submit')}</button>
      </form>
      <p className="mt-4 text-sm text-center">
        <Link href="/account/forgot-password" className="text-stone-600 underline underline-offset-2">{t('account.login.forgot')}</Link>
      </p>
    </AccountFrame>
  );
}
