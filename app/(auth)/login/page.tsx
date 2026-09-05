import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  // LoginForm lê ?error= via useSearchParams (para mostrar o erro de um
  // link de confirmação/convite falhado — ver app/auth/confirm/route.ts),
  // o que exige um limite de Suspense para a página poder continuar
  // estática.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
