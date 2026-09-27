'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Where marketing lands at /admin (Task 10.0). The role has one screen, so
 * /admin is only the sign-in: one address to bookmark, not two that drift.
 */
export default function MarketingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/marketing');
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
}
