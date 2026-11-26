import type { CSSProperties, ReactNode } from 'react';

/** Characters narrower or wider than the rest in heavy capitals. */
const NARROW = new Set(Array.from(" IJ1.,:;!|'ЈІЇ"));
const WIDE = new Set(Array.from('MWЖШЩЮЫМ'));

/**
 * How wide the name is in em, set in heavy capitals with tight tracking: an
 * estimate on the wide side (Arial Black, the widest face a phone may pick),
 * so the line it is sized for never runs over.
 */
export function nameEm(name: string): number {
  let em = 0;
  for (const ch of Array.from(name.toUpperCase())) {
    em += ch === ' ' ? 0.34 : NARROW.has(ch) ? 0.45 : WIDE.has(ch) ? 1.0 : 0.82;
  }
  return Math.max(1, em - 0.025 * Array.from(name).length);
}

/**
 * The campaign's name in one line (D-051), as big as the box it sits in
 * allows and never bigger than `max` (one per breakpoint, as
 * `[--name-max:…]` classes). Sized by the box's width (container query
 * units, globals.css `.campaign-name`), so the server's HTML is already
 * right and nothing moves when the page's script arrives. A name too long to
 * fit even at the smallest size breaks between words, never inside one.
 * With `letters`, each letter drops in on its own (the greeting).
 */
export default function CampaignName({
  name, as: Tag = 'h2', className = '', letters = false,
}: {
  name: string;
  as?: 'h1' | 'h2';
  className?: string;
  letters?: boolean;
}) {
  const style = { '--name-em': nameEm(name).toFixed(2) } as CSSProperties;
  let content: ReactNode = name;
  if (letters) {
    const words = name.split(/\s+/).filter(Boolean);
    // Where each word starts among the letters, the space counted, so the drop runs on across words.
    const starts = words.map((_, w) => words.slice(0, w).reduce((a, x) => a + Array.from(x).length + 1, 0));
    content = words.map((word, w) => (
      <span key={w}>
        {w > 0 && ' '}
        <span className="whitespace-nowrap">
          {Array.from(word).map((ch, k) => (
            <span key={k} className="campaign-letter inline-block" style={{ animationDelay: `${120 + (starts[w] + k) * 55}ms` }}>
              {ch}
            </span>
          ))}
        </span>
      </span>
    ));
  }
  return (
    <div className="@container">
      <Tag className={`campaign-name ${className}`} style={style}>
        {content}
      </Tag>
    </div>
  );
}
