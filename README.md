# Picagem X€Horas

Web App de Gestão de Ponto e Calculadora de Salário Líquido — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase.

Suporta dois regimes de trabalho: **Contrato Efetivo** (Trabalhador por Conta de Outrem, com salário base + prémio + subsídios de Férias/Natal + perfil fiscal de admissão) e **Horista** (prestação de serviços, tarifário por hora com sábado/domingo/feriado).

## Como testar localmente

### 1. Criar o projeto Supabase

1. Cria uma conta/projeto gratuito em [supabase.com](https://supabase.com) (ou usa um já existente).
2. Em **Project Settings → API**, copia o `Project URL` e a chave `anon public`.
3. Em **SQL Editor**, corre as migrações da pasta `supabase/migrations/` **por ordem, uma a uma** (cada uma depende da anterior):
   1. `0001_init.sql` — schema inicial: tabelas, triggers, RLS.
   2. `0002_simplify.sql` — simplifica `time_entries` para um valor de horas por dia e o tarifário para `weekday_rate`/`saturday_extra_per_hour`/`sunday_multiplier`. **Atenção:** este script apaga e recria `time_entries` — só corre isto se ainda não tiveres dados reais de picagem a preservar.
   3. `0003_declared_income.sql` — adiciona `declare_weekend_income` (se o fim de semana entra ou não na base declarada de SS/IRS).
   4. `0004_official_irs_brackets.sql` — cria a tabela de referência `irs_official_brackets` com os escalões gerais de IRS 2026, usada pelo botão "Carregar escalões oficiais" em Configurações.
   5. `0005_contrato_efetivo.sql` — adiciona os campos de Contrato Efetivo (`base_salary`, `fixed_bonus`, `agreed_total_salary`, `overtime_fixed_rate`, `extra_meal_value`, perfil fiscal Art. 99º CIRS, calendário de subsídios).
   6. `0006_atomic_irs_brackets.sql` — cria a função RPC `replace_irs_tax_brackets`, usada pelo formulário de Descontos para gravar os escalões de IRS de forma atómica (substitui o antigo delete+insert em dois pedidos separados).
   7. `0007_backfill_contrato_efetivo_legacy.sql` — defensiva: só faz algo se o projeto tiver colunas antigas de uma versão ad-hoc do Contrato Efetivo aplicada fora deste histórico (`payment_type`, `base_monthly_salary`, ...). Num projeto novo é um no-op inofensivo.
   - Alternativa via CLI, que aplica todas as migrações pendentes pela ordem correta automaticamente: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
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
3. Serás redirecionado para `/dashboard` — vai mostrar 0h/0€ porque ainda não há picagens nem configurações personalizadas (a conta já tem uma linha em `user_settings` com valores por defeito, criada automaticamente pelo trigger `handle_new_user`; para Contrato Efetivo os defeitos são 1.500€ base + 500€ prémio).
4. Vai a **Configurações** (`/configuracoes`) e escolhe o regime (Efetivo ou Horista), preenche a estrutura salarial, o perfil fiscal e os subsídios. Tudo aqui é editável pela interface — não é preciso mexer diretamente na base de dados.
5. Vai a **Picagem** (`/ponto`) e regista as horas trabalhadas por dia no calendário do mês. Cada alteração grava/atualiza uma linha em `time_entries` (podes confirmar na tab **Table Editor** do Supabase).
6. Volta ao **Dashboard** — o resumo de horas e a simulação de recibo já refletem as picagens, calculados por `lib/salary-calculator.ts`. Dias úteis, sábados, domingos e feriados obrigatórios portugueses (calculados automaticamente em `lib/time-utils.ts`, incluindo os móveis — Sexta-feira Santa e Corpo de Deus) são discriminados separadamente.
7. Em regime Efetivo, acede a **Auditoria de Perdas** (`/perdas`) para a comparação entre o que a empresa paga e o que a lei exige sobre o ordenado real acordado.

### Coisas a saber sobre esta v1

- `types/database.types.ts` foi escrito à mão. Assim que tiveres o projeto Supabase, o ideal é substituí-lo pelo ficheiro gerado automaticamente:
  ```bash
  npx supabase gen types typescript --project-id <o-teu-project-ref> > types/database.types.ts
  ```
  **Atenção:** se regenerares os tipos, garante que a função `replace_irs_tax_brackets` (migração 0006) continua listada em `Database.public.Functions` — é o que o `DescontosForm.tsx` usa para gravar os escalões de IRS.
- O login com Google só funciona depois de configurares o provider no passo 1.4. Sem isso, o botão "Continuar com Google" mostra um erro do Supabase — usa email/palavra-passe entretanto.
- Os escalões gerais de IRS em `0004_official_irs_brackets.sql` são um ponto de partida (fonte: guia fiscal PwC Portugal 2026) — confirma sempre no [Portal das Finanças](https://info.portaldasfinancas.gov.pt) antes de fechar uma folha real.
- A lista de feriados obrigatórios em `lib/time-utils.ts` (`getPortugueseHolidays`) cobre o Continente; feriados municipais e facultativos (ex.: Carnaval, aniversário do concelho) não estão incluídos.

## Árvore de ficheiros (estado atual)

```
├── app/
│   ├── (auth)/{layout,login/page,cadastro/page}.tsx        ✅
│   ├── (app)/
│   │   ├── layout.tsx                                       ✅
│   │   ├── dashboard/page.tsx                                ✅
│   │   ├── ponto/page.tsx                                    ✅
│   │   ├── configuracoes/page.tsx                            ✅
│   │   └── perdas/page.tsx                                   ✅ Auditoria de Perdas (Contrato Efetivo)
│   ├── auth/callback/route.ts                                ✅
│   └── page.tsx                                              ✅ (redirect)
├── components/
│   ├── ui/{button,card}.tsx                                  ✅
│   ├── auth/{LoginForm,SignupForm,SignOutButton}.tsx         ✅
│   ├── time-tracker/PontoClient.tsx                          ✅
│   ├── dashboard/DashboardCharts.tsx                         ✅
│   ├── settings/{ContractSettingsForm,RatesForm,DescontosForm}.tsx  ✅
│   └── audit/LossAuditClient.tsx                             ✅
├── lib/
│   ├── supabase/{client,server,middleware}.ts                ✅
│   ├── salary-calculator.ts                                  ✅
│   ├── loss-calculator.ts                                    ✅
│   └── time-utils.ts                                         ✅
├── types/database.types.ts                                   ✅
├── scripts/verify-calculations.ts                             ✅ script de verificação (npm run verify)
├── proxy.ts (substitui middleware.ts a partir do Next 16)    ✅
└── supabase/migrations/0001..0007_*.sql                       ✅
```

`registos/page.tsx` e `relatorios/page.tsx` (histórico tabular editável e exportação PDF/CSV) continuam por fazer — não fazem parte do âmbito desta versão.

## Fórmula do cálculo financeiro (resumo)

### Regime Efetivo (Contrato de Trabalho / TCO)

1. Vencimento base + prémio fixo mensal (valores declarados no recibo).
2. Horas além do horário normal (8h/dia útil, ou qualquer hora ao fim de semana/feriado) são pagas à taxa fixa configurada (`overtime_fixed_rate`).
3. Subsídio de Férias e de Natal são pagos por inteiro (sem duodécimos) no mês configurado, sobre o valor do salário base.
4. Segurança Social (% sobre a base tributável) + IRS: escalões mensais diretos, ou escalões anuais do Art. 68º do CIRS anualizados (base × 14 meses) antes de aplicar a taxa.
5. **Líquido** = Bruto − Segurança Social − IRS. A página `/perdas` compara este cenário com o que o Código do Trabalho exige sobre o ordenado real acordado.

### Regime Horista (Prestação de Serviços)

1. **Horas por dia** = valor registado em `/ponto`.
2. Dia útil à `weekday_rate`; sábado a `weekday_rate + saturday_extra_per_hour`; domingo e feriado obrigatório a `weekday_rate × sunday_multiplier` (a lei equipara o feriado ao descanso de domingo — Art. 269º do CT).
3. **Bruto** = Σ(horas × taxa do dia) + subsídios (alimentação, transporte).
4. Por defeito, sábado/domingo/feriado **não** entram na base declarada (SS/IRS) — são recebidos à parte; `declare_weekend_income` em Configurações liga isto, se o teu acordo com o patrão for diferente.
5. **Líquido** = Bruto − Descontos.

Implementação completa em `lib/salary-calculator.ts`. Correr `npm run verify` executa um script standalone que confirma alguns destes cálculos com valores fixos (ver `scripts/verify-calculations.ts`).

## Deploy

Este projeto está pronto para [Vercel](https://vercel.com/new): liga o repositório GitHub, define as mesmas variáveis de `.env.local` nas Environment Variables do projeto Vercel, e adiciona o domínio de produção aos Redirect URLs do Supabase Auth.
