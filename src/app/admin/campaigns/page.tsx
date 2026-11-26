'use client';

/**
 * Campaigns — Black Friday and the like (D-051). Admin only: the route is in
 * no other role's ROLE_PATHS, and the settings row is the admin's (020).
 *
 * A campaign is its dates, its words, and a price for each product in it.
 * Nothing is written to the products: the shop sells at the campaign price
 * from the start to the end on its own, and at its own price again after.
 * The prices are suggested by the discount rule (D-027) and the floor
 * (cost + 15%), and every one can be changed here before saving.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProducts } from '@/hooks/useProducts';
import { fetchStoreSettings, saveStoreSettings, type StoreSettingsRead } from '@/lib/store-settings';
import { campaignPhase, shopDate, type Campaign, type CampaignPhase } from '@/lib/campaign';
import { blackFridayDay, newBlackFriday } from '@/lib/campaign-suggest';
import CampaignEditor, { onShelf } from '@/components/admin/CampaignEditor';
import CampaignInstagram from '@/components/admin/CampaignInstagram';

const PHASE_LABEL: Record<CampaignPhase, string> = {
  upcoming: 'Закажана',
  teaser: 'Одбројува',
  live: 'Трае сега',
  over: 'Заврши',
};
const PHASE_TONE: Record<CampaignPhase, string> = {
  upcoming: 'bg-slate-100 text-slate-700',
  teaser: 'bg-amber-100 text-amber-800',
  live: 'bg-green-100 text-green-800',
  over: 'bg-slate-100 text-slate-500',
};

/** The Black Friday a new campaign is for: this year's until it has passed, then next year's. */
function nextBlackFridayYear(now = new Date()): number {
  const { y, m, d } = blackFridayDay(now.getFullYear());
  return now > new Date(y, m - 1, d + 3) ? y + 1 : y;
}

export default function CampaignsPage() {
  const { products, loading } = useProducts();
  const [read, setRead] = useState<StoreSettingsRead | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [instagram, setInstagram] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStoreSettings(supabase).then(setRead);
  }, []);

  if (loading || !read) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const campaigns = read.settings.campaigns;
  const year = nextBlackFridayYear();
  const nextId = `black-friday-${year}`;
  const hasNext = campaigns.some((c) => c.id === nextId);
  const shownFor = instagram ? campaigns.find((c) => c.id === instagram) : null;

  const remove = async (id: string) => {
    setError(null);
    const all = campaigns.filter((c) => c.id !== id);
    const r = await saveStoreSettings(supabase, { campaigns: all });
    setRemoving(null);
    if (r.error) { setError(r.error); return; }
    setRead({ ...read, settings: { ...read.settings, campaigns: all } });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Кампањи · Black Friday</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-3xl">
          Цените на акцијата важат само од почетокот до крајот, сами — ништо не се враќа рачно, а цената на производот
          не се менува. На сајтот: црна лента со одбројување на секоја страна, анимација при влез, голем дел на почетната и
          страница <Link href="/black-friday" className="underline" target="_blank">/black-friday</Link>. Важи и на каса во дуќанот (продажба со QR).
        </p>

        {read.missingTable && (
          <p className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">Табелата за поставки ја нема (миграција 020): кампања не може да се зачува.</p>
        )}
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {editing ? (
          <CampaignEditor
            key={editing.id}
            initial={editing}
            isNew={!campaigns.some((c) => c.id === editing.id)}
            products={products}
            others={campaigns.filter((c) => c.id !== editing.id)}
            onSaved={(all) => setRead({ ...read, settings: { ...read.settings, campaigns: all } })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            {!hasNext && (
              <button
                type="button"
                onClick={() => setEditing(newBlackFriday(year, campaigns[0]))}
                className="mb-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
              >
                <Plus className="h-4 w-4" /> Нов Black Friday {year}
              </button>
            )}

            <div className="space-y-3">
              {campaigns.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  Уште нема кампања. „Нов Black Friday“ ги пополнува датумите (петок–недела) и текстот; цените ги предлага правилото.
                </p>
              )}
              {campaigns.map((c) => {
                const phase = campaignPhase(c);
                const live = c.items.filter((i) => { const p = products.find((x) => x.id === i.id); return p && onShelf(p); }).length;
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex-1 min-w-[14rem]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{c.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PHASE_TONE[phase]}`}>{PHASE_LABEL[phase]}</span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {shopDate('mk', c.startsAt)} – {shopDate('mk', c.endsAt, true)} · {c.items.length} производи ({live} на полица) · <span className="font-mono text-xs">{c.id}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {phase !== 'over' && (
                        <button type="button" onClick={() => setEditing(c)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Уреди</button>
                      )}
                      <button type="button" onClick={() => setInstagram(instagram === c.id ? null : c.id)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Instagram
                      </button>
                      {phase === 'over' && !hasNext && (
                        <button type="button" onClick={() => setEditing(newBlackFriday(year, c))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Copy className="h-4 w-4" /> Истото за {year}
                        </button>
                      )}
                      {removing === c.id ? (
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span className="text-red-700">Да се избрише?</span>
                          <button type="button" onClick={() => remove(c.id)} className="rounded-lg bg-red-600 px-3 py-2 text-white">Да</button>
                          <button type="button" onClick={() => setRemoving(null)} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Не</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setRemoving(c.id)} aria-label="Избриши" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {shownFor && <CampaignInstagram campaign={shownFor} products={products} />}
          </>
        )}
      </div>
    </div>
  );
}
