/**
 * Sending an e-mail through Brevo (Task 13.11). Server only: the API key never
 * leaves the server. A plain fetch, no package — the owner's network makes new
 * packages hard, and one POST is all it takes.
 *
 * The sender is the one verified in Brevo (checked 2026-10-19). The free plan
 * sends 300 a day; the daily job stays under that.
 */

export const EMAIL_SENDER = { name: 'Маршал', email: 'no-reply@marshal.mk' };
export const BREVO_DAILY_LIMIT = 300;

export interface Email {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** For Brevo's own statistics, e.g. 'points_last'. */
  tag?: string;
}

export function emailConfigured(): boolean {
  return !!process.env.BREVO_API_KEY;
}

export async function sendEmail(m: Email): Promise<{ messageId?: string; error?: string }> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { error: 'BREVO_API_KEY не е поставен.' };
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: EMAIL_SENDER,
        to: [m.to],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        ...(m.tag ? { tags: [m.tag] } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Brevo ${res.status}: ${body.message ?? 'непозната грешка'}` };
    return { messageId: body.messageId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
