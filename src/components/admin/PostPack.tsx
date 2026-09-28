'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { download, photoFile } from '@/lib/post-images';

/** What a post is made of: the photos in order, and the card drawn for its end. */
export interface PackSpec {
  photos: Array<{ url: string; name: string }>;
  /** The generated slide; null when the kind has none. */
  card: (() => Promise<Blob>) | null;
  cardName: string;
  aspect: 'feed' | 'story';
}

/**
 * The pictures of a post (Task 10.3): the product's photos in carousel order,
 * then the generated card, downloaded at once or handed to the phone's share
 * sheet — Instagram is posted from a phone, and sharing the files there skips
 * the gallery. The share sheet drops the caption, so it is copied first.
 */
export default function PostPack({ spec, text }: { spec: PackSpec; text: string }) {
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    if (!spec.card) return;
    spec.card()
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setCard({ url, blob });
        setCardError(null);
      })
      .catch((e: Error) => live && setCardError(e.message));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [spec]);

  const files = async (): Promise<File[]> => {
    const out: File[] = [];
    for (const [i, p] of spec.photos.entries()) {
      out.push(await photoFile(p.url, `${String(i + 1).padStart(2, '0')}-${p.name}`));
    }
    if (card) out.push(new File([card.blob], `${String(out.length + 1).padStart(2, '0')}-${spec.cardName}.jpg`, { type: 'image/jpeg' }));
    return out;
  };

  const doDownload = async () => {
    setBusy('download');
    setNote(null);
    try {
      for (const f of await files()) {
        download(f, f.name);
        // Browsers drop downloads fired in the same tick.
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  const doShare = async () => {
    setBusy('share');
    setNote(null);
    try {
      const list = await files();
      if (!navigator.canShare({ files: list })) throw new Error('Овој прелистувач не може да споделува слики. Користи „Симни сè“.');
      await navigator.clipboard.writeText(text).catch(() => undefined);
      await navigator.share({ files: list });
      setNote('Текстот е копиран: залепи го како опис на објавата.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const total = spec.photos.length + (spec.card ? 1 : 0);
  if (total === 0) return null;
  const ratio = spec.aspect === 'story' ? 'aspect-[9/16]' : 'aspect-[4/5]';

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-slate-600 mb-1.5">
        Слики за објавата, по ред ({total})
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {spec.photos.map((p, i) => (
          <div key={p.url} className={`relative shrink-0 w-20 ${ratio} rounded-lg overflow-hidden bg-slate-100`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the original file, as it will be posted */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <span className="absolute top-1 left-1 px-1.5 rounded bg-black/60 text-white text-[10px] tabular-nums">{i + 1}</span>
          </div>
        ))}
        {spec.card && (
          <div className={`relative shrink-0 w-20 ${ratio} rounded-lg overflow-hidden bg-slate-100 ring-2 ring-pink-500 flex items-center justify-center`}>
            {card ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob drawn in this tab
              <img src={card.url} alt="Картичка со цена" className="w-full h-full object-cover" />
            ) : cardError ? (
              <span className="text-[10px] text-rose-600 p-1 text-center">{cardError}</span>
            ) : (
              <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
            )}
            <span className="absolute top-1 left-1 px-1.5 rounded bg-pink-600 text-white text-[10px] tabular-nums">{total}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          onClick={doDownload}
          disabled={busy !== null || (!!spec.card && !card && !cardError)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Симни сè
        </button>
        {canShare && (
          <button
            onClick={doShare}
            disabled={busy !== null || (!!spec.card && !card && !cardError)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Сподели (телефон)
          </button>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-slate-600">{note}</p>}
    </div>
  );
}
