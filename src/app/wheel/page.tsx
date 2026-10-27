import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchLoyaltySettings } from '@/lib/loyalty-settings';
import WheelPanel from '@/components/wheel/WheelPanel';
import WheelHeading from '@/components/wheel/WheelHeading';

/** The switch is read on every visit: off means this page does not exist. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Тркало на среќа',
  description: 'Завртете го тркалото на Маршал: секое вртење добива награда — поени, попуст или бесплатна достава.',
  alternates: { canonical: 'https://marshal.mk/wheel' },
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
