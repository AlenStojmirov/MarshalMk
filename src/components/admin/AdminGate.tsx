'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccess, isBackOffice } from '@/lib/roles';

/**
 * Keeps every role out of the admin screens it may not open (Task 8.2).
 *
 * Signed-out visitors pass through: every admin page already shows its own
 * sign-in or "log in first" screen. This only answers the second question —
 * signed in, but allowed here? The database enforces the same line (8.4); this
 * is so staff are never shown a screen full of errors or numbers not meant for
 * them.
 */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const pathname = usePathname();

  if (loading || !user || canAccess(role, pathname)) return <>{children}</>;

  // Signed in, but not a back-office account at all: no role yet, or a role
  // that lives outside the admin (a customer). The owner's decision
  // (2026-09-26): a blank page — neither the admin's nor the warehouse screen,
  // not even a hint of what is behind it. Such users get their own screen
  // later, outside /admin. Only a sign-out, so the browser is not stuck on
  // this account.
  if (!isBackOffice(role)) {
    return (
      <div className="min-h-[60vh] relative">
        <button
          onClick={signOut}
          className="absolute top-3 right-4 text-xs text-slate-400 hover:text-slate-600"
        >
          Одјава
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <ShieldAlert className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Само за админ</h1>
        <p className="text-sm text-slate-500 mb-4">
          Овој екран е само за сопственикот. Ако ти треба нешто од тука, обрати се кај сопственикот.
        </p>
        <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
          Назад на почетна
        </Link>
      </div>
    </div>
  );
}
