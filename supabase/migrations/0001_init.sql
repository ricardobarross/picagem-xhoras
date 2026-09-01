-- =====================================================================
-- Picagem X€Horas — Schema inicial (Supabase / PostgreSQL)
-- Gestão de Ponto + Calculadora de Salário Líquido
-- =====================================================================
-- Convenções:
--   - Todas as tabelas de dados de utilizador têm RLS ativo.
--   - user_id referencia sempre auth.users(id) via profiles.id (1:1).
--   - Valores monetários em NUMERIC(10,2) (euros).
--   - Percentagens guardadas como NUMERIC(5,2) (ex.: 50.00 = +50%).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTENSÕES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. PROFILES — dados pessoais/empresa, 1:1 com auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  job_title     text,                 -- Cargo
  company_name  text,                 -- Nome da empresa
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Dados pessoais e da empresa do utilizador (1:1 com auth.users).';

-- ---------------------------------------------------------------------
-- 3. USER_SETTINGS — estrutura remuneratória e regras fiscais
-- ---------------------------------------------------------------------
create table public.user_settings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references public.profiles(id) on delete cascade,

  -- ===== Valores base por hora =====
  base_hourly_rate           numeric(10,2) not null default 0,   -- €/h dias úteis, horário normal

  -- Sábado / Domingo / Feriado / Noturno: podem ser um valor fixo (€/h)
  -- ou uma percentagem de sobreposição sobre base_hourly_rate.
  saturday_rate_type         text not null default 'percentage' check (saturday_rate_type in ('fixed','percentage')),
  saturday_rate_value        numeric(10,2) not null default 0,

  sunday_rate_type           text not null default 'percentage' check (sunday_rate_type in ('fixed','percentage')),
  sunday_rate_value          numeric(10,2) not null default 0,

  holiday_rate_type          text not null default 'percentage' check (holiday_rate_type in ('fixed','percentage')),
  holiday_rate_value         numeric(10,2) not null default 0,

  night_shift_rate_type      text not null default 'percentage' check (night_shift_rate_type in ('fixed','percentage')),
  night_shift_rate_value     numeric(10,2) not null default 25,   -- ex.: +25%
  night_shift_start_time     time not null default '22:00',
  night_shift_end_time       time not null default '07:00',

  -- Horas extra — escalões (ex.: 1ª hora +50%, seguintes +100%)
  overtime_daily_threshold_hours   numeric(4,2) not null default 8,   -- a partir de quantas horas/dia conta como extra
  overtime_tier1_percentage        numeric(5,2) not null default 50,
  overtime_tier1_max_hours         numeric(4,2) not null default 1,   -- quantas horas ficam no escalão 1
  overtime_tier2_percentage        numeric(5,2) not null default 100, -- restantes horas extra

  -- ===== Subsídios e benefícios =====
  meal_allowance_daily_value       numeric(10,2) not null default 0,
  meal_allowance_payment_method    text not null default 'card' check (meal_allowance_payment_method in ('card','cash')),
  meal_allowance_taxable           boolean not null default false,    -- isento até ao limite legal, por defeito não tributável

  bonus_payment_type               text not null default 'monthly_installments'
                                    check (bonus_payment_type in ('lump_sum','monthly_installments')),
  bonus_lump_sum_month             int check (bonus_lump_sum_month between 1 and 12), -- só se lump_sum

  transport_allowance_value        numeric(10,2) not null default 0,
  transport_allowance_frequency    text not null default 'monthly' check (transport_allowance_frequency in ('daily','monthly')),

  health_insurance_value           numeric(10,2) not null default 0,
  health_insurance_paid_by         text not null default 'employer' check (health_insurance_paid_by in ('employee','employer')),

  -- ===== Descontos / impostos =====
  social_security_rate             numeric(5,2) not null default 11.00,  -- % Segurança Social (trabalhador)
  irs_calculation_type             text not null default 'fixed_rate' check (irs_calculation_type in ('fixed_rate','bracket')),
  irs_fixed_rate                   numeric(5,2) not null default 0,      -- usado se irs_calculation_type = 'fixed_rate'

  currency                         text not null default 'EUR',
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

comment on table public.user_settings is 'Estrutura remuneratória, subsídios e regras de desconto configuradas pelo utilizador.';

-- ---------------------------------------------------------------------
-- 3b. IRS_TAX_BRACKETS — escalões de IRS (opcional, usado quando
--     irs_calculation_type = 'bracket'). Permite modelar tabelas de
--     retenção na fonte reais em vez de uma taxa fixa.
-- ---------------------------------------------------------------------
create table public.irs_tax_brackets (
  id                uuid primary key default gen_random_uuid(),
  user_settings_id  uuid not null references public.user_settings(id) on delete cascade,
  min_income        numeric(10,2) not null,          -- limite inferior do escalão
  max_income        numeric(10,2),                   -- null = sem limite superior
  rate              numeric(5,2) not null,            -- % aplicada
  deduction         numeric(10,2) not null default 0, -- parcela a abater (fórmula tabelas PT)
  created_at        timestamptz not null default now()
);

comment on table public.irs_tax_brackets is 'Escalões de IRS específicos do utilizador, usados quando as retenções não são uma taxa fixa.';

-- ---------------------------------------------------------------------
-- 4. TIME_ENTRIES — registo de picagens / turnos
-- ---------------------------------------------------------------------
create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  entry_date      date not null,
  clock_in        timestamptz,
  break_start     timestamptz,
  break_end       timestamptz,
  clock_out       timestamptz,

  day_type        text not null default 'normal' check (day_type in ('normal','saturday','sunday','holiday')),

  -- null = detetar automaticamente por sobreposição com a janela noturna
  -- configurada em user_settings; true/false = forçar manualmente.
  night_shift_override  boolean,

  status          text not null default 'in_progress' check (status in ('in_progress','completed')),
  source          text not null default 'manual' check (source in ('clock','manual')), -- picagem em tempo real vs. inserido manualmente
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_break_within_shift check (
    break_start is null or clock_in is null or break_start >= clock_in
  ),
  constraint chk_clock_out_after_in check (
    clock_out is null or clock_in is null or clock_out > clock_in
  )
);

comment on table public.time_entries is 'Turnos/picagens do utilizador — um registo por dia/turno.';

create index idx_time_entries_user_date on public.time_entries (user_id, entry_date desc);
create unique index uq_time_entries_open_shift
  on public.time_entries (user_id)
  where status = 'in_progress';  -- garante no máximo 1 turno "em curso" por utilizador

-- ---------------------------------------------------------------------
-- 5. TRIGGERS — updated_at automático + criação de profile/settings
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger trg_time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

-- Cria profile + user_settings (com valores por defeito) assim que um
-- novo utilizador se regista via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.user_settings    enable row level security;
alter table public.irs_tax_brackets enable row level security;
alter table public.time_entries     enable row level security;

-- profiles: o utilizador só vê/edita o seu próprio registo
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- user_settings: acesso restrito ao dono
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);

-- irs_tax_brackets: acesso via user_settings do dono
create policy "irs_brackets_select_own" on public.irs_tax_brackets
  for select using (
    exists (select 1 from public.user_settings us
            where us.id = irs_tax_brackets.user_settings_id and us.user_id = auth.uid())
  );
create policy "irs_brackets_modify_own" on public.irs_tax_brackets
  for all using (
    exists (select 1 from public.user_settings us
            where us.id = irs_tax_brackets.user_settings_id and us.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.user_settings us
            where us.id = irs_tax_brackets.user_settings_id and us.user_id = auth.uid())
  );

-- time_entries: CRUD restrito ao dono
create policy "time_entries_select_own" on public.time_entries
  for select using (auth.uid() = user_id);
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (auth.uid() = user_id);
create policy "time_entries_update_own" on public.time_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "time_entries_delete_own" on public.time_entries
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 7. NOTA SOBRE EQUIPAS (fase 2 — comercialização)
-- ---------------------------------------------------------------------
-- Para já cada utilizador é autónomo (RLS por auth.uid()). Quando a app
-- passar a ser usada por uma equipa/empresa, a evolução recomendada é:
--   1. Criar tabela `organizations` (id, name, owner_id).
--   2. Criar tabela `organization_members` (org_id, user_id, role: admin/member).
--   3. Adicionar organization_id (nullable) a time_entries e user_settings.
--   4. Trocar as policies de "auth.uid() = user_id" para também permitir
--      "role admin da organização a que o registo pertence", mantendo
--      sempre o próprio utilizador com acesso aos seus dados.
-- Este desenho não obriga a migrar dados existentes: organization_id
-- fica null para utilizadores individuais.
