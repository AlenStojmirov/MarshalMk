'use client';

/**
 * The customer's pages talking to the server (Task 13.6). Every call carries
 * the session's access token; the server checks it with Supabase.
 */

import { supabase } from './supabase';
import type { FieldErrors } from './account';

export interface ApiResult<T> {
  data?: T;
  error?: string;
  fields?: FieldErrors;
  status: number;
}

export async function accountFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? 'Нешто не успеа. Пробај повторно.', fields: json.fields, status: res.status };
    return { data: json as T, status: res.status };
  } catch {
    return { error: 'Нема врска. Провери го интернетот и пробај повторно.', status: 0 };
  }
}

/** Where the confirmation and reset links bring the customer back. */
export const confirmRedirect = () => `${window.location.origin}/smetka?potvrdeno=1`;
export const resetRedirect = () => `${window.location.origin}/smetka/nova-lozinka`;

/** Supabase's sign-in errors in the customer's words. */
export function signInErrorText(message: string): { text: string; unconfirmed: boolean } {
  if (/email not confirmed/i.test(message)) {
    return { text: 'Е-поштата уште не е потврдена. Кликни на линкот што ти го пративме.', unconfirmed: true };
  }
  if (/invalid login credentials/i.test(message)) return { text: 'Погрешна е-пошта или лозинка.', unconfirmed: false };
  if (/rate limit|too many/i.test(message)) return { text: 'Премногу обиди. Пробај повторно за неколку минути.', unconfirmed: false };
  return { text: 'Најавата не успеа. Пробај повторно.', unconfirmed: false };
}

/** Send the confirmation e-mail again. */
export async function resendConfirmation(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmRedirect() } });
  if (!error) return null;
  return /rate limit|security purposes/i.test(error.message)
    ? 'Почекај малку пред да побараш нова е-пошта.'
    : 'Е-поштата не е пратена. Пробај повторно.';
}
