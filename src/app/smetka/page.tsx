import { Suspense } from 'react';
import AccountHome from '@/components/account/AccountHome';

export default function AccountPage() {
  // AccountHome reads the query string (?potvrdeno=1), which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AccountHome />
    </Suspense>
  );
}
