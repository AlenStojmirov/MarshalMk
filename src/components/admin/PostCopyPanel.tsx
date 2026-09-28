'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, RefreshCw, X } from 'lucide-react';
import { POST_KIND_LABEL } from '@/lib/marketing';
import { latinOutsideSizes, VARIANTS, type CopyKind, type PostCopy } from '@/lib/post-copy';

const KIND_LABEL: Record<CopyKind, string> = { ...POST_KIND_LABEL, trust: 'Доверба' };

/**
 * One post's text, ready to paste (Task 10.2). The generated version is a
 * starting point: the marketing employee picks a kind and a variant, edits in
 * place, and copies. Nothing is saved — the calendar (10.4) will keep texts.
 */
export default function PostCopyPanel({
  heading, kinds, make, onClose,
}: {
  heading: string;
  kinds: CopyKind[];
  make: (kind: CopyKind, variant: number) => PostCopy;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CopyKind>(kinds[0]);
  const [variant, setVariant] = useState(0);
  const copy = useMemo(() => make(kind, variant), [make, kind, variant]);
  // Edits belong to the kind and variant they were made on; each starts from its own text.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const key = `${kind}:${variant}`;
  const text = edits[key] ?? copy.text;
  const setText = (t: string) => setEdits((e) => ({ ...e, [key]: t }));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const latin = [...new Set(latinOutsideSizes(text))];

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Копирањето не успеа. Означи го текстот и копирај рачно.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-3">
          <h2 className="font-semibold text-slate-900 flex-1 min-w-0">{heading}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Затвори">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setVariant(0); setCopied(false); }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                kind === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
          <button
            onClick={() => { setVariant((v) => (v + 1) % VARIANTS); setCopied(false); }}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-600 hover:bg-slate-50"
            title="Друга варијанта на текстот"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Варијанта {variant + 1}/{VARIANTS}
          </button>
        </div>

        {copy.onScreen && (
          <div className="mb-3 p-3 rounded-lg bg-violet-50 border border-violet-200 text-sm">
            <p className="text-xs font-medium text-violet-800 mb-1">Текст на екран, по еден на рез</p>
            <ol className="list-decimal list-inside text-violet-900 space-y-0.5">
              {copy.onScreen.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          </div>
        )}
        {copy.idea && (
          <p className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <span className="font-medium">Идеја: </span>{copy.idea}
          </p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-[inherit] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {latin.length > 0 && (
          <p className="mt-1 text-xs text-amber-700">
            Латиница во текстот: {latin.join(', ')}. Договорот е само кирилица (големините може).
          </p>
        )}

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={doCopy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Копирано' : 'Копирај'}
          </button>
          {text !== copy.text && (
            <button onClick={() => setText(copy.text)} className="text-sm text-slate-500 hover:text-slate-700">
              Врати го предлогот
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{text.length} знаци</span>
        </div>
      </div>
    </div>
  );
}
