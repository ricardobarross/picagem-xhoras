-- supabase/migrations/0011_backfill_hourly_legacy_fields.sql
-- Corrige o bug reportado por Ricardo (05/09/2026): "o login da minha
-- esposa está a mostrar as informações da minha auditoria".
--
-- Não é uma fuga de sessão/RLS (auditado e confirmado correto). A causa
-- real: a migração 0005 criou base_salary/fixed_bonus/agreed_total_salary/
-- overtime_fixed_rate/extra_meal_value com o DEFAULT copiado dos valores
-- reais de uma conta específica (1500/500/2000/12/9.50). handle_new_user()
-- insere a linha só com user_id, por isso QUALQUER conta criada entre a
-- 0005 e a 0008 nasceu já com esses valores gravados na própria linha
-- (não partilhados entre contas — cada uma tem a sua cópia idêntica).
-- A 0008 corrigiu o DEFAULT para 0, mas só para inserções futuras,
-- avisando explicitamente que as linhas já existentes ficavam por corrigir.
--
-- As contas da esposa e da colega Elisa foram criadas antes da 0008 e
-- ficaram com essa cópia. Como /perdas (Auditoria de Perdas) lê esses
-- campos sem verificar contract_regime, uma conta em regime horista via
-- ali os números "de exemplo" (que por coincidência eram os valores reais
-- de outra conta) em vez de 0€/não aplicável.
--
-- Esta migração faz o backfill que a 0008 avisou não ter feito, apenas
-- para contas em regime horista (onde estes campos nunca se aplicam).
update public.user_settings
set
  base_salary = 0,
  fixed_bonus = 0,
  agreed_total_salary = 0,
  overtime_fixed_rate = 0,
  extra_meal_value = 0
where contract_regime = 'hourly';
