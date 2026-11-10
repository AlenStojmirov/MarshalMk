'use client';

import { Suspense } from 'react';
import ExchangeScreen from '@/components/admin/Exchange';

/** Замена (Task 18.1): staff and the admin make it, the admin can undo it. Open to staff in roles.ts. */
export default function ExchangePage() {
  return (
    <Suspense fallback={null}>
      <ExchangeScreen />
    </Suspense>
  );
}
