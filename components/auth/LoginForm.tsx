'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Mensagens amigáveis para os erros que app/auth/callback e
// app/auth/confirm podem devolver via ?error= (ver esses ficheiros).
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: 'O link de confirmação é inválido ou já expirou. Pede um novo.',
  auth_confirm_failed:
    'O link de confirmação/convite é inválido ou já expirou. Pede para reenviarem o convite/email.',
};

export function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = searchParams.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acede à tua conta para registares o ponto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {linkError && (
          <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-600">
            {AUTH_ERROR_MESSAGES[linkError] ?? 'Não foi possível confirmar o link. Tenta novamente.'}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="Palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'A entrar…' : 'Entrar'}
          </Button>
        </form>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={handleGoogleLogin} className="w-full">
          Continuar com Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Ainda não tens conta?{' '}
          <Link href="/cadastro" className="underline underline-offset-4">
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
