'use client';

/**
 * Share a product (owner, 2026-11-23, D-050): in Messenger or Instagram
 * messages above all — the shop sends products to people in the inbox, and a
 * customer sends them to a friend.
 *
 * "Сподели" opens the phone's own share sheet, which lists Instagram,
 * Messenger, Viber and WhatsApp as the phone has them — the only way a link
 * reaches an Instagram chat, since Instagram has no share address. Without a
 * share sheet it copies the link. The row under it goes straight to one app;
 * where an app has no address for a link (Messenger and Instagram on a
 * computer, Viber when it may not be installed) the link is copied first and
 * the person is told to paste it.
 *
 * Every link is the product's canonical address with utm_source = the channel
 * and utm_medium = share (`sharedLink`), so an order it brings says so.
 */

import { useEffect, useState } from 'react';
import { Link2, Share2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { sharedLink, type ShareChannel } from '@/lib/attribution';
import { copyText } from '@/lib/copy-text';
import { FacebookIcon, InstagramIcon, MessengerIcon, ViberIcon, WhatsAppIcon } from '@/components/BrandIcons';

type Status = 'copied' | 'paste' | 'failed' | null;

const isPhone = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export default function ShareProduct({ path, title }: { path: string; title: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>(null);
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 6000);
    return () => window.clearTimeout(id);
  }, [status]);

  /** Copy, then say so; `paste` when an app is opened next and the link waits in the clipboard. */
  const copy = (url: string, said: 'copied' | 'paste') => {
    void copyText(url).then((ok) => {
      if (!ok) setFailedUrl(url);
      setStatus(ok ? said : 'failed');
    });
  };

  const nativeShare = async (channel: ShareChannel): Promise<boolean> => {
    if (typeof navigator.share !== 'function') return false;
    const url = sharedLink(path, channel);
    try {
      await navigator.share({ title, text: title, url });
    } catch (e) {
      // Closing the sheet is an answer, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return true;
      return false;
    }
    return true;
  };

  const share = async () => {
    if (await nativeShare('share')) return;
    copy(sharedLink(path, 'link'), 'copied');
  };

  // Windows are opened in the click itself, before anything is awaited, so no
  // browser takes them for pop-ups.
  const send = (channel: Exclude<ShareChannel, 'share' | 'link'>) => {
    const url = sharedLink(path, channel);
    const enc = encodeURIComponent;
    switch (channel) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${enc(`${title}\n${url}`)}`, '_blank', 'noopener');
        return;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, '_blank', 'noopener,width=640,height=560');
        return;
      case 'viber':
        copy(url, 'paste');
        window.location.assign(`viber://forward?text=${enc(`${title} ${url}`)}`);
        return;
      case 'messenger':
        copy(url, 'paste');
        if (isPhone()) window.location.assign(`fb-messenger://share/?link=${enc(url)}`);
        else window.open('https://www.messenger.com/', '_blank', 'noopener');
        return;
      case 'instagram':
        // On a phone the share sheet is the way into an Instagram chat; elsewhere, the inbox and a pasted link.
        if (isPhone() && typeof navigator.share === 'function') {
          void nativeShare('instagram').then((ok) => { if (!ok) copy(url, 'paste'); });
          return;
        }
        copy(url, 'paste');
        window.open('https://www.instagram.com/direct/inbox/', '_blank', 'noopener');
        return;
    }
  };

  const apps: Array<{ channel: Exclude<ShareChannel, 'share' | 'link'>; name: string; Icon: (p: { className?: string }) => React.ReactNode }> = [
    { channel: 'messenger', name: 'Messenger', Icon: MessengerIcon },
    { channel: 'instagram', name: 'Instagram', Icon: InstagramIcon },
    { channel: 'viber', name: 'Viber', Icon: ViberIcon },
    { channel: 'whatsapp', name: 'WhatsApp', Icon: WhatsAppIcon },
    { channel: 'facebook', name: 'Facebook', Icon: FacebookIcon },
  ];
  const round =
    'flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:border-stone-900 hover:text-stone-900 active:bg-stone-100 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2';

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={share}
        className="w-full flex items-center justify-center gap-2.5 py-4 text-xs uppercase tracking-[0.2em] border border-stone-300 text-stone-700 hover:bg-stone-50 hover:border-stone-900 hover:text-stone-900 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 transition-all duration-200"
      >
        <Share2 className="h-4 w-4" />
        {t('product.share.button')}
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-stone-500">{t('product.share.via')}</span>
        <ul className="flex flex-wrap gap-2">
          {apps.map(({ channel, name, Icon }) => (
            <li key={channel}>
              <button
                type="button"
                onClick={() => send(channel)}
                aria-label={channel === 'facebook' ? t('product.share.onFacebook') : t('product.share.sendVia', { app: name })}
                title={name}
                className={round}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => copy(sharedLink(path, 'link'), 'copied')}
              aria-label={t('product.share.copy')}
              title={t('product.share.copy')}
              className={round}
            >
              <Link2 className="h-[18px] w-[18px]" />
            </button>
          </li>
        </ul>
      </div>

      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs text-stone-600">
        {status === 'copied' && t('product.share.copied')}
        {status === 'paste' && t('product.share.pasteHint')}
        {status === 'failed' && <>{t('product.share.copyFailed')} <span className="break-all select-all text-stone-900">{failedUrl}</span></>}
      </p>
    </div>
  );
}
