'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  BookOpen, ChevronLeft, ChevronRight, Copy, ExternalLink, History, Link2, MoreHorizontal, MoreVertical, Plus, Search, Share,
  Smartphone, SquarePlus, X,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import Tour, { type TourLabels, type TourStep } from '@/components/Tour';
import {
  GUIDE_DELAY_MS, GUIDE_FROM_PAGE, GUIDE_OPEN_EVENT, guideAllowedOn, homeScreenWay, type HomeScreenWay,
} from '@/lib/home-screen';

/** Chrome's own install dialog, offered once the page meets its install criteria. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type T = (key: string, params?: Record<string, string | number>) => string;

const SEEN_KEY = 'marshal.homeScreen.seenAt';
/** Before 14.4, "Not now" held the guide off for 30 days: whoever pressed it has seen it. */
const SNOOZED_KEY = 'marshal.homeScreen.snoozedAt';
const PAGES_KEY = 'marshal.homeScreen.pages';
const STANDALONE = '(display-mode: standalone)';

// Chrome's dialog, kept outside React: it can be shown once, and the tour keeps
// the steps it opened with, so its button reads the dialog from here.
let installDialog: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const setInstallDialog = (dialog: InstallPromptEvent | null) => {
  installDialog = dialog;
  installListeners.forEach((l) => l());
};
const subscribeInstall = (onChange: () => void) => {
  installListeners.add(onChange);
  return () => { installListeners.delete(onChange); };
};
const useInstallDialog = () => useSyncExternalStore(subscribeInstall, () => installDialog, () => null);

const noSubscribe = () => () => {};
const subscribeStandalone = (onChange: () => void) => {
  const m = window.matchMedia(STANDALONE);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
};

/** The phone's way to the home screen, or null on a computer and once the shop is already there. */
function useGuideWay(): HomeScreenWay | null {
  const way = useSyncExternalStore(
    noSubscribe,
    () => homeScreenWay(navigator.userAgent, navigator.maxTouchPoints),
    () => null
  );
  const installed = useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false
  );
  return installed ? null : way;
}

function seen(): boolean {
  try {
    return !!(window.localStorage.getItem(SEEN_KEY) || window.localStorage.getItem(SNOOZED_KEY));
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Storage blocked: no page count either, so the guide never opens by itself.
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

// ── Pictures of the browser ─────────────────────────────────────────────────
// The tour lights up a part of the page; the browser's own buttons are outside
// it, so each step draws them, with the one to tap lit the same way.

/** The button to tap, lit. */
function Lit({ children, text = false }: { children: ReactNode; text?: boolean }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-white text-stone-900 ring-2 ring-stone-900 ${
        text ? 'px-3 py-1 text-sm font-semibold' : 'h-9 w-9'
      }`}
    >
      <span className="absolute inset-0 rounded-full ring-2 ring-stone-900/40 motion-safe:animate-ping" />
      {children}
    </span>
  );
}

const icon = 'h-5 w-5';
const dim = `${icon} shrink-0 text-stone-400`;

/** Safari 27's page menu: three lines, the last one short, as Apple draws it. */
function PageMenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h9" />
    </svg>
  );
}

function Address({ end }: { end?: ReactNode }) {
  return (
    <span className="flex flex-1 items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-xs text-stone-500 shadow-sm">
      <span className="flex-1 text-center">marshal.mk</span>
      {end ?? <span className="h-6 w-1" />}
    </span>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return <div aria-hidden="true" className="flex items-center gap-2 rounded-xl bg-stone-100 p-2">{children}</div>;
}

/** A menu or a share sheet, its one row to tap lit. */
function Rows({ rows }: { rows: { label: string; glyph: ReactNode; lit?: boolean }[] }) {
  return (
    <div aria-hidden="true" className="space-y-1 rounded-xl bg-stone-100 p-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            r.lit ? 'bg-white font-medium text-stone-900 ring-2 ring-stone-900' : 'text-stone-400'
          }`}
        >
          {r.label}
          {r.glyph}
        </div>
      ))}
    </div>
  );
}

/** Safari's Share when the Tabs layout is Bottom or Top: a button of its own. */
function ShareShortcut({ t }: { t: T }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-xs text-stone-500">
      <span aria-hidden="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-900">
        <Share className="h-4 w-4" />
      </span>
      {t('homeScreen.safariShareShortcut')}
    </p>
  );
}

/** What it means: the shop among the phone's apps. */
function HomeScreenPicture({ t }: { t: T }) {
  return (
    <>
      <div aria-hidden="true" className="grid grid-cols-4 gap-x-3 gap-y-2 rounded-xl bg-gradient-to-b from-stone-200 to-stone-100 p-3">
        {Array.from({ length: 8 }, (_, i) =>
          i === 5 ? (
            <span key={i} className="flex flex-col items-center gap-1">
              <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl shadow ring-2 ring-stone-900" />
              <span className="text-[10px] font-medium text-stone-900">{t('homeScreen.appName')}</span>
            </span>
          ) : (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className="h-11 w-11 rounded-xl bg-white/70" />
              <span className="h-1.5 w-7 rounded-full bg-stone-300/70 mt-1" />
            </span>
          )
        )}
      </div>
      <p className="mt-2 text-xs text-stone-500">{t('homeScreen.introOnce')}</p>
    </>
  );
}

/** Chrome's own dialog in one tap; once it has been shown, the way through the menu. */
function InstallButton({ t, onAdded }: { t: T; onAdded: () => void }) {
  const dialog = useInstallDialog();
  if (!dialog) {
    return <p className="text-xs text-stone-500">{t('homeScreen.androidMenuTitle')} → {t('homeScreen.androidAddTitle')}</p>;
  }
  const add = async () => {
    setInstallDialog(null);
    await dialog.prompt();
    const { outcome } = await dialog.userChoice;
    if (outcome === 'accepted') onAdded();
  };
  return (
    <button
      type="button"
      onClick={add}
      className="w-full rounded-lg bg-stone-900 py-3 text-xs uppercase tracking-[0.2em] text-white hover:bg-stone-800"
    >
      {t('homeScreen.install')}
    </button>
  );
}

/** The sheet Safari (and Chrome) show last: the name, Open as Web App where there is one, Add. */
function AddSheet({ t, webApp }: { t: T; webApp: boolean }) {
  return (
    <div aria-hidden="true" className="rounded-xl bg-stone-100 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-stone-400">Cancel</span>
        <span className="text-xs text-stone-500">Add to Home Screen</span>
        <Lit text>Add</Lit>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-white p-2">
        <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
        <span className="text-stone-900">{t('homeScreen.appName')}</span>
      </div>
      {webApp && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-white px-3 py-2">
          <span className="text-stone-900">Open as Web App</span>
          <span className="flex h-6 w-10 items-center justify-end rounded-full bg-green-500 p-0.5">
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </div>
      )}
    </div>
  );
}

// ── The steps ───────────────────────────────────────────────────────────────
// An iPhone has no Macedonian, so its buttons are named as the phone shows them,
// in English, with the Macedonian beside.

function guideSteps(way: HomeScreenWay, t: T, oneTap: boolean, onAdded: () => void): TourStep[] {
  const step = (key: string, visual: ReactNode): TourStep => ({
    title: t(`homeScreen.${key}Title`), body: t(`homeScreen.${key}Body`), visual,
  });
  const intro = step('intro', <HomeScreenPicture t={t} />);

  const iosAdd = step('iosAdd', (
    <Rows rows={[
      { label: 'Add Bookmark', glyph: <BookOpen className={icon} /> },
      { label: 'Find on Page', glyph: <Search className={icon} /> },
      { label: 'Add to Home Screen', glyph: <SquarePlus className={icon} />, lit: true },
    ]} />
  ));
  const iosConfirm = (webApp: boolean) => step('iosConfirm', <AddSheet t={t} webApp={webApp} />);

  switch (way) {
    case 'safari-27':
      return [intro, step('safari27', (
        <>
          <Bar><Lit><PageMenuIcon /></Lit><Address /><Copy className={dim} /></Bar>
          <ShareShortcut t={t} />
        </>
      )), iosAdd, iosConfirm(true)];
    case 'safari-26':
      return [intro, step('safari26', (
        <>
          <Bar><ChevronLeft className={dim} /><Address /><Lit><MoreHorizontal className={icon} /></Lit></Bar>
          <ShareShortcut t={t} />
        </>
      )), iosAdd, iosConfirm(true)];
    case 'safari-18':
      return [intro, step('safari18', (
        <div aria-hidden="true" className="space-y-2 rounded-xl bg-stone-100 p-2">
          <div className="flex"><Address /></div>
          <div className="flex items-center justify-around">
            <ChevronLeft className={dim} /><ChevronRight className={dim} /><Lit><Share className={icon} /></Lit>
            <BookOpen className={dim} /><Copy className={dim} />
          </div>
        </div>
      )), iosAdd, iosConfirm(false)];
    case 'ios-chrome':
      return [intro, step('iosChrome', (
        <Bar><Address end={<Lit><Share className={icon} /></Lit>} /><MoreHorizontal className={dim} /></Bar>
      )), iosAdd, iosConfirm(false)];
    case 'ios-other':
      return [intro, step('iosOther', (
        <div className="flex justify-center" aria-hidden="true"><Lit text><Share className="h-4 w-4 mr-1.5" />Share</Lit></div>
      )), iosAdd, iosConfirm(false)];
    case 'inapp':
      return [intro, step('inappMenu', (
        <Bar><X className={dim} /><span className="flex-1 text-center text-xs text-stone-500">marshal.mk</span><Lit><MoreHorizontal className={icon} /></Lit></Bar>
      )), step('inappOpen', (
        <Rows rows={[
          { label: t('homeScreen.inappCopyLink'), glyph: <Link2 className={icon} /> },
          { label: t('homeScreen.inappOpen'), glyph: <ExternalLink className={icon} />, lit: true },
        ]} />
      )), step('inappThen', (
        <div aria-hidden="true" className="rounded-xl bg-stone-900 p-3 text-center">
          <span className="inline-block rounded-full px-3 py-1 text-xs text-white ring-2 ring-white">{t('homeScreen.footerLink')}</span>
        </div>
      ))];
    case 'android':
      if (oneTap) return [intro, step('install', <InstallButton t={t} onAdded={onAdded} />)];
      return [intro, step('androidMenu', (
        <Bar><Address /><Lit><MoreVertical className={icon} /></Lit></Bar>
      )), step('androidAdd', (
        <Rows rows={[
          { label: t('homeScreen.androidMenuNewTab'), glyph: <Plus className={icon} /> },
          { label: t('homeScreen.androidMenuHistory'), glyph: <History className={icon} /> },
          { label: t('homeScreen.footerLink'), glyph: <Smartphone className={icon} />, lit: true },
        ]} />
      )), step('androidConfirm', (
        <div aria-hidden="true" className="rounded-xl bg-stone-100 p-3 text-sm">
          <div className="flex items-center gap-3">
            <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-stone-900">{t('homeScreen.appName')}</span>
          </div>
          <div className="mt-3 flex justify-end gap-3">
            <span className="px-3 py-1 text-stone-400">{t('homeScreen.androidCancel')}</span>
            <Lit text>{t('homeScreen.install')}</Lit>
          </div>
        </div>
      ))];
  }
}

/**
 * The guide to keeping the shop on the home screen (Task 14.1), as a tour like
 * the dashboard's (14.4): what it means, then this phone's steps, each with a
 * picture of the browser's button to tap. On a phone, in a browser, from the
 * second page of a visit — and only once; after that, from the footer link.
 * Where Chrome offers its own dialog, one tap.
 */
export default function HomeScreenGuide() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const way = useGuideWay();
  const [open, setOpen] = useState(false);
  const canInstall = !!useInstallDialog();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // our guide offers it, in place of Chrome's own bar
      setInstallDialog(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallDialog(null);
      markSeen();
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
    if (!way || !guideAllowedOn(pathname)) return;
    if (countPageView() < GUIDE_FROM_PAGE || seen()) return;
    const timer = setTimeout(() => setOpen(true), GUIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, way]);

  if (!open || !way || !guideAllowedOn(pathname)) return null;

  const close = () => {
    markSeen();
    setOpen(false);
  };

  const labels: TourLabels = {
    of: (n, total) => t('homeScreen.stepOf', { n, total }),
    skip: t('homeScreen.skip'),
    back: t('homeScreen.back'),
    next: t('homeScreen.next'),
    done: t('homeScreen.done'),
  };

  return <Tour steps={guideSteps(way, t, canInstall, close)} onClose={close} labels={labels} />;
}

/** The footer's way to the guide; only on a phone that does not have the shop on its home screen yet. */
export function HomeScreenGuideLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  const way = useGuideWay();
  if (!way) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(GUIDE_OPEN_EVENT))} className={className}>
      {t('homeScreen.footerLink')}
    </button>
  );
}
