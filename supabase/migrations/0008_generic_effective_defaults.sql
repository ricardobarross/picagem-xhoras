-- supabase/migrations/0008_generic_effective_defaults.sql
-- Privacidade: a migração 0005 tinha os defaults de base_salary (1500),
-- fixed_bonus (500), agreed_total_salary (2000), overtime_fixed_rate (12)
-- e extra_meal_value (9.50) copiados do caso real de um utilizador
-- específico. Como handle_new_user() insere a linha de user_settings só
-- com user_id (o resto vem dos defaults da coluna), QUALQUER conta nova
-- nascia já com esses valores como se fossem "sugeridos" — mostrando o
-- Modo Contrato Efetivo ativo com o salário de outra pessoa antes mesmo
-- de a conta configurar nada.
--
-- Isto só altera o DEFAULT para inserções futuras — não toca nas linhas
-- já existentes, por isso as configurações reais já guardadas por
-- utilizadores atuais mantêm-se exatamente como estão.
alter table public.user_settings
  alter column base_salary set default 0,
  alter column fixed_bonus set default 0,
  alter column agreed_total_salary set default 0,
  alter column overtime_fixed_rate set default 0,
  alter column extra_meal_value set default 0;
