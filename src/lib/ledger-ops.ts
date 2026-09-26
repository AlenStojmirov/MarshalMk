import { supabase } from './supabase';

/**
 * The three changes the back office makes to ledger rows it has not just
 * written (Task 8.4, migration 009).
 *
 * Staff never read the ledger — its rows carry the cost (8.3) — and Postgres
 * will not let anyone delete or update a row they cannot read. So these go
 * through database functions that do exactly this and no more, for staff and
 * admin alike. Until 009 has run the functions do not exist and the old direct
 * path is used, which works for the admin.
 */

type PgErr = { code?: string; message?: string } | null;

function isMissingFunction(err: PgErr): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message ?? '');
}

/** Undo one sale from the product page. Returns whether a row was removed. */
export async function ledgerRefundOne(
  productId: string, size: string | null, unitPrice: number, day: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('ledger_refund_one', {
    p_product_id: productId, p_size: size, p_unit_price: unitPrice, p_day: day,
  });
  if (!isMissingFunction(error)) {
    if (error) throw error;
    return data === true;
  }

  let q = supabase
    .from('sales_ledger')
    .select('id')
    .eq('product_id', productId)
    .eq('unit_price', unitPrice)
    .gte('occurred_at', `${day}T00:00:00.000Z`)
    .lte('occurred_at', `${day}T23:59:59.999Z`)
    .limit(1);
  q = size === null ? q.is('size', null) : q.eq('size', size);
  const { data: rows, error: selErr } = await q;
  if (selErr) throw selErr;
  if (!rows || rows.length === 0) return false;
  const { error: delErr } = await supabase.from('sales_ledger').delete().eq('id', rows[0].id);
  if (delErr) throw delErr;
  return true;
}

/** A cancelled order takes its sales with it. */
export async function ledgerRemoveOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('ledger_remove_order', { p_order_id: orderId });
  if (!isMissingFunction(error)) {
    if (error) throw error;
    return;
  }
  const { error: delErr } = await supabase.from('sales_ledger').delete().eq('order_id', orderId);
  if (delErr) throw delErr;
}

/** An order line agreed at a different price. */
export async function ledgerRepriceOrderLine(
  orderId: string, productId: string, size: string | null, oldPrice: number, newPrice: number
): Promise<void> {
  const { error } = await supabase.rpc('ledger_reprice_order_line', {
    p_order_id: orderId, p_product_id: productId, p_size: size, p_old_price: oldPrice, p_new_price: newPrice,
  });
  if (!isMissingFunction(error)) {
    if (error) throw error;
    return;
  }
  let q = supabase
    .from('sales_ledger')
    .update({ unit_price: newPrice, unit_list_price: oldPrice })
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .eq('unit_price', oldPrice);
  q = size ? q.eq('size', size) : q.is('size', null);
  const { error: upErr } = await q;
  if (upErr) throw upErr;
}
