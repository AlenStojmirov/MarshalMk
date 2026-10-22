'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, MoreVertical, Share, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  GUIDE_DELAY_MS, GUIDE_FROM_PAGE, GUIDE_OPEN_EVENT, GUIDE_SNOOZE_DAYS, guideAllowedOn, homeScreenPlatform, type HomeScreenPlatform,
} from '@/lib/home-screen';

/** Chrome's own install dialog, offered once the page meets its install criteria. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'marshal.homeScreen.snoozedAt';
const PAGES_KEY = 'marshal.homeScreen.pages';
const STANDALONE = '(display-mode: standalone)';

const noSubscribe = () => () => {};
const subscribeStandalone = (onChange: () => void) => {
  const m = window.matchMedia(STANDALONE);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
};

/** The phone's way to the home screen, or null on a computer and once the shop is already there. */
function useGuidePlatform(): HomeScreenPlatform | null {
  const platform = useSyncExternalStore(
    noSubscribe,
    () => homeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => null
  );
  const installed = useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false
  );
  return installed ? null : platform;
}

function snoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SNOOZE_KEY));
    return at > 0 && Date.now() - at < GUIDE_SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** This visit's page views, this one included. Storage blocked: 0, and the guide waits for the footer link. */
function countPageView(): number {
  try {
    const n = Number(window.sessionStorage.getItem(PAGES_KEY) || 0) + 1;
    window.sessionStorage.setItem(PAGES_KEY, String(n));
    return n;
  } catch {
    return 0;
  }
}

const STEP_ICONS: Record<HomeScreenPlatform, LucideIcon> = { android: MoreVertical, ios: Share, inapp: MoreHorizontal };

/** A step's text with its button drawn where the text says {icon}. */
function Step({ n, text, icon: Icon }: { n: number; text: string; icon: LucideIcon }) {
  const [before, after] = text.split('{icon}');
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">{n}</span>
      <span className="text-sm text-stone-700 leading-snug">
        {before}
        {after !== undefined && (
          <>
            <Icon className="inline h-4 w-4 -mt-0.5 mx-0.5 text-stone-900" aria-hidden="true" />
            {after}
          </>
        )}
      </span>
    </li>
  );
}

/**
 * The guide to keeping the shop on the home screen (Task 14.1). On a phone, in
 * a browser, from the second page of a visit: Chrome's own dialog where it is
 * offered, else the steps for that phone. "Not now" holds for 30 days; the
 * footer link opens it any time.
 */
export default function HomeScreenGuide() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const platform = useGuidePlatform();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // our guide offers it, in place of Chrome's own bar
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setOpen(false);
    };
    const onAsk = () => setOpen(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(GUIDE_OPEN_EVENT, onAsk);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(GUIDE_OPEN_EVENT, onAsk);
    };
  }, []);

  useEffect(() => {
    if (!platform || !guideAllowedOn(pathname)) return;
    if (countPageView() < GUIDE_FROM_PAGE || snoozed()) return;
    const timer = setTimeout(() => setOpen(true), GUIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, platform]);

  if (!open || !platform || !guideAllowedOn(pathname)) return null;

  const later = () => {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // Storage blocked: it will offer itself again next visit.
    }
    setOpen(false);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null); // Chrome's dialog can be shown once
    if (outcome === 'accepted') setOpen(false);
  };

  const oneTap = platform === 'android' && prompt;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] p-3" role="dialog" aria-modal="false" aria-labelledby="home-screen-title">
      <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl shrink-0" />
          <div className="flex-1">
            <p id="home-screen-title" className="text-sm font-semibold text-stone-900">{t('homeScreen.title')}</p>
            <p className="text-xs text-stone-500 mt-0.5">{t('homeScreen.text')}</p>
          </div>
          <button type="button" onClick={later} aria-label={t('homeScreen.close')} className="p-1 -m-1 text-stone-400 hover:text-stone-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        {oneTap ? (
          <button
            type="button"
            onClick={install}
            className="mt-4 w-full rounded-lg bg-stone-900 py-3 text-xs uppercase tracking-[0.2em] text-white hover:bg-stone-800"
          >
            {t('homeScreen.add')}
          </button>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {[1, 2, 3].map((n) => (
              <Step key={n} n={n} text={t(`homeScreen.${platform}${n}`)} icon={STEP_ICONS[platform]} />
            ))}
          </ol>
        )}

        <button type="button" onClick={later} className="mt-3 w-full text-center text-xs text-stone-500 underline underline-offset-2">
          {t('homeScreen.later')}
        </button>
      </div>
    </div>
  );
}

/** The footer's way to the guide; only on a phone that does not have the shop on its home screen yet. */
export function HomeScreenGuideLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  const platform = useGuidePlatform();
  if (!platform) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(GUIDE_OPEN_EVENT))} className={className}>
      {t('homeScreen.footerLink')}
    </button>
  );
}
