-- supabase/migrations/0015_premio_extra_meal_cap_overtime_bonus.sql
-- Regras de negócio anotadas por Ricardo (26/09 a 05/10/2026), implementadas
-- agora de uma vez ("Todas as 5 regras"):
--
--   1. Prémio extra pontual: um bónus avulso (ex.: os +150€ mencionados pelo
--      patrão) é distinto da Gratificação regular (received_bonus) — precisa
--      de campo próprio no recibo real para não se misturar com ela.
--   2. Teto do subsídio de alimentação: nesta empresa nunca passa de
--      209,50€/mês, independentemente de quantos dias se trabalhe — precisa
--      de um teto configurável (0 = sem teto, para não alterar o
--      comportamento de outras contas que já não têm este problema).
--   3 e 4. Refeição extra por hora extra/fim-de-semana/feriado continua a
--      entrar como "Prémio" (já era assim — ver estimatedExtraMeals em
--      calculateGrossBreakdown), mas a contagem até agora era uma heurística
--      (horas extra / 3) em vez de "1 refeição por dia com horas extra
--      reais" — corrigido no código (lib/salary-calculator.ts), sem
--      precisar de coluna nova.
--   5. Meta de horas extras do patrão: a cada 32h reais de horas extras no
--      período, soma-se +8h de horas extras bónus — fica como opção
--      (checkbox) em Configurações porque pode ser temporária.
--
-- (A 6ª regra anotada — feriados trabalhados contarem como hora extra — já
-- estava implementada desde a introdução de getDayCategory/'holiday' em
-- lib/time-utils.ts + calculateHoursBreakdown; não precisa de migração.)

alter table public.payslip_receipts
  add column received_bonus_extra numeric(10,2);

comment on column public.payslip_receipts.received_bonus_extra is
  'Prémio extra pontual (bónus avulso, ex.: um valor mencionado à parte pelo patrão), distinto da Gratificação regular (received_bonus). Só registo informativo, sem veredicto de certo/errado — tal como received_bonus.';

alter table public.user_settings
  add column meal_allowance_monthly_cap numeric(10,2) not null default 0,
  add column overtime_bonus_enabled boolean not null default false;

comment on column public.user_settings.meal_allowance_monthly_cap is
  'Teto mensal do subsídio de alimentação (€). 0 = sem teto (comportamento inalterado para quem não o configurar). Pedido por Ricardo (09/2026): nesta empresa o subsídio nunca passa de 209,50€/mês.';
comment on column public.user_settings.overtime_bonus_enabled is
  'Quando true, a cada 32h reais de horas extras no período soma-se +8h de horas extras bónus (meta do patrão). Desligado por defeito — fica como checkbox porque pode ser temporário. Pedido por Ricardo (09/2026).';
