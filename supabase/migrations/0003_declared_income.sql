-- 0003_declared_income.sql
-- Cada trabalhador negoceia de forma diferente com a entidade patronal: por
-- vezes o valor de fim de semana entra todo nas contas oficiais, por vezes
-- não. Este campo torna essa exclusão opcional em vez de assumida.
--
-- Por defeito (false): só os dias úteis (+ subsídios tributáveis) contam
-- para a base "declarada" usada no cálculo de Segurança Social (11% por
-- defeito) e de IRS. As horas de sábado/domingo são recebidas à parte,
-- sem descontos.
--
-- Quando true: sábados e domingos entram também na base declarada.

alter table public.user_settings
  add column if not exists declare_weekend_income boolean not null default false;

comment on column public.user_settings.declare_weekend_income is
  'Se true, o rendimento de sábado/domingo entra na base declarada (Segurança Social + IRS). Por defeito (false), só os dias úteis e os subsídios tributáveis contam para essa base.';
