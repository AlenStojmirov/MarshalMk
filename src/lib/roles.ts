import type { User } from '@supabase/supabase-js';

/**
 * Who may see what in the admin (Task 8.2).
 *
 * `admin` is the owner: every screen, every number. `staff` works the shop
 * floor: stock, products, the sales of their shift, online orders — and no
 * statistics, costs or totals.
 *
 * The role lives in `app_metadata.role`, which only the service-role key can
 * write (`npm run user:role`), so a user cannot give themselves a role by
 * editing their own profile. It rides inside the JWT, which is what lets the
 * database enforce it too (Task 8.4). This file is the screen side only: it
 * decides what is shown, not what the database will allow.
 */
export type Role = 'admin' | 'staff';

/**
 * A user without a role is staff. The safe default: forgetting to set a role
 * gives someone too little, never too much.
 */
export function roleOf(user: User | null | undefined): Role | null {
  if (!user) return null;
  return user.app_metadata?.role === 'admin' ? 'admin' : 'staff';
}

/**
 * The screens staff may open — everything else is admin-only. An allowlist on
 * purpose: a new admin page is closed to staff until someone adds it here.
 * `/admin/product` covers `/admin/product/{id}`.
 */
export const STAFF_PATHS = ['/admin', '/admin/orders', '/admin/in-store-sales', '/admin/product'] as const;

export function canAccess(role: Role | null, pathname: string): boolean {
  if (role === 'admin') return true;
  if (role !== 'staff') return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  return STAFF_PATHS.some((p) => (p === '/admin' ? path === p : path === p || path.startsWith(p + '/')));
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  staff: 'Магацин',
};
