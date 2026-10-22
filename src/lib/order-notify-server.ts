import type { SupabaseClient } from '@supabase/supabase-js';
import { emailConfigured, sendEmail } from '@/lib/email/brevo';
import { newOrderEmail, type NewOrderMail } from '@/lib/email/templates';
import { fetchStoreSettings } from '@/lib/store-settings';

/**
 * The e-mail to the shop for a new order (Task 14.2). Server only: it reads the
 * addresses with the service role and sends through Brevo.
 *
 * Never throws and never holds up an order: the order route calls it after the
 * response has gone (`after()`), and whatever fails is only reported back for
 * the log. One e-mail per address, so one bad address does not stop the rest.
 */
export interface OrderNotifyResult {
  sent: string[];
  failed: string[];
  /** Why nothing was tried: no address set, migration 020 not run, Brevo not configured. */
  skipped?: string;
}

export async function notifyShopOfOrder(sb: SupabaseClient, order: NewOrderMail): Promise<OrderNotifyResult> {
  try {
    const read = await fetchStoreSettings(sb);
    const to = read.settings.orderNotifyEmails;
    if (!to.length) {
      return { sent: [], failed: [], skipped: read.missingTable ? 'миграцијата 020 не е пуштена' : read.error ? `поставките не се прочитаа: ${read.error}` : 'нема поставена адреса' };
    }
    if (!emailConfigured()) return { sent: [], failed: [], skipped: 'BREVO_API_KEY не е поставен' };

    const mail = newOrderEmail(order);
    const results = await Promise.all(
      to.map(async (email) => ({ email, r: await sendEmail({ to: { email }, ...mail, tag: order.test ? 'order_test' : 'order_new' }) }))
    );
    return {
      sent: results.filter((x) => !x.r.error).map((x) => x.email),
      failed: results.filter((x) => x.r.error).map((x) => `${x.email}: ${x.r.error}`),
    };
  } catch (e) {
    return { sent: [], failed: [(e as Error).message] };
  }
}
