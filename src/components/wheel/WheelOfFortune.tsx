'use client';

/**
 * The wheel itself (Task 13.10): equal slices, the pointer at the top. It only
 * ever turns to a result the server has already decided and given: the page
 * computes the turn when the prize arrives (`turnTo`) and the wheel animates
 * to it. Equal slices on purpose: the chances are printed beside the wheel and
 * on the rules page, not drawn as slice sizes that would make a 1% prize
 * invisible.
 */

import { useTranslation } from '@/lib/i18n';
import type { PublicPrize } from '@/lib/wheel';

const R = 140;
const FILLS = ['#1c1917', '#fef3c7', '#ffffff'];
const TEXT = ['#ffffff', '#1c1917', '#1c1917'];
export const SPIN_MS = 4800;

function point(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

/** Two short lines rather than one long one for a label like "Бесплатна достава". */
function lines(label: string): string[] {
  if (label.length <= 10) return [label];
  const words = label.split(' ');
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

/** Colour of slice i, never the same as the slice next to it, the last and the first included. */
function shade(i: number, n: number): number {
  const k = i % FILLS.length;
  return i === n - 1 && n > 1 && k === 0 ? 1 : k;
}

/**
 * The rotation that brings slice `index` of `n` under the pointer: whole turns
 * (none when motion is reduced), then the slice, a little off its centre so
 * it does not look staged.
 */
export function turnTo(from: number, index: number, n: number, reduced: boolean): number {
  const seg = 360 / Math.max(n, 1);
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  const want = (((360 - index * seg + jitter) % 360) + 360) % 360;
  const now = ((from % 360) + 360) % 360;
  return from + (reduced ? 0 : 360 * 6) + ((want - now + 360) % 360);
}

export default function WheelOfFortune({
  prizes, rotation, animate, onStopped,
}: {
  prizes: PublicPrize[];
  rotation: number;
  /** False when the visitor's device asks for less motion: the wheel jumps. */
  animate: boolean;
  onStopped: () => void;
}) {
  const { t } = useTranslation();
  const n = Math.max(prizes.length, 1);
  const seg = 360 / n;

  return (
    <div className="relative mx-auto w-full max-w-[320px] aspect-square">
      {/* The pointer */}
      <svg viewBox="-20 -14 40 28" className="absolute left-1/2 -translate-x-1/2 -top-1 z-10 w-8 h-6" aria-hidden="true">
        <path d="M-12,-10 L12,-10 L0,12 Z" fill="#b45309" stroke="#ffffff" strokeWidth="2" />
      </svg>
      <div
        className="w-full h-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)` : 'none',
        }}
        onTransitionEnd={onStopped}
      >
        <svg
          viewBox={`${-R - 6} ${-R - 6} ${2 * R + 12} ${2 * R + 12}`}
          className="w-full h-full drop-shadow-md"
          role="img"
          aria-label={t('wheel.ariaLabel', { prizes: prizes.map((p) => p.label).join(', ') })}
        >
          <circle r={R + 4} fill="#78716c" />
          {prizes.map((p, i) => {
            const [x1, y1] = point(i * seg - seg / 2, R);
            const [x2, y2] = point(i * seg + seg / 2, R);
            const k = shade(i, n);
            const ls = lines(p.label);
            return (
              <g key={p.id}>
                <path d={`M0,0 L${x1},${y1} A${R},${R} 0 ${seg > 180 ? 1 : 0} 1 ${x2},${y2} Z`} fill={FILLS[k]} stroke="#d6d3d1" strokeWidth="1" />
                <g transform={`rotate(${i * seg})`}>
                  <text y={-R * 0.62 - (ls.length - 1) * 7} textAnchor="middle" fill={TEXT[k]} fontSize="12" fontWeight="700" fontFamily="system-ui, sans-serif">
                    {ls.map((l, j) => <tspan key={j} x="0" dy={j === 0 ? 0 : 14}>{l}</tspan>)}
                  </text>
                </g>
              </g>
            );
          })}
          <circle r="28" fill="#ffffff" stroke="#1c1917" strokeWidth="3" />
          <text y="3" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1c1917" fontFamily="system-ui, sans-serif">MARSHAL</text>
        </svg>
      </div>
    </div>
  );
}
