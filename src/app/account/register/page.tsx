import { Suspense } from 'react';
import RegisterForm from '@/components/account/RegisterForm';

export default function RegisterPage() {
  // RegisterForm reads where the visitor came from (?from=wheel), which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
