'use client';

import { Suspense } from 'react';
import StockCount from '@/components/admin/StockCount';

/** Попис (Tasks 17.2–17.3): staff count, the admin decides. Open to staff in roles.ts. */
export default function StockCountPage() {
  return (
    <Suspense fallback={null}>
      <StockCount />
    </Suspense>
  );
}
