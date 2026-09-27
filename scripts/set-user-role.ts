/**
 * Give an admin user a role (Task 8.2).
 *
 * The role sits in app_metadata, which only the service-role key can write —
 * so this runs here, never from the browser.
 *
 *   npm run user:role                     list users and their roles
 *   npm run user:role <email> admin       make someone the owner
 *   npm run user:role <email> staff       warehouse: no statistics, no costs
 *   npm run user:role <email> marketing   posts: reads the catalogue, no costs (D-021)
 *   npm run user:role <email> none        take the role away: no access
 *
 * A user without a role has no access to the admin at all (D-017).
 *
 * The change reaches the app at the user's next sign-in.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { roleOf, ROLE_LABEL, ROLES, Role } from '../src/lib/roles';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const users = data.users;

  const [email, wanted] = process.argv.slice(2);
  if (!email) {
    console.log('КОРИСНИЦИ');
    for (const u of users) {
      const r = roleOf(u);
      console.log('  ' + (u.email ?? u.id).padEnd(36) + (r ? ROLE_LABEL[r] : '— без улога, нема пристап'));
    }
    return;
  }

  if (wanted !== 'none' && !(ROLES as readonly string[]).includes(wanted)) {
    throw new Error('Улогата е една од: ' + ROLES.join(', ') + ', none.');
  }
  const role: Role | null = wanted === 'none' ? null : (wanted as Role);
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Нема корисник со е-пошта ' + email);

  if (role !== 'admin' && roleOf(user) === 'admin') {
    const admins = users.filter((u) => roleOf(u) === 'admin');
    if (admins.length === 1) throw new Error('Ова е единствениот админ — прво направи друг админ.');
  }

  const { error: upErr } = await sb.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role },
  });
  if (upErr) throw upErr;
  console.log(email + ' → ' + (role ? ROLE_LABEL[role] : 'без улога') + '. Важи од следното отворање на админот.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('\nFailed:', err.message ?? err); process.exit(1); });
