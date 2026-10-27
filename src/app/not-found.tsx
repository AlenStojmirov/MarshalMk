import type { Metadata } from 'next';
import NotFoundContent from '@/components/NotFoundContent';

// Every 404 of the site (Task 14.6), unmatched URLs included. Next adds the noindex itself.
export const metadata: Metadata = { title: 'Страната не постои' };

export default function NotFound() {
  return <NotFoundContent />;
}
