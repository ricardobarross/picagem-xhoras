'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function SignupForm() {
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }, // usado pelo trigger handle_new_user() para pré-preencher profiles
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSuccess(true);
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirma o teu email</CardTitle>
          <CardDescription>
            Enviámos um link de confirmação para {email}. Depois de confirmares, já podes entrar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Regista-te para começares a controlar o teu ponto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            required
            placeholder="Nome"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
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
            minLength={6}
            placeholder="Palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'A criar…' : 'Criar conta'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Já tens conta?{' '}
          <Link href="/login" className="underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
