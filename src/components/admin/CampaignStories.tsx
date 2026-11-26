'use client';

/**
 * A story per product, in the campaign's frame (D-051): one at a time with a
 * look first, or all of them at once in a .zip (or to the phone's share
 * sheet, to save them to the gallery). Drawn in the browser, nothing stored.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { download, renderCampaignProductStory, type CampaignArt, type CampaignCardProduct } from '@/lib/post-images';
import { zipFiles } from '@/lib/zip';

export interface StoryJob {
  card: CampaignCardProduct & { id: string };
  name: string;
}

interface Preview {
  url: string;
  file: File;
  title: string;
}

const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
const never = () => () => {};
/** Whether this browser can share files: false on the server and while hydrating, so both draw the same. */
const useCanShare = () => useSyncExternalStore(never, canShareFiles, () => false);

function asFile(blob: Blob, name: string) {
  return new File([blob], name, { type: 'image/jpeg' });
}

export function useCampaignStories(art: CampaignArt, campaignId: string) {
  /** The product being drawn, or 'all'. */
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  }, []);

  const one = async (job: StoryJob) => {
    setBusy(job.card.id);
    setError(null);
    try {
      const blob = await renderCampaignProductStory(art, job.card);
      closePreview();
      setPreview({ url: URL.createObjectURL(blob), file: asFile(blob, job.name), title: job.card.title });
    } catch (e) {
      setError((e as Error)?.message ?? 'Сликата не успеа.');
    } finally {
      setBusy(null);
    }
  };

  /** One after another, so a phone does not hold fifty photos at once. */
  const all = async (jobs: StoryJob[], share = false) => {
    if (!jobs.length) return;
    setBusy('all');
    setError(null);
    setProgress({ done: 0, total: jobs.length });
    try {
      const files: File[] = [];
      for (const job of jobs) {
        files.push(asFile(await renderCampaignProductStory(art, job.card), job.name));
        setProgress({ done: files.length, total: jobs.length });
      }
      if (share && navigator.canShare?.({ files })) {
        await navigator.share({ files });
        return;
      }
      download(await zipFiles(files.map((f) => ({ name: f.name, blob: f }))), `${campaignId}-storii.zip`);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError((e as Error)?.message ?? 'Сликите не успеаја.');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return { busy, progress, preview, error, one, all, closePreview };
}

export type CampaignStories = ReturnType<typeof useCampaignStories>;

/** "Стории (N) · ZIP" and, where the browser can share files, a share button beside it. */
export function BulkStoriesButton({ stories, jobs, label }: { stories: CampaignStories; jobs: StoryJob[]; label: string }) {
  const { busy, progress } = stories;
  const share = useCanShare();
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        disabled={!!busy || jobs.length === 0}
        onClick={() => stories.all(jobs)}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy === 'all' && progress ? `${progress.done}/${progress.total}…` : `${label} (${jobs.length}) · ZIP`}
      </button>
      {share && (
        <button
          type="button"
          disabled={!!busy || jobs.length === 0}
          onClick={() => stories.all(jobs, true)}
          aria-label={`${label}: сподели (зачувај во галерија)`}
          title="Сподели: на телефон „Зачувај слики“ ги става во галеријата"
          className="rounded-lg border border-slate-300 px-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

/** The story just drawn, to look at before it is saved or shared. */
export function StoryPreview({ stories }: { stories: CampaignStories }) {
  const { preview, closePreview } = stories;
  const canShare = useCanShare();

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, closePreview]);

  if (!preview) return null;
  const share = canShare && navigator.canShare({ files: [preview.file] });

  return (
    <div role="dialog" aria-modal="true" aria-label={`Сторија: ${preview.title}`} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={closePreview} aria-hidden />
      <div className="relative flex max-h-full w-full max-w-sm flex-col rounded-xl bg-white p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-800">{preview.title}</span>
          <button type="button" onClick={closePreview} aria-label="Затвори" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob drawn in this browser, nothing to optimise */}
        <img src={preview.url} alt="" className="mx-auto max-h-[70vh] w-auto rounded border border-slate-200" />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => download(preview.file, preview.file.name)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Download className="h-4 w-4" /> Преземи
          </button>
          {share && (
            <button
              type="button"
              onClick={() => navigator.share({ files: [preview.file] }).catch(() => {})}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Share2 className="h-4 w-4" /> Сподели
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
