-- supabase/migrations/0009_absence_entries.sql
-- Adiciona faltas injustificadas, baixa médica e falta justificada aos
-- registos de time_entries — pedido por Ricardo (04/09/2026) depois de
-- partilhar recibos reais (Metalomecânica 3 Triângulos, Lda., mai/jul/set
-- 2025) que mostram estes dois mecanismos de desconto:
--   - "Faltas Hora Injustificada": desconta horas ao valor/hora legal do
--     salário base (base×12/2080, arredondado a 2 casas — dá exatamente os
--     7,21€/h do recibo para um base de 1.250€).
--   - "Baixa": desconta um dia inteiro ao valor/dia do salário base
--     (base/30 — dá exatamente os 41,67€/dia do recibo).
-- Ambas reduzem o Vencimento Base e por isso também a base de SS/IRS
-- (ver lib/salary-calculator.ts). Falta justificada (Art. 255º CT) fica
-- só registada, sem desconto.

alter table public.time_entries
  add column if not exists entry_type text not null default 'work'
    check (entry_type in ('work', 'unjustified_absence', 'sick_leave', 'justified_absence'));

comment on column public.time_entries.entry_type is
  'work = dia normal trabalhado; unjustified_absence = falta injustificada (hours_worked = horas em falta, descontadas ao valor/hora legal); sick_leave = baixa médica (um registo = um dia inteiro, hours_worked ignorado, desconta o valor/dia); justified_absence = falta justificada (Art. 255º CT, um registo = um dia, sem desconto).';

-- Para sick_leave/justified_absence um registo já representa um dia
-- inteiro — não precisam de hours_worked. O check original
-- (hours_worked >= 0 and hours_worked <= 24) já deixa passar NULL sem
-- alterações; só é preciso libertar a obrigatoriedade de NOT NULL.
alter table public.time_entries
  alter column hours_worked drop not null;

alter table public.time_entries
  add constraint chk_hours_worked_required_for_hourly_types check (
    entry_type not in ('work', 'unjustified_absence') or hours_worked is not null
  );
