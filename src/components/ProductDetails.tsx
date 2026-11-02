'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Product } from '@/types';
import { COLORS, DETAIL_FIELDS, FITS, careKeys, formatComposition, isStretch } from '@/lib/attributes';
import type { ProductFacts } from '@/lib/product-facts';
import { useTranslation } from '@/lib/i18n';

const cap = (s: string) => (s ? s[0].toLocaleUpperCase('mk') + s.slice(1) : s);

/** Yes/no details: said as a feature ("Со подлога"), not as "Подлога: да". */
const FLAGS = ['lining', 'hood', 'waterproof', 'reversible'];
/** Said on a row of its own at the end. */
const LAST = new Set(['origin']);

/** One fold of the product page: details, size and fit, care (Task 9.9). */
export function Fold({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
      className="group border-t border-stone-200 scroll-mt-24"
    >
      <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs uppercase tracking-[0.15em] text-stone-900 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-5 text-sm text-stone-600 leading-relaxed">{children}</div>
    </details>
  );
}

/**
 * What the garment is: material, cut, colour, the details its category has,
 * where it was made. Nothing for a product without attributes, so it looks as
 * it did before 9.9. The supplier's brand is never shown.
 */
export function ProductDetailsFold({ product, facts }: { product: Product; facts: ProductFacts }) {
  const { t, language } = useTranslation();
  const lang = language === 'en' ? 'en' : 'mk';
  const a = product.attributes;

  const rows: Array<{ label: string; value: ReactNode }> = [];
  if (facts.composition.length) {
    const stretch = isStretch(facts.composition) ? ` · ${t('product.details.stretch')}` : '';
    rows.push({ label: t('product.details.material'), value: formatComposition(facts.composition, lang) + stretch });
  }
  if (facts.fit && FITS[facts.fit]) rows.push({ label: t('product.details.fit'), value: cap(FITS[facts.fit][lang]) });
  const color = a?.color ? COLORS[a.color] : undefined;
  if (color) {
    rows.push({
      label: t('product.details.color'),
      value: (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full border border-stone-300"
            style={{ backgroundColor: color.hex }}
          />
          {cap(color[lang])}
        </span>
      ),
    });
  } else if (product.color) {
    rows.push({ label: t('product.details.color'), value: product.color });
  }
  if (a?.pattern && a.pattern !== 'solid') {
    rows.push({ label: t('product.details.pattern'), value: t(`attributes.pattern.${a.pattern}`) });
  }

  // The category's own fields, in the vocabulary's order; a value the
  // translations do not know is left out rather than shown as a key.
  const known = (key: string) => {
    const s = t(key);
    return s === key ? null : s;
  };
  const flags: string[] = [];
  for (const key of Object.keys(DETAIL_FIELDS)) {
    const v = facts.details[key];
    if (v === undefined || v === false || v === '' || LAST.has(key)) continue;
    if (FLAGS.includes(key)) {
      const flag = v === true ? known(`attributes.flag.${key}`) : null;
      if (flag) flags.push(flag);
      continue;
    }
    const label = known(`attributes.detail.${key}`);
    const value = key === 'legLength' ? String(v) : known(`attributes.option.${key}.${String(v)}`);
    if (label && value) rows.push({ label, value });
  }
  const origin = typeof facts.details.origin === 'string' ? known(`attributes.origin.${facts.details.origin}`) : null;
  if (origin) rows.push({ label: t('product.details.origin'), value: origin });

  if (rows.length === 0 && flags.length === 0) return null;

  return (
    <Fold title={t('product.details.title')} open>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-stone-400">{r.label}</dt>
            <dd className="text-stone-800">{r.value}</dd>
          </div>
        ))}
      </dl>
      {flags.length > 0 && <p className="mt-3 text-stone-800">{flags.join(' · ')}</p>}
    </Fold>
  );
}

/** Care from the fibres — general advice, the sewn-in label comes first. */
export function CareFold({ facts }: { facts: ProductFacts }) {
  const { t } = useTranslation();
  const keys = careKeys(facts.composition);
  if (keys.length === 0) return null;
  return (
    <Fold title={t('product.details.careTitle')}>
      <ul className="list-disc pl-5 space-y-1">
        {keys.map((k) => (
          <li key={k}>{t(`attributes.care.${k}`)}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-stone-400">{t('product.details.careNote')}</p>
    </Fold>
  );
}
