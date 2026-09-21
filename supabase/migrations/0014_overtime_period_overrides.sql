-- 0014_overtime_period_overrides.sql
-- Período de apuração de horas extras com data inicial/final explícitas,
-- em vez de assumir sempre o mesmo "dia de fecho" (payroll_cutoff_day) dos
-- dois lados do ciclo. Pedido por Ricardo (21/09/2026): a empresa muda o
-- dia de fecho da folha de mês para mês (ex.: fechou dia 20, no ciclo
-- seguinte fechou dia 25) — mudar só o número em user_settings fazia o
-- sistema calcular o início do período como "cutoffDay+1 do mês anterior",
-- o que fica errado quando o fecho anterior não foi nesse mesmo dia.
--
-- Cada registo aqui é um período explícito (start_date/end_date) que, ao
-- cobrir a data de referência de um cálculo, substitui inteiramente o
-- período que seria derivado de payroll_cutoff_day (ver
-- lib/time-utils.ts::resolvePayPeriod). Histórico (um registo por ciclo),
-- para que relatórios de meses passados continuem corretos mesmo que o
-- fecho volte a mudar depois — mesmo padrão de
-- subsidy_payment_overrides (0010), mas com datas em vez de mês/ano.

CREATE TABLE public.overtime_period_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overtime_period_overrides_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX overtime_period_overrides_user_range_idx
  ON public.overtime_period_overrides (user_id, start_date, end_date);

ALTER TABLE public.overtime_period_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY overtime_period_overrides_select_own
  ON public.overtime_period_overrides FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY overtime_period_overrides_insert_own
  ON public.overtime_period_overrides FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY overtime_period_overrides_update_own
  ON public.overtime_period_overrides FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY overtime_period_overrides_delete_own
  ON public.overtime_period_overrides FOR DELETE
  USING (auth.uid() = user_id);
