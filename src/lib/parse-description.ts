/**
 * Reads the free-text descriptions into structured attributes (Task 9.3).
 *
 * Until EPIC 9 the only product copy was a fibre list typed into `description`,
 * about thirty ways: "100% - Памук", "Памук 100%", "100% PES",
 * "60% - Памук / 40% - Полиестер". Jeans carried their leg length there too
 * ("Должина: 32 - 32L") and sometimes the cut ("BAGGY - 100% Памук").
 *
 * Pure: no database. The script (`npm run attributes:parse`) and, later, the
 * product form — pasting what a label says — both use it.
 *
 * What is not understood is returned, never guessed: a composition that does
 * not add up to 100 is reported and left out, and every piece of text that did
 * not become an attribute comes back in `unparsed`.
 */

import type { FiberShare } from '@/types';
import { DETAIL_FIELDS, FITS, fiberKey, validateComposition } from './attributes';

export interface ParsedDescription {
  composition: FiberShare[];
  fit?: string;
  details: Record<string, string | boolean>;
  /** Text that did not become an attribute. Empty means everything was read. */
  unparsed: string[];
  /** The fibres were found but break the rules (sum, duplicate, unknown word). */
  compositionErrors: string[];
}

const PCT_FIRST = /^(\d+(?:[.,]\d+)?)\s*%\s*[-–:]?\s*(.+)$/u;
const PCT_LAST = /^(.+?)\s*[-–:]?\s*(\d+(?:[.,]\d+)?)\s*%$/u;
const LEG_LENGTH = /^должина\s*:?\s*(\d{2})(?:\s*[-–]\s*\d{2}\s*l)?$/iu;
const REVERSIBLE = /со\s+две\s+лица|двостран|reversible/iu;

/** Words for a cut, as typed; FITS keys and Macedonian labels both count. */
const FIT_BY_WORD = new Map<string, string>(
  Object.entries(FITS).flatMap(([key, f]) => [[key, key], [f.mk, key]] as Array<[string, string]>)
);

const toNumber = (s: string) => Number(s.replace(',', '.'));

function readFiber(segment: string): FiberShare | null {
  const m = PCT_FIRST.exec(segment) ?? null;
  if (m) {
    const fiber = fiberKey(m[2]);
    return fiber ? { fiber, pct: toNumber(m[1]) } : null;
  }
  const n = PCT_LAST.exec(segment);
  if (n) {
    const fiber = fiberKey(n[1]);
    return fiber ? { fiber, pct: toNumber(n[2]) } : null;
  }
  return null;
}

export function parseDescription(text: string | null | undefined): ParsedDescription {
  const out: ParsedDescription = { composition: [], details: {}, unparsed: [], compositionErrors: [] };
  if (!text?.trim()) return out;

  // "BAGGY - 100% Памук" carries two things in one segment: split a leading
  // cut word off before reading the rest.
  const segments = text
    .split(/[/\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      const m = /^([\p{L}]+)\s+[-–]\s+(.+)$/u.exec(s);
      return m && FIT_BY_WORD.has(m[1].toLowerCase()) ? [m[1], m[2]] : [s];
    });

  for (const segment of segments) {
    const fiber = readFiber(segment);
    if (fiber) {
      out.composition.push(fiber);
      continue;
    }
    const fit = FIT_BY_WORD.get(segment.toLowerCase());
    if (fit) {
      out.fit = fit;
      continue;
    }
    const leg = LEG_LENGTH.exec(segment);
    if (leg && DETAIL_FIELDS.legLength.options?.[`${leg[1]}L`]) {
      out.details.legLength = `${leg[1]}L`;
      continue;
    }
    if (REVERSIBLE.test(segment)) {
      out.details.reversible = true;
      // "Елек со две лица": the noun is the category, already known.
      continue;
    }
    out.unparsed.push(segment);
  }

  out.compositionErrors = validateComposition(out.composition);
  if (out.compositionErrors.length) out.composition = [];
  return out;
}
