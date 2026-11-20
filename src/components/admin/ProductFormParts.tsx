'use client';

/**
 * The pieces the product form is built from (owner, 2026-11-20): a section
 * card, a field with its label, a switch, the category picker and the photos.
 * Back office only, Macedonian only (D-039).
 */

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ImageOff, Plus, Star, X } from 'lucide-react';
import { ALL_CATEGORIES, CATEGORY_GROUPS, NON_MERCHANDISE } from '@/config/categories';
import { categoryName, groupName } from '@/lib/product-display';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

export function Section({
  id, n, title, aside, children,
}: { id: string; n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} data-section className="scroll-mt-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{n}</span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label, hint, children, className = '',
}: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked, onChange, label, hint, tone = 'blue',
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tone?: 'blue' | 'green' | 'red' }) {
  const on = { blue: 'bg-blue-600', green: 'bg-green-600', red: 'bg-red-600' }[tone];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
    >
      <span className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? on : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

const KNOWN_CATEGORIES = new Set<string>([...ALL_CATEGORIES, ...NON_MERCHANDISE]);
const NEW = '__new';

/**
 * The raw category (what the database, seasons and reorder count by, D-042),
 * picked from the ones the shop has under their groups instead of typed, so a
 * typo cannot open a category of its own. A new one can still be typed.
 */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [typing, setTyping] = useState(false);
  const known = KNOWN_CATEGORIES.has(value);
  return (
    <div className="space-y-2">
      <select
        value={typing ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) { setTyping(true); onChange(''); return; }
          setTyping(false);
          onChange(e.target.value);
        }}
        className={inputClass}
        required={!typing}
      >
        <option value="" disabled>Избери категорија…</option>
        {value && !known && !typing && <option value={value}>{value} (сегашна, без група)</option>}
        {CATEGORY_GROUPS.map((g) => (
          <optgroup key={g.key} label={groupName(g.key)}>
            {g.categories.map((c) => (
              <option key={c} value={c}>{categoryName(c)}</option>
            ))}
          </optgroup>
        ))}
        <optgroup label="Друго">
          {[...NON_MERCHANDISE].map((c) => <option key={c} value={c}>{categoryName(c)}</option>)}
        </optgroup>
        <option value={NEW}>+ Нова категорија…</option>
      </select>
      {typing && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="клуч на англиски, на пр. overshirts"
          className={inputClass}
          required
          autoFocus
        />
      )}
      {(typing || (value && !known)) && (
        <p className="text-xs text-amber-700">
          Категорија без група не се гледа во менито на сајтот додека не се додаде во <code>src/config/categories.ts</code>.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Hosts the site's images may come from — keep in step with `images.remotePatterns` in next.config.ts. */
const IMAGE_HOSTS = ['i.postimg.cc', 'firebasestorage.googleapis.com', 'images.unsplash.com', 'via.placeholder.com'];
const hostAllowed = (url: string) => {
  if (url.startsWith('/')) return true;
  try {
    const h = new URL(url).hostname;
    return IMAGE_HOSTS.includes(h) || h.endsWith('.googleusercontent.com');
  } catch {
    return false;
  }
};

/**
 * The product's photos as links (there is no Storage bucket: photos are links,
 * mostly i.postimg.cc, or files in the repo). The first is the main one.
 * `repoPhotos`: files in public/images/products/ that the site shows instead.
 */
export function ImagesEditor({
  urls, onChange, repoPhotos,
}: { urls: string[]; onChange: (urls: string[]) => void; repoPhotos: number }) {
  const [draft, setDraft] = useState('');
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const add = () => {
    const found = draft.split(/\s+/).map((u) => u.trim()).filter(Boolean).filter((u) => !urls.includes(u));
    if (!found.length) return;
    onChange([...urls, ...found]);
    setDraft('');
  };
  const move = (i: number, by: number) => {
    const next = [...urls];
    const [u] = next.splice(i, 1);
    next.splice(i + by, 0, u);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {repoPhotos > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Овој производ има {repoPhotos} фотографии во <code>public/images/products/</code>. Сајтот ги покажува тие; линковите подолу важат кога ќе се тргнат.
        </p>
      )}

      {urls.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {urls.map((u, i) => (
            <figure key={u} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <div className="aspect-[3/4]">
                {broken.has(u) ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-red-700">
                    <ImageOff className="h-5 w-5" /> Не се отвора
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- any link the admin pastes, before next/image would accept its host
                  <img src={u} alt="" className="h-full w-full object-cover" onError={() => setBroken((b) => new Set(b).add(u))} />
                )}
              </div>
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Главна</span>
              )}
              {!hostAllowed(u) && (
                <span className="absolute inset-x-1 bottom-9 rounded bg-red-600/90 px-1 py-0.5 text-center text-[10px] text-white">Сајтот не го прифаќа овој сервер</span>
              )}
              <figcaption className="flex items-center justify-between gap-1 border-t border-slate-200 bg-white px-1 py-1">
                <button type="button" title="Лево" aria-label="Помести лево" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowLeft className="h-3.5 w-3.5" /></button>
                {i > 0 && (
                  <button type="button" title="Направи главна" aria-label="Направи главна" onClick={() => move(i, -i)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Star className="h-3.5 w-3.5" /></button>
                )}
                <button type="button" title="Десно" aria-label="Помести десно" disabled={i === urls.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowRight className="h-3.5 w-3.5" /></button>
                <button type="button" title="Отстрани" aria-label="Отстрани" onClick={() => onChange(urls.filter((x) => x !== u))} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Уште нема фотографии.</p>
      )}

      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="https://i.postimg.cc/… (може и неколку линкови одеднаш)"
          className={inputClass}
        />
        <button type="button" onClick={add} className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          <Plus className="h-4 w-4" /> Додај
        </button>
      </div>
      <p className="text-xs text-slate-500">Првата е главната. Со стрелките се менува редот, со ѕвездата се става прва.</p>
    </div>
  );
}
