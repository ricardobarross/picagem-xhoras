-- 0004_official_irs_brackets.sql
-- Tabela de REFERÊNCIA com os escalões gerais de IRS (Continente, artigo
-- 68º do CIRS) por ano fiscal. Não é gerida pelo utilizador na aplicação —
-- serve só para o botão "Carregar escalões oficiais" em Configurações
-- pré-preencher a lista de escalões de cada pessoa (`irs_tax_brackets`),
-- que continua totalmente editável depois de carregada, porque a situação
-- fiscal de cada trabalhador pode diferir da tabela geral.
--
-- IMPORTANTE — precisão dos valores:
-- Os valores de 2026 abaixo vêm de fontes fiscais públicas (guia fiscal da
-- PwC Portugal para 2026), porque a tabela oficial do artigo 68º do CIRS
-- não estava disponível num PDF de fácil extração automática no momento
-- desta migração — só se confirmaram diretamente os despachos de retenção
-- na fonte mensal (que são uma tabela DIFERENTE). Os limiares e taxas
-- batem certo em duas fontes independentes, mas a "parcela a abater" de
-- alguns escalões tem pequenas divergências de arredondamento entre
-- fontes. CONFIRMA sempre estes valores no Portal das Finanças
-- (info.portaldasfinancas.gov.pt) antes de os usar para fechar a folha de
-- um mês real — trata isto como um ponto de partida editável, não como
-- verdade absoluta. Aplicam-se só ao Continente (Açores/Madeira têm
-- tabelas próprias, mais baixas).
--
-- Atualizar todos os anos: basta inserir uma nova linha com
-- fiscal_year = <ano seguinte> para cada escalão — o botão "Carregar
-- escalões oficiais" busca sempre o fiscal_year mais recente da tabela.

create table public.irs_official_brackets (
  id            uuid primary key default gen_random_uuid(),
  fiscal_year   int not null,
  min_income    numeric(10,2) not null,
  max_income    numeric(10,2),           -- null = sem limite superior (último escalão)
  rate          numeric(5,2) not null,   -- taxa marginal, %
  deduction     numeric(10,2) not null,  -- parcela a abater, €
  created_at    timestamptz not null default now(),
  unique (fiscal_year, min_income)
);

comment on table public.irs_official_brackets is 'Escalões gerais de IRS (Continente, art. 68º CIRS) por ano fiscal — dados de referência para pré-preencher os escalões de cada utilizador; não editável pela aplicação cliente.';

alter table public.irs_official_brackets enable row level security;

-- Dados de referência partilhados: qualquer conta autenticada pode ler.
-- Não há política de insert/update/delete — só é escrita via migração.
create policy "irs_official_brackets_select_authenticated" on public.irs_official_brackets
  for select using (auth.role() = 'authenticated');

insert into public.irs_official_brackets (fiscal_year, min_income, max_income, rate, deduction) values
  (2026, 0,        8342.00,  12.5, 0),
  (2026, 8342.00,  12587.00, 15.7, 266.94),
  (2026, 12587.00, 17838.00, 21.2, 959.26),
  (2026, 17838.00, 23089.00, 24.1, 1476.45),
  (2026, 23089.00, 29397.00, 31.1, 3092.77),
  (2026, 29397.00, 43090.00, 34.9, 4209.94),
  (2026, 43090.00, 46566.00, 43.1, 7743.27),
  (2026, 46566.00, 86634.00, 44.6, 8441.48),
  (2026, 86634.00, null,     48.0, 11387.17);
