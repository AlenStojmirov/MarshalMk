import type { User } from '@supabase/supabase-js';

/**
 * Who may see what (Task 8.2, D-017).
 *
 * The admin area has two roles today: `admin` (the owner — every screen, every
 * number) and `staff` (the shop floor — stock, products, the sales of their
 * shift, online orders; no statistics, costs or totals). More are coming —
 * customers who sign in to see their own orders, and others — so a role is a
 * key into ROLE_PATHS, not a yes/no "is admin".
 *
 * The role lives in `app_metadata.role`, which only the service-role key can
 * write (`npm run user:role`), so nobody grants themselves one. It rides inside
 * the JWT, which lets the database enforce it too (Task 8.4). This file is the
 * screen side: it decides what is shown, not what the database allows.
 */
export const ROLES = ['admin', 'staff', 'customer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  staff: 'Магацин',
  customer: 'Купувач',
};

/**
 * The admin screens each role may open. `'*'` is all of them. An allowlist on
 * purpose: a new admin page is closed to everyone but the admin until someone
 * adds it here. `/admin/product` covers `/admin/product/{id}`.
 */
const ROLE_PATHS: Record<Role, '*' | readonly string[]> = {
  admin: '*',
  // Catalogue (9.4): staff have the garment in hand, so they fill in what it is.
  staff: ['/admin', '/admin/orders', '/admin/in-store-sales', '/admin/product', '/admin/catalog'],
  // Customer accounts will live outside /admin entirely.
  customer: [],
};

/**
 * The role a user holds, or null. A signed-in user without a known role gets
 * nothing: sign-up is open in Supabase, and anyone who creates an account must
 * land with no access at all — never as staff.
 */
export function roleOf(user: User | null | undefined): Role | null {
  const r = user?.app_metadata?.role;
  return typeof r === 'string' && (ROLES as readonly string[]).includes(r) ? (r as Role) : null;
}

export function canAccess(role: Role | null, pathname: string): boolean {
  if (!role) return false;
  const allowed = ROLE_PATHS[role];
  if (allowed === '*') return true;
  const path = pathname.replace(/\/+$/, '') || '/';
  return allowed.some((p) => (p === '/admin' ? path === p : path === p || path.startsWith(p + '/')));
}

/** May this role enter the admin area at all? */
export function isBackOffice(role: Role | null): boolean {
  return canAccess(role, '/admin');
}
