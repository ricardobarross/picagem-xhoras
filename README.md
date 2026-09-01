# Picagem X€Horas

Web App de Gestão de Ponto e Calculadora de Salário Líquido — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase.

## Como testar localmente

### 1. Criar o projeto Supabase

1. Cria uma conta/projeto gratuito em [supabase.com](https://supabase.com) (ou usa um já existente).
2. Em **Project Settings → API**, copia o `Project URL` e a chave `anon public`.
3. Em **SQL Editor**, cola e corre o conteúdo de `supabase/migrations/0001_init.sql`. Isto cria as tabelas, os triggers e as políticas de RLS.
   - Alternativa via CLI: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
4. (Opcional, para o login com Google) Em **Authentication → Providers → Google**, ativa o provider e configura o Client ID/Secret. Em **Authentication → URL Configuration**, garante que `http://localhost:3000/auth/callback` está nos Redirect URLs.

### 2. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Edita `.env.local` e preenche com o URL e a anon key do teu projeto Supabase.

### 3. Instalar e correr

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — deves ser redirecionado para `/login`.

### 4. Fluxo de teste

1. **Criar conta** em `/cadastro` (nome, email, palavra-passe). O Supabase envia um email de confirmação (por defeito); confirma esse email antes de tentares entrar (ou desativa "Confirm email" em Authentication → Providers → Email, só para testes locais).
2. **Entrar** em `/login`.
3. Serás redirecionado para `/dashboard` — vai mostrar 0h/0€ porque ainda não há picagens nem configurações personalizadas (a conta já tem uma linha em `user_settings` com valores por defeito, criada automaticamente pelo trigger `handle_new_user`).
4. Vai a **Picagem** (`/ponto`) e testa os botões Entrada → Pausa → Regresso → Saída. Cada clique grava/atualiza uma linha em `time_entries` (podes confirmar na tab **Table Editor** do Supabase).
5. Depois de completares um turno (clicares em Saída), volta ao **Dashboard** — o resumo de horas e a simulação de recibo já refletem esse turno, calculados por `lib/salary-calculator.ts` a partir do `base_hourly_rate` (por defeito 0 — edita a linha em `user_settings` diretamente no Table Editor para veres valores diferentes; as páginas de configurações da interface ainda não estão implementadas nesta v1).

### Coisas a saber sobre esta v1

- As páginas de configurações (`/configuracoes/...`), a tabela de registos editável e a exportação PDF/CSV **ainda não existem** — a árvore completa recomendada está descrita mais abaixo. Por agora, para testar valores diferentes de remuneração/subsídios, edita a linha correspondente na tabela `user_settings` pelo Table Editor do Supabase.
- `types/database.types.ts` foi escrito à mão. Assim que tiveres o projeto Supabase, o ideal é substituí-lo pelo ficheiro gerado automaticamente:
  ```bash
  npx supabase gen types typescript --project-id <o-teu-project-ref> > types/database.types.ts
  ```
- O login com Google só funciona depois de configurares o provider no passo 1.4. Sem isso, o botão "Continuar com Google" mostra um erro do Supabase — usa email/palavra-passe entretanto.

## Árvore de ficheiros (recomendada / estado atual)

```
├── app/
│   ├── (auth)/{layout,login/page,cadastro/page}.tsx        ✅
│   ├── (app)/{layout,dashboard/page,ponto/page}.tsx        ✅
│   │   ├── registos/page.tsx                                ⏳ por fazer
│   │   ├── relatorios/page.tsx                               ⏳ por fazer
│   │   └── configuracoes/...                                 ⏳ por fazer
│   ├── auth/callback/route.ts                                ✅
│   └── page.tsx                                              ✅ (redirect)
├── components/
│   ├── ui/{button,card}.tsx                                  ✅
│   ├── auth/{LoginForm,SignupForm,SignOutButton}.tsx         ✅
│   └── time-tracker/TimeTracker.tsx                          ✅
├── lib/
│   ├── supabase/{client,server,middleware}.ts                ✅
│   ├── salary-calculator.ts                                  ✅
│   └── time-utils.ts                                         ✅
├── types/database.types.ts                                   ✅
├── proxy.ts (substitui middleware.ts a partir do Next 16)    ✅
└── supabase/migrations/0001_init.sql                          ✅
```

## Fórmula do cálculo financeiro (resumo)

1. **Horas por turno** = (saída − entrada) − pausa.
2. Turnos em dias normais acima do limiar diário geram horas extra em 2 escalões; sábado/domingo/feriado usam a totalidade das horas à taxa desse dia; o adicional noturno é somado à parte, por sobreposição com a janela configurada.
3. **Bruto** = Σ(horas × taxa) + subsídios (alimentação, duodécimos, transporte).
4. **Descontos** = Segurança Social (% sobre a base tributável) + IRS (taxa fixa ou por escalões).
5. **Líquido** = Bruto − Descontos.

Implementação completa em `lib/salary-calculator.ts`.

## Deploy

Este projeto está pronto para [Vercel](https://vercel.com/new): liga o repositório GitHub, define as mesmas variáveis de `.env.local` nas Environment Variables do projeto Vercel, e adiciona o domínio de produção aos Redirect URLs do Supabase Auth.
