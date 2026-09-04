-- supabase/migrations/0005_contrato_efetivo.sql
-- Adiciona suporte a Contrato Efetivo (Trabalhador por Conta de Outrem em Portugal),
-- perguntas de admissão para apuramento de retenção de IRS e detalhe salarial
-- (Salário Base, Prémio Fixo, Horas Extras com valor fixo e Refeições Extras).

alter table public.user_settings
  add column if not exists contract_regime varchar(20) not null default 'effective'
    check (contract_regime in ('effective', 'hourly')),
  add column if not exists base_salary numeric(10,2) not null default 1500.00,
  add column if not exists fixed_bonus numeric(10,2) not null default 500.00,
  add column if not exists agreed_total_salary numeric(10,2) not null default 2000.00,
  add column if not exists overtime_fixed_rate numeric(10,2) not null default 12.00,
  add column if not exists extra_meal_value numeric(10,2) not null default 9.50,
  add column if not exists irs_marital_status varchar(30) not null default 'single'
    check (irs_marital_status in ('single', 'married_1_earner', 'married_2_earners')),
  add column if not exists irs_dependents_count int not null default 0
    check (irs_dependents_count >= 0),
  add column if not exists irs_has_disability boolean not null default false,
  add column if not exists fiscal_region varchar(20) not null default 'continente'
    check (fiscal_region in ('continente', 'acores', 'madeira')),
  add column if not exists holiday_subsidy_month int not null default 1
    check (holiday_subsidy_month between 1 and 12),
  add column if not exists christmas_subsidy_month int not null default 11
    check (christmas_subsidy_month between 1 and 12),
  add column if not exists subsidy_mode varchar(20) not null default 'full_in_month'
    check (subsidy_mode in ('full_in_month', 'duodecimos'));

comment on column public.user_settings.contract_regime is 'Regime contratual: effective (Contrato de Trabalho sem termo / efetivo) ou hourly (por hora / prestação de serviços).';
comment on column public.user_settings.base_salary is 'Vencimento base oficial constante no recibo (ex: 1.500€).';
comment on column public.user_settings.fixed_bonus is 'Prémio / gratificação fixa mensal pago pela empresa (ex: 500€).';
comment on column public.user_settings.agreed_total_salary is 'Ordenado global real acordado na contratação (ex: 2.000€), usado para auditoria de direitos sonegados.';
comment on column public.user_settings.overtime_fixed_rate is 'Valor fixo pago por hora extra pela empresa (ex: 12€/h).';
comment on column public.user_settings.extra_meal_value is 'Valor pago por cada refeição extra (ex: 9.50€).';
comment on column public.user_settings.irs_marital_status is 'Situação familiar para IRS: single (não casado), married_1_earner (casado único titular), married_2_earners (casado dois titulares).';
comment on column public.user_settings.irs_dependents_count is 'Número de dependentes a cargo para efeitos da tabela de retenção de IRS.';
comment on column public.user_settings.irs_has_disability is 'Se o trabalhador tem grau de incapacidade fiscalmente relevante (>= 60%).';
comment on column public.user_settings.fiscal_region is 'Região fiscal: continente, acores ou madeira.';
comment on column public.user_settings.holiday_subsidy_month is 'Mês em que é pago o subsídio de férias (por defeito 1 = Janeiro).';
comment on column public.user_settings.christmas_subsidy_month is 'Mês em que é pago o subsídio de natal (por defeito 11 = Novembro).';
comment on column public.user_settings.subsidy_mode is 'Modalidade de subsídios: full_in_month (pago por inteiro no mês respetivo) ou duodecimos (diluído).';
