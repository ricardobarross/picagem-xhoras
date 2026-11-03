-- Corrige a descrição da coluna no_meal_allowance_in_subsidy_month:
-- o comportamento sempre devia aplicar-se só ao mês do subsídio de
-- FÉRIAS, não ao de Natal — corrigido no código em lib/salary-calculator.ts
-- (03/11/2026, pedido de Ricardo: "isso na empresa só acontece com o
-- subsidio de ferias. o de natal é pago normalmente"). Esta migração
-- só atualiza o comentário/documentação da coluna; não há alteração de
-- schema nem de dados.
COMMENT ON COLUMN user_settings.no_meal_allowance_in_subsidy_month IS
  'Quando true, o subsídio de alimentação não é pago no mês em que o subsídio de FÉRIAS é pago. O subsídio de Natal não afeta a alimentação. Default false para não alterar o comportamento de outras contas.';
