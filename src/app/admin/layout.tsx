import { Metadata } from 'next';
import AdminGate from '@/components/admin/AdminGate';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/** The back office is Macedonian only, whatever language the shop is browsed in (D-039). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider fixed="mk">
      <AdminGate>{children}</AdminGate>
    </LanguageProvider>
  );
}
