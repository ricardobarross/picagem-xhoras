'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
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
