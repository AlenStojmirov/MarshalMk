'use client';

/**
 * A guided tour: a few steps, one at a time, over the darkened page. Two use it —
 * the customer's dashboard (Task 13.13), whose steps light up the real parts of
 * the page (points, the waiting ones, coupons, the wheel, how points work,
 * orders), and the home-screen guide (14.4), whose steps point at the browser's
 * own buttons, which no page can light, and so show a picture of them instead.
 *
 * Built here rather than taken from a package (the owner's network makes new
 * packages hard): the page darkens, the step's element is scrolled into view
 * and left lit, and the explanation sits under it — at the bottom of the
 * screen on a phone, and for a step with no element. Esc closes, the arrows
 * move, focus stays in the tour, and nothing moves when the device asks for
 * less motion. A step whose element is not on the page is left out.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';

export interface TourStep {
  /** The `data-tour` value of the element to light up; without one the step stands alone. */
  target?: string;
  title: string;
  body: string;
  /** Under the text: what to look for where the tour cannot point. */
  visual?: ReactNode;
}

/** The tour's own words; the page's language (`tour.*`) unless the page passes its own. */
export interface TourLabels {
  of: (n: number, total: number) => string;
  skip: string;
  back: string;
  next: string;
  done: string;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 6;
const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

export default function Tour({ steps, onClose, labels: given }: { steps: TourStep[]; onClose: () => void; labels?: TourLabels }) {
  const { t } = useTranslation();
  const labels: TourLabels = given ?? {
    of: (n, total) => t('tour.of', { n, total }), skip: t('tour.skip'), back: t('tour.back'), next: t('tour.next'), done: t('tour.done'),
  };
  // Only the steps whose element is on the page, read once the page is drawn. The
  // tour opens in the same render as the home tab it points at — on a first visit
  // as the data arrives, from "Водич" on another tab as the tab changes — and while
  // rendering, that tab is not in the document yet. Read then, only the tabs bar
  // was there, and the tour began and ended at "Мои нарачки" (13.13b).
  const [wanted] = useState(steps);
  const [shown, setShown] = useState<TourStep[]>([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(wanted.filter((s) => !s.target || find(s.target))));
    return () => cancelAnimationFrame(frame);
  }, [wanted]);
  const [index, setIndex] = useState(0);
  const [measured, setMeasured] = useState<Box | null>(null);
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [narrow, setNarrow] = useState(() => typeof window === 'undefined' || window.innerWidth < 640);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const step = shown[index];
  const last = index === shown.length - 1;
  // The light stays where it was until the next element is measured, and glides there.
  const box = step?.target ? measured : null;

  // Bring the step's element into view, then light it up where it ended.
  useEffect(() => {
    if (!step) return;
    primary.current?.focus({ preventScroll: true });
    const el = step.target ? find(step.target) : null;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setMeasured({ top: r.top, left: r.left, width: r.width, height: r.height });
      setNarrow(window.innerWidth < 640);
    };
    const settle = setTimeout(measure, reduced ? 0 : 380);
    const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
    };
  }, [step, reduced]);

  // Keys: Esc closes, arrows move, Tab stays inside the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (last) onClose(); else setIndex((i) => i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Tab' && card.current) {
        const items = [...card.current.querySelectorAll<HTMLElement>('button')];
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at === items.length - 1 ? 0 : at + 1);
        e.preventDefault();
        items[next].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [last, onClose]);

  if (!step) return null;

  const move = reduced ? undefined : 'top 0.25s, left 0.25s, width 0.25s, height 0.25s';
  // On a wide screen the card sits under the element, or above when there is no room below.
  const below = box ? box.top + box.height + PAD + 12 : 0;
  const cardStyle: CSSProperties | undefined = narrow || !box ? undefined : {
    top: below + 200 < window.innerHeight ? below : Math.max(12, box.top - PAD - 12 - 190),
    left: Math.min(Math.max(12, box.left), window.innerWidth - 340),
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {box ? (
        <div
          className="fixed rounded-2xl pointer-events-none"
          style={{
            top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(12, 10, 9, 0.6)', transition: move,
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-stone-950/60" />
      )}
      <div
        ref={card}
        className={`fixed bg-white rounded-2xl shadow-xl p-4 ${narrow || !box ? 'inset-x-3 bottom-3 sm:mx-auto sm:max-w-md' : 'w-80'}`}
        style={cardStyle}
      >
        <p className="text-xs text-stone-500">{labels.of(index + 1, shown.length)}</p>
        <h2 id="tour-title" className="mt-0.5 font-semibold text-stone-900">{step.title}</h2>
        <p id="tour-body" className="mt-1 text-sm text-stone-700">{step.body}</p>
        {step.visual && <div className="mt-3">{step.visual}</div>}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onClose} className="text-sm text-stone-500 underline underline-offset-2 mr-auto">{labels.skip}</button>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm">{labels.back}</button>
          )}
          <button
            ref={primary}
            type="button"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold"
          >
            {last ? labels.done : labels.next}
          </button>
        </div>
      </div>
    </div>
  );
}
