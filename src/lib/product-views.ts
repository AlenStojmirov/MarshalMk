/**
 * The Supabase views products are read through, and how to tell that one is
 * not there yet. Its own file, with no client in it, so a hook on every page
 * (`useCategories`) can name them without pulling supabase-js along (16.11).
 */

/**
 * The storefront's only way to read products (Task 8.1, migration 007).
 *
 * `products_public` carries the customer-facing columns of the products a
 * customer may see; the table itself, with purchase prices and every sale, is
 * closed to the anon key. Admin screens keep reading the table.
 *
 * Until migration 007 has run the view does not exist, and the storefront falls
 * back to the table rather than going blank — it is read the old way, leak and
 * all, for exactly as long as the migration waits.
 */
export const PUBLIC_PRODUCTS = 'products_public';

/**
 * The back office reads products through `products_costed` (migration 008):
 * the row with the purchase price joined in from `product_costs`. It runs with
 * the reader's rights, so the admin gets the cost and staff get the same rows
 * with the cost empty. Before 008 has run it falls back to the table.
 */
export const COSTED_PRODUCTS = 'products_costed';

export function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}
