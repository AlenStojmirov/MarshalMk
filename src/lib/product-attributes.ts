/**
 * Reading and writing `product_attributes` from the back office (Task 9.4).
 *
 * Takes the Supabase client as an argument, like stock.ts, so the same calls
 * work from the browser (the signed-in admin or staff, RLS from migration 010)
 * and from scripts (service role).
 *
 * Attributes are written apart from the product row, and never through it:
 * a form that saves composition or colour touches nothing on `products`, so it
 * can never rewrite a shelf quantity (D-013).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductAttributes } from '@/types';
import { PRODUCT_ATTRIBUTES, attributesToRow, rowToAttributes, type AttributesPatch, type ProductAttributesRow } from './db-mappers';

export interface AttributesRead<T> {
  data: T;
  /** Migration 010 has not run: show the screen, say so, write nothing. */
  missingTable: boolean;
  error?: string;
}

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

export function emptyAttributes(productId: string): ProductAttributes {
  return { productId, composition: [], details: {}, measurements: {} };
}

export async function fetchAttributes(sb: SupabaseClient, productId: string): Promise<AttributesRead<ProductAttributes | null>> {
  const { data, error } = await sb.from(PRODUCT_ATTRIBUTES).select('*').eq('product_id', productId).maybeSingle();
  if (error) return { data: null, missingTable: isMissingRelation(error), error: error.message };
  return { data: data ? rowToAttributes(data as ProductAttributesRow) : null, missingTable: false };
}

export async function fetchAllAttributes(sb: SupabaseClient): Promise<AttributesRead<Map<string, ProductAttributes>>> {
  const map = new Map<string, ProductAttributes>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(PRODUCT_ATTRIBUTES).select('*').range(from, from + 999);
    if (error) return { data: map, missingTable: isMissingRelation(error), error: error.message };
    for (const row of (data ?? []) as ProductAttributesRow[]) map.set(row.product_id, rowToAttributes(row));
    if ((data ?? []).length < 1000) break;
  }
  return { data: map, missingTable: false };
}

/**
 * Upsert only the fields given. On a new row the others take their defaults;
 * on an existing one they are left as they are — so the catalogue screen can
 * save a colour without touching a composition someone else is typing.
 * Returns the stored row, or an error message.
 */
export async function saveAttributes(
  sb: SupabaseClient,
  productId: string,
  patch: Omit<AttributesPatch, 'productId'>,
): Promise<{ data?: ProductAttributes; error?: string }> {
  const row = { ...attributesToRow(patch), product_id: productId };
  const { data, error } = await sb
    .from(PRODUCT_ATTRIBUTES)
    .upsert(row, { onConflict: 'product_id' })
    .select('*')
    .single();
  if (error) {
    if (isMissingRelation(error)) return { error: 'Табелата за атрибути уште не постои (миграција 010).' };
    if (/composition_valid/.test(error.message)) return { error: 'Составот мора да збира точно 100%, секое влакно еднаш.' };
    if (/measurements_valid/.test(error.message)) return { error: 'Мерките мора да се во cm, меѓу 0,1 и 300.' };
    return { error: error.message };
  }
  return { data: rowToAttributes(data as ProductAttributesRow) };
}
