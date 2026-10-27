'use client';

/**
 * Sign-up (Task 13.6). Checks the same things the server will before sending,
 * keeps the order form's anti-spam (honeypot, timing), and ends on "check
 * your e-mail" — the profile is usable once the link in it is clicked.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { POLICIES } from '@/config/policies';
import { FieldErrors, MIN_PASSWORD, RegistrationInput, validateRegistration } from '@/lib/account';
import { accountFetch, resendConfirmation } from '@/lib/account-client';
import { useTranslation } from '@/lib/i18n';
import AccountFrame, { BirthDateInput, Field, Notice, buttonCls, inputCls } from './AccountFrame';

export default function RegisterForm() {
  const { t, language } = useTranslation();
  // Where the visitor came to sign up from, for the reports (13.12): `?from=wheel` from the wheel.
  const from = useSearchParams().get('from');
  const [form, setForm] = useState<RegistrationInput>({
    email: '', password: '', firstName: '', lastName: '', phone: '', birthDate: '', marketing: false, consent: false,
  });
  const [website, setWebsite] = useState('');
  const [openedAt] = useState(() => Date.now());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);

  const set = <K extends keyof RegistrationInput>(k: K, v: RegistrationInput[K]) => {
    setForm({ ...form, [k]: v });
    if (errors[k as keyof FieldErrors]) setErrors({ ...errors, [k]: undefined });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const found = validateRegistration(form, new Date(), language);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const r = await accountFetch<{ ok: boolean; email: string }>('/api/account/register', {
      method: 'POST',
      body: JSON.stringify({ ...form, website, _t: openedAt, ...(from ? { from } : {}) }),
    });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      if (r.fields) setErrors(r.fields);
      return;
    }
    setSentTo(form.email.trim().toLowerCase());
  };

  if (sentTo) {
    return (
      <AccountFrame title={t('account.register.checkTitle')}>
        <Notice tone="green">
          <p className="flex items-start gap-2">
            <MailCheck className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{t('account.register.sentBefore')} <strong>{sentTo}</strong>{t('account.register.sentAfter')}</span>
          </p>
        </Notice>
        <p className="text-sm text-stone-600 mt-4">{t('account.register.notArrived')}</p>
        <button
          type="button"
          onClick={async () => setResent((await resendConfirmation(sentTo)) ?? t('account.register.resent'))}
          className="mt-3 text-sm font-medium text-stone-900 underline underline-offset-2"
        >
          {t('account.common.resendLink')}
        </button>
        {resent && <p className="text-sm text-stone-600 mt-2">{resent}</p>}
        <p className="mt-6 text-sm"><Link href="/account" className="underline underline-offset-2">{t('account.register.toLogin')}</Link></p>
      </AccountFrame>
    );
  }

  return (
    <AccountFrame
      title={t('account.register.title')}
      subtitle={<>{t('account.register.subtitleBefore')} <Link href="/account" className="underline underline-offset-2">{t('account.register.subtitleLink')}</Link>{t('account.register.subtitleAfter')}</>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('account.fields.firstName')} error={errors.firstName}>
            <input autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputCls(errors.firstName)} />
          </Field>
          <Field label={t('account.fields.lastName')} error={errors.lastName}>
            <input autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputCls(errors.lastName)} />
          </Field>
        </div>
        <Field label={t('account.fields.email')} error={errors.email}>
          <input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls(errors.email)} />
        </Field>
        <Field label={t('account.fields.phone')} error={errors.phone} hint={t('account.register.phoneHint')}>
          <input type="tel" autoComplete="tel" inputMode="tel" placeholder="070 123 456" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls(errors.phone)} />
        </Field>
        <Field label={t('account.fields.password')} error={errors.password} hint={t('account.fields.passwordHint', { min: MIN_PASSWORD })}>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password}
              onChange={(e) => set('password', e.target.value)} className={inputCls(errors.password) + ' pr-11'}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-stone-500" aria-label={showPassword ? t('account.register.hidePassword') : t('account.register.showPassword')}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label={t('account.register.birthDate')} error={errors.birthDate} hint={t('account.register.birthDateHint')}>
          <BirthDateInput value={form.birthDate} onChange={(v) => set('birthDate', v)} error={errors.birthDate} />
        </Field>

        {/* Honeypot: hidden from people, filled by bots. */}
        <input
          type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true"
        />

        <label className="flex items-start gap-2.5 text-sm text-stone-700">
          <input type="checkbox" checked={!!form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t('account.consent.required')}{' '}
            <Link href={POLICIES.rules.path} target="_blank" className="underline underline-offset-2">{t('account.consent.rulesLink')}</Link>
            {' · '}
            <Link href={POLICIES.privacy.path} target="_blank" className="underline underline-offset-2">{t('account.consent.privacyLink')}</Link>
          </span>
        </label>
        {errors.consent && <p className="text-xs text-red-600 -mt-2">{errors.consent}</p>}
        <label className="flex items-start gap-2.5 text-sm text-stone-700">
          <input type="checkbox" checked={form.marketing} onChange={(e) => set('marketing', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('account.consent.marketing')}</span>
        </label>

        {error && <Notice tone="red">{error}</Notice>}
        <button type="submit" disabled={busy} className={buttonCls}>{busy ? t('account.register.submitting') : t('account.register.submit')}</button>
      </form>
    </AccountFrame>
  );
}
