-- Migração 0020 (03/11/2026): redução intercalar de IRS num mês
-- selecionável, configurável pelo utilizador (não fixa em código).
--
-- Contexto: o governo português corta por vezes as taxas de retenção na
-- fonte de IRS a meio do ano, como adiantamento de uma descida ainda não
-- refletida nas tabelas (ex: Novembro/2026, corte de 50%; o mesmo já
-- aconteceu em Ago/Set de 2025, com outra percentagem). Pedido por
-- Ricardo (20/10/2026): poder selecionar, por ano, em que mês isto se
-- aplica e com que percentagem — sem hard-code, para reutilizar em anos
-- futuros se a medida se repetir.
--
-- Mesmo padrão de supabase/migrations/0010_subsidy_overrides_and_receipts.sql
-- (subsidy_payment_overrides): histórico por ano, sem apagar registos
-- anteriores, com RLS "cada um só vê/edita o seu".
create table if not exists irs_reduction_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  reduction_percentage numeric not null default 50 check (reduction_percentage >= 0 and reduction_percentage <= 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reference_year, reference_month)
);

alter table irs_reduction_overrides enable row level security;

create policy irs_reduction_overrides_select_own
  on irs_reduction_overrides for select
  using (auth.uid() = user_id);

create policy irs_reduction_overrides_insert_own
  on irs_reduction_overrides for insert
  with check (auth.uid() = user_id);

create policy irs_reduction_overrides_update_own
  on irs_reduction_overrides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy irs_reduction_overrides_delete_own
  on irs_reduction_overrides for delete
  using (auth.uid() = user_id);
