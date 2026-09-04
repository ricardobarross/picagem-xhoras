-- supabase/migrations/0007_backfill_contrato_efetivo_legacy.sql
-- Este projeto Supabase já tinha uma versão ad-hoc do "Contrato Efetivo"
-- aplicada diretamente na base de dados (fora do histórico deste
-- repositório, provavelmente pelo editor SQL/dashboard), com nomes de
-- coluna diferentes dos da migração 0005: payment_type,
-- base_monthly_salary, fixed_bonus_value, overtime_hourly_rate,
-- overtime_meal_allowance_value, vacation_bonus_month,
-- christmas_bonus_month. A 0005 introduziu as colunas "oficiais" do
-- repositório (contract_regime, base_salary, fixed_bonus, ...) sem saber
-- da existência dessas colunas antigas — daí o erro "Could not find the
-- 'agreed_total_salary' column" reportado em produção: a 0005 nunca tinha
-- sido de facto aplicada a este projeto.
--
-- Este script copia os valores reais já guardados pelos utilizadores para
-- as novas colunas, para não os perder. É defensivo — só corre se as
-- colunas antigas existirem — para continuar seguro de aplicar num
-- projeto novo que nunca teve essa versão ad-hoc (nesse caso é um no-op).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'payment_type'
  ) then
    update public.user_settings
    set
      contract_regime = case when payment_type = 'fixed' then 'effective' else 'hourly' end,
      base_salary = case when payment_type = 'fixed' and base_monthly_salary > 0 then base_monthly_salary else base_salary end,
      fixed_bonus = case when payment_type = 'fixed' then fixed_bonus_value else fixed_bonus end,
      agreed_total_salary = case when payment_type = 'fixed' and base_monthly_salary > 0
        then base_monthly_salary + fixed_bonus_value else agreed_total_salary end,
      overtime_fixed_rate = case when payment_type = 'fixed' and overtime_hourly_rate > 0 then overtime_hourly_rate else overtime_fixed_rate end,
      extra_meal_value = case when payment_type = 'fixed' and overtime_meal_allowance_value > 0 then overtime_meal_allowance_value else extra_meal_value end,
      holiday_subsidy_month = coalesce(vacation_bonus_month, holiday_subsidy_month),
      christmas_subsidy_month = coalesce(christmas_bonus_month, christmas_subsidy_month)
    where payment_type is not null;
  end if;
end $$;
