import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The shop's own settings (Task 14.2, migration 020), as opposed to the loyalty
 * programme's (014). One row of jsonb read over the defaults below, so a later
 * setting needs no migration. The admin reads and writes it from /admin/settings;
 * the order route reads it with the service role.
 */

export const STORE_SETTINGS = 'store_settings';

export interface StoreSettings {
  /** Where an e-mail goes for every new order. Empty: none is sent. */
  orderNotifyEmails: string[];
}

export const STORE_DEFAULTS: StoreSettings = {
  orderNotifyEmails: [],
};

/** Enough for the owner and a couple of staff; each new order is one e-mail per address against Brevo's 300 a day. */
export const MAX_ORDER_NOTIFY_EMAILS = 5;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(v: string): boolean {
  return EMAIL.test(v);
}

/** Trimmed, lower case, valid, no repeats, at most the limit. */
export function cleanEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const v of list) {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (isEmail(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, MAX_ORDER_NOTIFY_EMAILS);
}

export function parseStoreSettings(raw: unknown): StoreSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    orderNotifyEmails: 'orderNotifyEmails' in src ? cleanEmails(src.orderNotifyEmails) : STORE_DEFAULTS.orderNotifyEmails,
  };
}

export interface StoreSettingsRead {
  settings: StoreSettings;
  /** Migration 020 has not run: the defaults are in force and nothing can be saved. */
  missingTable: boolean;
  updatedAt?: Date;
  error?: string;
}

function isMissingRelation(err: { code?: string; message?: string }): boolean {
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

/** Never throws: whatever goes wrong, the answer is the defaults — no e-mail — and the error says why. */
export async function fetchStoreSettings(sb: SupabaseClient): Promise<StoreSettingsRead> {
  const { data, error } = await sb.from(STORE_SETTINGS).select('settings, updated_at').eq('id', true).maybeSingle();
  if (error) return { settings: { ...STORE_DEFAULTS }, missingTable: isMissingRelation(error), error: error.message };
  if (!data) return { settings: { ...STORE_DEFAULTS }, missingTable: false };
  return {
    settings: parseStoreSettings(data.settings),
    missingTable: false,
    updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
  };
}

export async function saveStoreSettings(sb: SupabaseClient, s: StoreSettings): Promise<{ error?: string }> {
  const bad = s.orderNotifyEmails.filter((e) => !isEmail(e.trim()));
  if (bad.length) return { error: `Неважечка адреса: ${bad.join(', ')}` };
  if (s.orderNotifyEmails.length > MAX_ORDER_NOTIFY_EMAILS) return { error: `Најмногу ${MAX_ORDER_NOTIFY_EMAILS} адреси.` };
  const settings: StoreSettings = { orderNotifyEmails: cleanEmails(s.orderNotifyEmails) };
  const { error } = await sb.from(STORE_SETTINGS).upsert({ id: true, settings }, { onConflict: 'id' });
  return error ? { error: error.message } : {};
}
