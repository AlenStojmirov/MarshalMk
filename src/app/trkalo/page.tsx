import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchLoyaltySettings } from '@/lib/loyalty-settings';
import WheelPanel from '@/components/wheel/WheelPanel';

/** The switch is read on every visit: off means this page does not exist. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Тркало на среќа',
  description: 'Заврти го тркалото на Маршал: секое вртење добива награда — поени, попуст или бесплатна достава.',
  alternates: { canonical: 'https://marshal.mk/trkalo' },
};

export default async function WheelPage() {
  const { settings } = await fetchLoyaltySettings(getSupabaseAdmin());
  if (!settings.wheelEnabled) notFound();
  return (
    <main className="bg-stone-50 min-h-[70vh]">
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-stone-900 text-center">Тркало на среќа</h1>
        <p className="text-sm text-stone-600 text-center mt-1 mb-6">Секое вртење добива награда.</p>
        <WheelPanel />
      </div>
    </main>
  );
}
