'use client';

/**
 * The customer's own details (Task 13.6). Also makes the profile for an
 * account that has none yet — then the rules and privacy must be accepted.
 */

import { useState } from 'react';
import Link from 'next/link';
import { POLICIES } from '@/config/policies';
import { AccountView, CustomerProfile, FieldErrors, ProfileInput, validateProfile } from '@/lib/account';
import { accountFetch } from '@/lib/account-client';
import { useTranslation } from '@/lib/i18n';
import { BirthDateInput, Field, Notice, buttonCls, inputCls } from './AccountFrame';

export default function ProfileForm({
  initial, requireConsent, onSaved,
}: { initial: CustomerProfile | null; requireConsent: boolean; onSaved: (v: AccountView) => void }) {
  const { t, language } = useTranslation();
  const [form, setForm] = useState<ProfileInput>({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    phone: initial?.phone ?? '',
    birthDate: initial?.birthDate ?? '',
    // Sent only once the profile can hold them (migration 021); until then the
    // fields are not shown and the server leaves the columns alone.
    ...(initial?.hasAddress ? { address: initial.address, city: initial.city } : {}),
    marketing: initial?.marketing ?? false,
    consent: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => {
    setForm({ ...form, [k]: v });
    setSaved(false);
    if (errors[k as keyof FieldErrors]) setErrors({ ...errors, [k]: undefined });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const found = validateProfile(form, new Date(), requireConsent, language);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const r = await accountFetch<AccountView>('/api/account/me', { method: 'PATCH', body: JSON.stringify(form) });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      if (r.fields) setErrors(r.fields);
      return;
    }
    setSaved(true);
    onSaved(r.data!);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('account.fields.firstName')} error={errors.firstName}>
          <input autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputCls(errors.firstName)} />
        </Field>
        <Field label={t('account.fields.lastName')} error={errors.lastName}>
          <input autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputCls(errors.lastName)} />
        </Field>
      </div>
      <Field
        label={t('account.fields.phone')}
        error={errors.phone}
        hint={initial && !initial.phoneVerified ? t('account.profile.phoneHint') : undefined}
      >
        <input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls(errors.phone)} />
      </Field>
      {form.address !== undefined && (
        <>
          <Field label={t('account.profile.address')} error={errors.address} hint={t('account.profile.addressHint')}>
            <input autoComplete="street-address" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls(errors.address)} />
          </Field>
          <Field label={t('account.fields.city')} error={errors.city}>
            <input autoComplete="address-level2" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} className={inputCls(errors.city)} />
          </Field>
        </>
      )}
      <Field label={t('account.profile.birthDate')} error={errors.birthDate} hint={t('account.profile.birthDateHint')}>
        <BirthDateInput value={form.birthDate} onChange={(v) => set('birthDate', v)} error={errors.birthDate} />
      </Field>
      {requireConsent && (
        <>
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
        </>
      )}
      <label className="flex items-start gap-2.5 text-sm text-stone-700">
        <input type="checkbox" checked={form.marketing} onChange={(e) => set('marketing', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('account.consent.marketing')}</span>
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      {saved && <Notice tone="green">{t('account.profile.saved')}</Notice>}
      <button type="submit" disabled={busy} className={buttonCls}>
        {busy ? t('account.common.saving') : requireConsent ? t('account.profile.finish') : t('account.profile.save')}
      </button>
    </form>
  );
}
