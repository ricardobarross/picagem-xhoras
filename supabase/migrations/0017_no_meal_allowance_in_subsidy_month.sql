-- Quando true, a alimentação não é paga nos meses em que o subsídio de
-- férias ou de Natal é pago — regra confirmada por Ricardo (06/10/2026,
-- "segundo o pessoal aqui": "quando recebemos subsídio de férias não
-- recebemos a alimentação"), e confirmada no recibo real de set/2026
-- (Nº 1538, sem linha de alimentação nesse mês). Default false para não
-- alterar o comportamento de outras contas.
ALTER TABLE user_settings
  ADD COLUMN no_meal_allowance_in_subsidy_month boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_settings.no_meal_allowance_in_subsidy_month IS
  'Quando true, o subsídio de alimentação não é pago nos meses em que o subsídio de férias ou de Natal é pago. Default false para não alterar o comportamento de outras contas.';
