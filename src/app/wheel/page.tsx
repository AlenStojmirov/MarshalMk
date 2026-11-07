import type { Metadata } from 'next';
import { pageShare } from '@/lib/share-preview';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchLoyaltySettings } from '@/lib/loyalty-settings';
import WheelPanel from '@/components/wheel/WheelPanel';
import WheelHeading from '@/components/wheel/WheelHeading';

/** The switch is read on every visit: off means this page does not exist. */
export const dynamic = 'force-dynamic';

const pageTitle = 'Тркало на среќа';
const pageDescription =
  'Завртете го тркалото на Маршал: секое вртење добива награда — поени, попуст или бесплатна достава.';

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: 'https://marshal.mk/wheel' },
  // Its own share card, not the home page's (16.3).
  ...pageShare(pageTitle, pageDescription, '/wheel'),
};

export default async function WheelPage() {
  const { settings } = await fetchLoyaltySettings(getSupabaseAdmin());
  if (!settings.wheelEnabled) notFound();
  return (
    <main className="bg-stone-50 min-h-[70vh]">
      <div className="max-w-md mx-auto px-4 py-8">
        <WheelHeading />
        <WheelPanel />
      </div>
    </main>
  );
}
