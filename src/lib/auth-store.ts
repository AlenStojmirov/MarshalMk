'use client';

import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Who is signed in, for AuthContext (Task 16.11), without the Supabase client
 * on every page. supabase-js is the storefront's biggest library after React
 * (58 KB compressed, and work for a phone's CPU as it starts), and a visitor
 * who has never signed in has no use for it as a page opens. So it is fetched
 * only when it can matter:
 * - a session is stored in this browser (a signed-in customer or the back office);
 * - the address carries what a link from an e-mail brings (a confirmation, a
 *   new password), which the client reads and turns into a session;
 * - another tab signs in;
 * - something asks for it: signing in, or a page that uses Supabase itself
 *   (the account, the checkout, the back office). `src/lib/supabase.ts`
 *   announces itself here as it loads, however it was loaded.
 * Until one of these, nobody is signed in, and nothing is waiting.
 *
 * Nothing here imports the client: this file is in every page's bundle.
 */

export interface AuthSnapshot {
  user: User | null;
  loading: boolean;
}

/** As the server draws a page: nobody known yet, still looking. */
const SERVER_SNAPSHOT: AuthSnapshot = { user: null, loading: true };

let snapshot: AuthSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let started = false;
let attached = false;
let client: Promise<SupabaseClient> | null = null;

function publish(next: AuthSnapshot) {
  if (next.user === snapshot.user && next.loading === snapshot.loading) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

/** supabase-js keeps a session under `sb-{project}-auth-token` (its default key). */
const isSessionKey = (key: string | null) => !!key && key.startsWith('sb-') && key.endsWith('-auth-token');

function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) if (isSessionKey(localStorage.key(i))) return true;
  } catch { /* storage blocked: no session can be stored either */ }
  return false;
}

/** A link from a Supabase e-mail: tokens in the fragment, or a code or an error in the query. */
const addressCarriesAuth = () =>
  /[#&](access_token|refresh_token|error_description)=/.test(window.location.hash) ||
  /[?&](code|token_hash|error_description)=/.test(window.location.search);

/** The browser's Supabase client, fetched the first time it is asked for. */
export function supabaseClient(): Promise<SupabaseClient> {
  client ??= import('@/lib/supabase').then((m) => m.supabase);
  return client;
}

/**
 * Called by `src/lib/supabase.ts` as it loads. From here on the client tells
 * us of every sign-in, sign-out and refresh.
 */
export function attachAuth(supabase: SupabaseClient) {
  if (attached) return;
  attached = true;
  client ??= Promise.resolve(supabase);

  supabase.auth.getSession().then(async ({ data }) => {
    if (!data.session) {
      publish({ user: null, loading: false });
      return;
    }
    publish({ user: snapshot.user, loading: true });
    // The stored session carries the role it was issued with. Refresh once
    // on load, so a role set with `npm run user:role` applies on the next
    // visit instead of after the token expires — or after a sign-out that
    // nobody thinks to do. A refresh that fails leaves the stored session.
    const { data: fresh } = await supabase.auth.refreshSession();
    publish({ user: fresh.session?.user ?? data.session.user, loading: false });
  });

  supabase.auth.onAuthStateChange((event, session) => {
    // The first session is handled above, after the refresh — taking it here
    // would show the stale role for a moment.
    if (event === 'INITIAL_SESSION') return;
    publish({ user: session?.user ?? null, loading: false });
  });
}

function start() {
  if (started) return;
  started = true;
  if (hasStoredSession() || addressCarriesAuth()) {
    supabaseClient();
  } else if (!attached) {
    publish({ user: null, loading: false });
  }
  // Signed in in another tab: this one learns of it as it would have with the
  // client loaded (which then follows the storage itself).
  window.addEventListener('storage', (e) => {
    if (isSessionKey(e.key) && e.newValue) supabaseClient();
  });
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export const getAuthSnapshot = (): AuthSnapshot => snapshot;
export const getServerAuthSnapshot = (): AuthSnapshot => SERVER_SNAPSHOT;
