'use client';

/**
 * The customer's own details (Task 13.6). Also makes the profile for an
 * account that has none yet — then the rules and privacy must be accepted.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CONSENT, POLICIES } from '@/config/policies';
import { AccountView, CustomerProfile, FieldErrors, ProfileInput, validateProfile } from '@/lib/account';
import { accountFetch } from '@/lib/account-client';
import { BirthDateInput, Field, Notice, buttonCls, inputCls } from './AccountFrame';

export default function ProfileForm({
  initial, requireConsent, onSaved,
}: { initial: CustomerProfile | null; requireConsent: boolean; onSaved: (v: AccountView) => void }) {
  const [form, setForm] = useState<ProfileInput>({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    phone: initial?.phone ?? '',
    birthDate: initial?.birthDate ?? '',
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
    const found = validateProfile(form, new Date(), requireConsent);
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
        <Field label="Име" error={errors.firstName}>
          <input autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputCls(errors.firstName)} />
        </Field>
        <Field label="Презиме" error={errors.lastName}>
          <input autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputCls(errors.lastName)} />
        </Field>
      </div>
      <Field
        label="Телефон"
        error={errors.phone}
        hint={initial && !initial.phoneVerified ? 'Се потврдува со првата испорачана и платена нарачка.' : undefined}
      >
        <input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls(errors.phone)} />
      </Field>
      <Field label="Датум на раѓање" error={errors.birthDate} hint="Не е задолжително. За подарок на твојот роденден.">
        <BirthDateInput value={form.birthDate} onChange={(v) => set('birthDate', v)} error={errors.birthDate} />
      </Field>
      {requireConsent && (
        <>
          <label className="flex items-start gap-2.5 text-sm text-stone-700">
            <input type="checkbox" checked={!!form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {CONSENT.required}{' '}
              <Link href={POLICIES.rules.path} target="_blank" className="underline underline-offset-2">Правила</Link>
              {' · '}
              <Link href={POLICIES.privacy.path} target="_blank" className="underline underline-offset-2">Приватност</Link>
            </span>
          </label>
          {errors.consent && <p className="text-xs text-red-600 -mt-2">{errors.consent}</p>}
        </>
      )}
      <label className="flex items-start gap-2.5 text-sm text-stone-700">
        <input type="checkbox" checked={form.marketing} onChange={(e) => set('marketing', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{CONSENT.marketing}</span>
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      {saved && <Notice tone="green">Зачувано.</Notice>}
      <button type="submit" disabled={busy} className={buttonCls}>
        {busy ? 'Се зачувува…' : requireConsent ? 'Доврши го профилот' : 'Зачувај'}
      </button>
    </form>
  );
}
