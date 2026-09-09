-- supabase/migrations/0012_irs_monthly_withholding_tables.sql
-- Corrige o bug reportado por Ricardo (09/09/2026): "estou vendo muito
-- desconto no IRS ... geralmente descontam menos".
--
-- Diagnóstico: a app usava a escala ANUAL do art. 68º do CIRS (anualizada
-- ×14) como aproximação da tabela MENSAL oficial de retenção na fonte
-- (Despacho n.º 233-A/2026). São tabelas completamente diferentes: a anual
-- é usada só na declaração de IRS de final de ano e é única para todos; a
-- mensal varia consoante o estado civil e o nº de dependentes, e é essa
-- que deve ser usada para simular o desconto no recibo de vencimento.
-- Além disso, `irs_dependents_count` existe no schema mas nunca era lido
-- em lado nenhum do cálculo.
--
-- Esta migração:
--   1. Adiciona `scale` ('monthly'/'annual') a irs_official_brackets e
--      irs_tax_brackets, para o cálculo deixar de adivinhar pela
--      magnitude dos valores (heurística `isAnnualScale`, frágil).
--   2. Adiciona `table_key` a irs_official_brackets, para distinguir as
--      três tabelas mensais (I: não casado sem dependentes / casado dois
--      titulares; II: não casado com dependentes; III: casado único
--      titular).
--   3. Adiciona `dependent_deduction` (parcela adicional a abater por
--      dependente) a ambas as tabelas.
--   4. Troca a unique key (fiscal_year, min_income) — que só fazia
--      sentido quando havia uma única tabela por ano — por
--      (fiscal_year, table_key, min_income), já que agora coexistem 3
--      tabelas mensais + a escala anual legada no mesmo ano fiscal.
--   5. Semeia as Tabelas I, II e III mensais (ano fiscal 2026) em
--      irs_official_brackets, para o botão "Carregar escalões oficiais
--      de IRS" passar a carregar a tabela mensal certa.
--
-- Os dois primeiros escalões de cada tabela oficial usam uma fórmula de
-- alívio marginal ("taxa × multiplicador × (constante − R)") em vez de
-- uma parcela fixa. Convertida algebricamente para o formato
-- taxa/parcela já usado no schema (tax = R×taxa_efetiva − parcela_efetiva,
-- onde taxa_efetiva = taxa×(1+mult) e parcela_efetiva = taxa×mult×constante),
-- e verificada por continuidade nos limites de cada escalão.

alter table public.irs_official_brackets
  add column if not exists scale text not null default 'annual',
  add column if not exists table_key text not null default 'annual',
  add column if not exists dependent_deduction numeric not null default 0;

alter table public.irs_official_brackets
  add constraint irs_official_brackets_scale_check check (scale = any (array['monthly', 'annual'])),
  add constraint irs_official_brackets_table_key_check
    check (table_key = any (array['annual', 'table_i', 'table_ii', 'table_iii']));

alter table public.irs_official_brackets
  drop constraint irs_official_brackets_fiscal_year_min_income_key,
  add constraint irs_official_brackets_fiscal_year_table_min_key unique (fiscal_year, table_key, min_income);

alter table public.irs_tax_brackets
  add column if not exists scale text not null default 'annual',
  add column if not exists dependent_deduction numeric not null default 0;

alter table public.irs_tax_brackets
  add constraint irs_tax_brackets_scale_check check (scale = any (array['monthly', 'annual']));

comment on column public.irs_official_brackets.scale is
  'monthly = tabela de retenção na fonte mensal (Despacho anual); annual = escala do art. 68º CIRS (declaração anual, anualizada x14 pela app legada).';
comment on column public.irs_official_brackets.table_key is
  'annual = escala única anual; table_i = não casado sem dependentes / casado dois titulares; table_ii = não casado com dependentes; table_iii = casado único titular.';
comment on column public.irs_tax_brackets.scale is
  'Escala destes escalões guardados na conta do utilizador: monthly (tabela de retenção mensal, correto) ou annual (escala anual legada, incorreta para simulação mensal).';

-- Tabela I 2026 (Continente) — não casado sem dependentes / casado, dois titulares.
-- Parcela adicional a abater por dependente: 21,43€.
insert into public.irs_official_brackets (fiscal_year, min_income, max_income, rate, deduction, scale, table_key, dependent_deduction) values
  (2026, 0,      920,    0.00,  0.00,    'monthly', 'table_i', 21.43),
  (2026, 920,    1042,   45.00, 414.00,  'monthly', 'table_i', 21.43),
  (2026, 1042,   1108,   36.895,329.50,  'monthly', 'table_i', 21.43),
  (2026, 1108,   1154,   15.70, 94.71,   'monthly', 'table_i', 21.43),
  (2026, 1154,   1212,   21.20, 158.18,  'monthly', 'table_i', 21.43),
  (2026, 1212,   1819,   24.10, 193.33,  'monthly', 'table_i', 21.43),
  (2026, 1819,   2119,   31.10, 320.66,  'monthly', 'table_i', 21.43),
  (2026, 2119,   2499,   34.90, 401.19,  'monthly', 'table_i', 21.43),
  (2026, 2499,   3305,   38.36, 487.66,  'monthly', 'table_i', 21.43),
  (2026, 3305,   5547,   39.69, 531.62,  'monthly', 'table_i', 21.43),
  (2026, 5547,   20221,  44.95, 823.40,  'monthly', 'table_i', 21.43),
  (2026, 20221,  null,   47.17, 1272.31, 'monthly', 'table_i', 21.43);

-- Tabela II 2026 — não casado, com um ou mais dependentes (mesmos escalões
-- da Tabela I; só muda a parcela adicional por dependente: 34,29€).
insert into public.irs_official_brackets (fiscal_year, min_income, max_income, rate, deduction, scale, table_key, dependent_deduction) values
  (2026, 0,      920,    0.00,  0.00,    'monthly', 'table_ii', 34.29),
  (2026, 920,    1042,   45.00, 414.00,  'monthly', 'table_ii', 34.29),
  (2026, 1042,   1108,   36.895,329.50,  'monthly', 'table_ii', 34.29),
  (2026, 1108,   1154,   15.70, 94.71,   'monthly', 'table_ii', 34.29),
  (2026, 1154,   1212,   21.20, 158.18,  'monthly', 'table_ii', 34.29),
  (2026, 1212,   1819,   24.10, 193.33,  'monthly', 'table_ii', 34.29),
  (2026, 1819,   2119,   31.10, 320.66,  'monthly', 'table_ii', 34.29),
  (2026, 2119,   2499,   34.90, 401.19,  'monthly', 'table_ii', 34.29),
  (2026, 2499,   3305,   38.36, 487.66,  'monthly', 'table_ii', 34.29),
  (2026, 3305,   5547,   39.69, 531.62,  'monthly', 'table_ii', 34.29),
  (2026, 5547,   20221,  44.95, 823.40,  'monthly', 'table_ii', 34.29),
  (2026, 20221,  null,   47.17, 1272.31, 'monthly', 'table_ii', 34.29);

-- Tabela III 2026 — casado, único titular. Parcela adicional a abater por
-- dependente: 42,86€.
insert into public.irs_official_brackets (fiscal_year, min_income, max_income, rate, deduction, scale, table_key, dependent_deduction) values
  (2026, 0,      991,    0.00,  0.00,    'monthly', 'table_iii', 42.86),
  (2026, 991,    1042,   45.00, 445.95,  'monthly', 'table_iii', 42.86),
  (2026, 1042,   1108,   29.375,283.14,  'monthly', 'table_iii', 42.86),
  (2026, 1108,   1119,   12.50, 96.17,   'monthly', 'table_iii', 42.86),
  (2026, 1119,   1432,   12.72, 98.64,   'monthly', 'table_iii', 42.86),
  (2026, 1432,   1962,   15.70, 141.32,  'monthly', 'table_iii', 42.86),
  (2026, 1962,   2240,   19.38, 213.53,  'monthly', 'table_iii', 42.86),
  (2026, 2240,   2773,   22.77, 289.47,  'monthly', 'table_iii', 42.86),
  (2026, 2773,   3389,   25.70, 370.72,  'monthly', 'table_iii', 42.86),
  (2026, 3389,   5965,   28.81, 476.12,  'monthly', 'table_iii', 42.86),
  (2026, 5965,   20265,  38.43, 1049.96, 'monthly', 'table_iii', 42.86),
  (2026, 20265,  null,   47.17, 2821.13, 'monthly', 'table_iii', 42.86);
