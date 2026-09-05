// app/auth/confirm/route.ts
// Troca o "token_hash" devolvido pelo Supabase por uma sessão. É um
// endpoint distinto de app/auth/callback/route.ts:
//   - /auth/callback trata o fluxo PKCE (?code=...) — usado quando o
//     pedido nasce no browser (signup em /cadastro, login com Google).
//   - /auth/confirm (este ficheiro) trata o fluxo por token_hash
//     (?token_hash=...&type=...) — o único formato que um link gerado no
//     servidor consegue produzir, porque não há um browser na origem para
//     gerar o code_challenge do PKCE. É o caso do convite de utilizador
//     feito no painel do Supabase ("Invite user"), da recuperação de
//     password, e de magic links pedidos fora do browser.
//
// Sem este endpoint, um convite feito no painel do Supabase confirma a
// conta do lado do Supabase (o utilizador aparece como "Confirmed"/"Last
// signed in") mas nunca chega a criar sessão nos cookies do lado do
// servidor — a pessoa clica no link do email e continua sem conseguir
// entrar na app. (Caso real: convite enviado a um colega, 05/09/2026.)
//
// Para os links passarem a usar este formato, os templates em Supabase →
// Authentication → Emails têm de apontar para aqui em vez do link por
// omissão ({{ .ConfirmationURL }}):
//   Invite user:    {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
//   Reset Password: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
//   Magic Link:     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
//   Confirm signup: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
// (ver https://supabase.com/docs/guides/auth/server-side/nextjs)

import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/dashboard';

  // Sanitização contra Open Redirect: garante que começa por / e nunca por //
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_confirm_failed`);
}
