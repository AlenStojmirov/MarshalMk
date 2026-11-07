import { Metadata } from 'next';

export const metadata: Metadata = {
  // Macedonian, like all page metadata (D-039, 16.3); the words the site uses.
  title: 'Кошничка',
  robots: { index: false, follow: false },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
