'use client';

/**
 * Pictures and text for Instagram from a campaign (D-051): the opening post,
 * a story, a card per piece, a story per piece (all at once in a .zip), and
 * the caption. Drawn in the browser like the
 * marketing pack (post-images.ts); nothing is stored. Every picture carries
 * the dates and the word "акција": an action sale's advertising has to say
 * that it is one and how long it lasts.
 */

import { useMemo, useState } from 'react';
import { Check, Copy, Download, Image as ImageIcon, Loader2, Share2 } from 'lucide-react';
import type { Product } from '@/types';
import { campaignShelf, type Campaign } from '@/lib/campaign';
import { productTitle } from '@/lib/product-display';
import {
  download, renderCampaignCard, renderCampaignCover, renderCampaignStory,
  type CampaignCardProduct,
} from '@/lib/post-images';
import { den } from '@/lib/marketing';
import { CAMPAIGN_LINK as LINK, campaignArt, hasPhoto, mkDay, storyFileName } from '@/lib/campaign-art';
import { BulkStoriesButton, useCampaignStories, type StoryJob } from '@/components/admin/CampaignStories';

const CARDS = 6;

function caption(c: Campaign, upTo: string, picks: { title: string }[]): string {
  const groups = c.headline.mk ? `${c.headline.mk}.` : '';
  return [
    `🖤 ${c.name.toUpperCase()} во Маршал!`,
    '',
    `Акциска продажба од ${mkDay(c.startsAt)} до ${mkDay(c.endsAt, true)}${upTo ? ` — ${upTo}` : ''}. ${groups}`.trim(),
    picks.length ? `🔥 Меѓу понудите: ${picks.slice(0, 3).map((p) => p.title.toLowerCase()).join(', ')}…` : '',
    '',
    `👉 Сите понуди: ${LINK}`,
    '🚚 Плаќање при достава низ цела Македонија, или подигнете во продавницата во Виница.',
    '⏳ Парчињата се ограничени — кога ќе снема, нема.',
    '',
    'Прецртаната цена е најниската цена на производот во 30-те дена пред акцијата.',
    '',
    '#маршал #виница #машкаоблека #blackfriday #акција',
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n');
}

export default function CampaignInstagram({ campaign, products }: { campaign: Campaign; products: Product[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shelf = useMemo(
    () => campaignShelf(campaign, products).filter((s) => hasPhoto(s.product)).sort((a, b) => b.cp.pct - a.cp.pct),
    [campaign, products],
  );
  const picks = shelf.map((s): CampaignCardProduct & { id: string } => ({
    id: s.product.id,
    title: productTitle(s.product, 'mk'),
    photo: s.product.imageUrl.trim(),
    price: s.cp.price,
    before: s.cp.reference,
    pct: s.cp.pct,
  }));
  const maxPct = picks.reduce((m, p) => Math.max(m, p.pct), 0);
  const art = campaignArt(campaign, maxPct);
  const stories = useCampaignStories(art, campaign.id);
  const storyJobs: StoryJob[] = shelf.map((s, i) => ({ card: picks[i], name: storyFileName(campaign.id, s.product, i + 1) }));
  const text = caption(campaign, art.upTo, picks);
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  const run = async (key: string, make: () => Promise<{ blob: Blob; name: string }[]>, share = false) => {
    setBusy(key);
    setError(null);
    try {
      const files = await make();
      if (share) {
        const asFiles = files.map((f) => new File([f.blob], f.name, { type: 'image/jpeg' }));
        if (navigator.canShare?.({ files: asFiles })) {
          await navigator.share({ files: asFiles, text });
          return;
        }
      }
      files.forEach((f) => download(f.blob, f.name));
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError((e as Error)?.message ?? 'Не успеа.');
    } finally {
      setBusy(null);
    }
  };

  const cover = async () => [{ blob: await renderCampaignCover(art, picks), name: `${campaign.id}-naslovna.jpg` }];
  const story = async () => [{ blob: await renderCampaignStory(art, picks), name: `${campaign.id}-storija.jpg` }];
  const cards = async () =>
    Promise.all(picks.slice(0, CARDS).map(async (p, i) => ({ blob: await renderCampaignCard(art, p), name: `${campaign.id}-${i + 1}.jpg` })));

  const button = (k: string, label: string, make: () => Promise<{ blob: Blob; name: string }[]>) => (
    <div key={k} className="flex gap-1">
      <button
        type="button"
        disabled={!!busy || picks.length === 0}
        onClick={() => run(k, make)}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </button>
      {canShare && (
        <button
          type="button"
          disabled={!!busy || picks.length === 0}
          onClick={() => run(k + '-share', make, true)}
          aria-label={`${label}: сподели`}
          className="rounded-lg border border-slate-300 px-3 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800">
        <ImageIcon className="h-4 w-4" /> Instagram · {campaign.name}
      </h2>
      <p className="mt-1 mb-4 max-w-3xl text-xs text-slate-500">
        Сликите се цртаат од зачуваната кампања и од производите што се на сајтот, најголемиот попуст прв
        ({picks.length} со слика). На секоја слика пишува „акција“ и датумите — рекламата мора да ги каже.
        Цената е акциската; прецртаната е најниската пред акцијата.
      </p>
      {picks.length === 0 ? (
        <p className="text-sm text-slate-500">Кампањата уште нема производи со слика на сајтот.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {button('cover', 'Насловна објава', cover)}
          {button('story', 'Сторија', story)}
          {button('cards', `Картички (${Math.min(CARDS, picks.length)})`, cards)}
          <BulkStoriesButton stories={stories} jobs={storyJobs} label="Стории по производ" />
        </div>
      )}
      {picks.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          „Стории по производ“: по една сторија за секој производ (1080×1920), сите во еден .zip. Една по една, со преглед: копчето
          „Сторија“ во листата на производи кај „Уреди“.
        </p>
      )}
      {(error || stories.error) && <p className="mt-3 text-sm text-red-700">{error || stories.error}</p>}

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Текст за објавата</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Копирано' : 'Копирај'}
          </button>
        </div>
        <textarea readOnly value={text} rows={12} className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-700" />
      </div>

      {picks.length > 0 && (
        <div className="mt-5">
          <span className="text-sm font-medium text-slate-700">Што оди на сликите</span>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            {picks.slice(0, CARDS).map((p) => (
              <li key={p.id}>
                −{p.pct}% · {p.title} · {den(p.before)} → <b>{den(p.price)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
