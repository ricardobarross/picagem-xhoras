-- =====================================================================
-- Picagem X€Horas — Simplificação do tarifário e das picagens
-- =====================================================================
-- Corre isto DEPOIS do 0001_init.sql (e do 0000_reset.sql, se tiveres
-- corrido, já que este script assume que profiles/user_settings existem).
--
-- ATENÇÃO: esta migração APAGA a tabela time_entries e recria-a com uma
-- estrutura mais simples (um valor de horas por dia, em vez de
-- entrada/pausa/regresso/saída). Os registos de picagem que já lá
-- estivessem são perdidos — só faz sentido correr isto se ainda não
-- houver dados reais que precises de guardar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novo tarifário em user_settings
-- ---------------------------------------------------------------------
alter table public.user_settings
  drop column if exists saturday_rate_type,
  drop column if exists saturday_rate_value,
  drop column if exists sunday_rate_type,
  drop column if exists sunday_rate_value,
  drop column if exists holiday_rate_type,
  drop column if exists holiday_rate_value,
  drop column if exists night_shift_rate_type,
  drop column if exists night_shift_rate_value,
  drop column if exists night_shift_start_time,
  drop column if exists night_shift_end_time,
  drop column if exists overtime_daily_threshold_hours,
  drop column if exists overtime_tier1_percentage,
  drop column if exists overtime_tier1_max_hours,
  drop column if exists overtime_tier2_percentage;

alter table public.user_settings rename column base_hourly_rate to weekday_rate;

alter table public.user_settings
  add column if not exists saturday_extra_per_hour numeric(10,2) not null default 0,
  add column if not exists sunday_multiplier numeric(5,2) not null default 2,
  add column if not exists payroll_cutoff_day int not null default 20
    check (payroll_cutoff_day between 1 and 28);

comment on column public.user_settings.weekday_rate is 'Valor €/h em dias úteis (segunda a sexta).';
comment on column public.user_settings.saturday_extra_per_hour is 'Valor extra (€/h) somado ao weekday_rate para trabalho ao sábado.';
comment on column public.user_settings.sunday_multiplier is 'Multiplicador sobre o weekday_rate para trabalho ao domingo (2 = o dobro).';
comment on column public.user_settings.payroll_cutoff_day is 'Dia do mês em que a folha fecha. O pagamento é sempre no dia 1 do mês seguinte ao fecho.';

-- ---------------------------------------------------------------------
-- 2. Nova time_entries: um valor de horas por dia
-- ---------------------------------------------------------------------
drop table if exists public.time_entries cascade;

create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  entry_date    date not null,
  hours_worked  numeric(4,2) not null check (hours_worked >= 0 and hours_worked <= 24),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, entry_date)
);

comment on table public.time_entries is 'Um registo por dia: quantas horas foram trabalhadas nesse dia. Sábado/domingo/dia útil é sempre deduzido de entry_date, nunca guardado à parte.';

create index idx_time_entries_user_date on public.time_entries (user_id, entry_date desc);

create trigger trg_time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;

create policy "time_entries_select_own" on public.time_entries
  for select using (auth.uid() = user_id);
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (auth.uid() = user_id);
create policy "time_entries_update_own" on public.time_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "time_entries_delete_own" on public.time_entries
  for delete using (auth.uid() = user_id);
