'use client';

import type { Product } from '@/types';
import HomeCategoriesSection, { type HomeCard } from './HomeCategoriesSection';
import HomeBenefitsSection from './HomeBenefitsSection';
import NewProductsSection from './NewProductsSection';
import CampaignHero, { type CampaignPick } from './campaign/CampaignHero';
import type { CampaignFace, CampaignPhase } from '@/lib/campaign';
import { useTranslation } from '@/lib/i18n';

/** The home page, drawn from what the server read (`app/page.tsx`). */
export interface HomeCampaign {
  face: CampaignFace;
  phase: CampaignPhase;
  picks: CampaignPick[];
}

export default function HomeContent({ cards, newProducts, campaign }: { cards: HomeCard[]; newProducts: Product[]; campaign?: HomeCampaign | null }) {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="sr-only">{t('home.seoTitle')}</h1>

      {/* Black Friday and the like, while it counts down or holds (D-051) */}
      {campaign && <CampaignHero face={campaign.face} initialPhase={campaign.phase} picks={campaign.picks} />}

      {/* Section 1: this season's groups */}
      <HomeCategoriesSection cards={cards} preloadFirst={!campaign} />

      {/* Section 2: Store Benefits */}
      <HomeBenefitsSection />

      {/* Section 3: New Products */}
      <NewProductsSection products={newProducts} />
    </div>
  );
}
