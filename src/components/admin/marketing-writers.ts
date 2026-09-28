/**
 * What the post panel is opened with: the text maker and the pictures, for a
 * product, a combination or the weekly trust post. Shared by the "what to post"
 * buckets (10.1) and the calendar (10.4), so a post opened from either reads
 * and looks the same.
 */

import type { ProductAttributes } from '@/types';
import type { Month } from '@/lib/seasons';
import { photoUrls } from '@/lib/catalog-gaps';
import type { Combo, PostCandidate, PostKind } from '@/lib/marketing';
import { comboCopy, productCopy, productTitle, trustCopy, type CopyKind, type PostCopy } from '@/lib/post-copy';
import { renderComboCard, renderPriceCard, renderStoryCard, type CardProduct } from '@/lib/post-images';
import type { PackSpec } from '@/components/admin/PostPack';

export interface Writing {
  heading: string;
  kinds: CopyKind[];
  make: (kind: CopyKind, variant: number) => PostCopy;
  pack?: (kind: CopyKind, copy: PostCopy) => PackSpec | null;
  /** Opened from a calendar post: its saved text, and where to save it. */
  initialText?: string;
  onSave?: (text: string) => Promise<string | null>;
}

type ProductKind = Exclude<CopyKind, 'combo' | 'trust'>;

const photosOf = (c: PostCandidate, limit = Infinity) =>
  photoUrls(c.product.imageUrl, c.product.images)
    .slice(0, limit)
    .map((url, i) => ({ url, name: `${c.product.id}-${i + 1}` }));

/** What the drawn card says. The old price only where the post may talk about the discount (D-022). */
function cardProduct(c: PostCandidate, attrs?: ProductAttributes): CardProduct {
  const discount = c.discount.allowed && c.percentOff > 0;
  return {
    title: productTitle(c, attrs),
    price: c.price,
    listPrice: discount ? c.listPrice : undefined,
    percentOff: discount ? c.percentOff : undefined,
    sizes: c.sizes.map((s) => s.size),
    lastSizes: c.lastSizes,
    photo: c.product.imageUrl,
  };
}

/** The kinds a product post can take from a bucket; a story is always on offer. */
export function productKinds(kinds: Array<PostKind | CopyKind>): ProductKind[] {
  const out = kinds.filter((k): k is ProductKind => k !== 'combo' && k !== 'trust');
  if (!out.includes('story')) out.push('story');
  return out;
}

export function productWriter(
  c: PostCandidate,
  attrs: Map<string, ProductAttributes>,
  month: Month,
  kinds: ProductKind[],
): Writing {
  const a = attrs.get(c.product.id);
  return {
    heading: c.label,
    kinds,
    make: (kind, variant) => productCopy(kind as ProductKind, c, a, variant, month),
    pack: (kind, copy) => {
      const card = cardProduct(c, a);
      if (kind === 'story') {
        // One frame: the photo with the story's first line on it.
        const headline = copy.text.split('\n')[0];
        return { photos: [], card: () => renderStoryCard(card, headline), cardName: `${c.product.id}-storis`, aspect: 'story' };
      }
      return { photos: photosOf(c), card: () => renderPriceCard(card), cardName: `${c.product.id}-cena`, aspect: 'feed' };
    },
  };
}

export function comboWriter(combo: Combo, attrs: Map<string, ProductAttributes>, month: Month): Writing {
  return {
    heading: `${combo.top.label} + ${combo.bottom.label}`,
    kinds: ['combo'],
    make: (_kind, variant) => comboCopy(combo, attrs, variant, month),
    pack: () => ({
      // Two of each is enough to show both; the card closes the carousel.
      photos: [...photosOf(combo.top, 2), ...photosOf(combo.bottom, 2)],
      card: () =>
        renderComboCard(cardProduct(combo.top, attrs.get(combo.top.product.id)), cardProduct(combo.bottom, attrs.get(combo.bottom.product.id))),
      cardName: `${combo.top.product.id}-${combo.bottom.product.id}-komplet`,
      aspect: 'feed',
    }),
  };
}

export function trustWriter(month: Month): Writing {
  return {
    heading: 'Објава за доверба · еднаш неделно',
    kinds: ['trust'],
    make: (_kind, variant) => trustCopy(variant, month),
  };
}
