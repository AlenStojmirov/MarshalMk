import { Metadata } from 'next';

export const metadata: Metadata = {
  // Macedonian, like all page metadata (D-039, 16.3); the words the site uses.
  title: 'Следи нарачка',
  robots: { index: false, follow: false },
};

export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
