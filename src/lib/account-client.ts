'use client';

/**
 * The customer's pages talking to the server (Task 13.6). Every call carries
 * the session's access token; the server checks it with Supabase.
 */

import { supabase } from './supabase';
import type { FieldErrors } from './account';
import { languageHeaders, pageLanguage, translate } from './i18n/messages';

/** A text in the page's language. These functions run outside React, so they read it from the page. */
const say = (key: string) => translate(pageLanguage(), key);

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
        ...languageHeaders(),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? say('errors.generic'), fields: json.fields, status: res.status };
    return { data: json as T, status: res.status };
  } catch {
    return { error: say('errors.offline'), status: 0 };
  }
}

/** Where the confirmation and reset links bring the customer back. */
export const confirmRedirect = () => `${window.location.origin}/account?confirmed=1`;
export const resetRedirect = () => `${window.location.origin}/account/new-password`;

/** Supabase's sign-in errors in the customer's words. */
export function signInErrorText(message: string): { text: string; unconfirmed: boolean } {
  if (/email not confirmed/i.test(message)) {
    return { text: say('errors.signIn.unconfirmed'), unconfirmed: true };
  }
  if (/invalid login credentials/i.test(message)) return { text: say('errors.signIn.wrong'), unconfirmed: false };
  if (/rate limit|too many/i.test(message)) return { text: say('errors.signIn.tooMany'), unconfirmed: false };
  return { text: say('errors.signIn.failed'), unconfirmed: false };
}

/** Send the confirmation e-mail again. */
export async function resendConfirmation(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmRedirect() } });
  if (!error) return null;
  return /rate limit|security purposes/i.test(error.message)
    ? say('errors.resend.wait')
    : say('errors.resend.failed');
}
