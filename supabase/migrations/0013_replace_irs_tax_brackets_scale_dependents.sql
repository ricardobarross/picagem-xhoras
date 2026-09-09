-- supabase/migrations/0013_replace_irs_tax_brackets_scale_dependents.sql
-- Atualiza a função replace_irs_tax_brackets (migração 0006) para também
-- gravar `scale` e `dependent_deduction` por escalão — necessário desde a
-- migração 0012 (Tabelas mensais de retenção I/II/III), que deixou de usar
-- só a escala anual do art. 68º CIRS. Escalões antigos/manuais sem estes
-- campos continuam a funcionar (default 'annual'/0, tal como antes).

create or replace function public.replace_irs_tax_brackets(p_user_settings_id uuid, p_brackets jsonb)
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.user_settings us
    where us.id = p_user_settings_id and us.user_id = auth.uid()
  ) then
    raise exception 'Não autorizado a alterar os escalões deste user_settings.';
  end if;

  delete from public.irs_tax_brackets
  where user_settings_id = p_user_settings_id;

  insert into public.irs_tax_brackets (user_settings_id, min_income, max_income, rate, deduction, scale, dependent_deduction)
  select
    p_user_settings_id,
    (elem ->> 'min_income')::numeric,
    nullif(elem ->> 'max_income', '')::numeric,
    (elem ->> 'rate')::numeric,
    coalesce((elem ->> 'deduction')::numeric, 0),
    coalesce(elem ->> 'scale', 'annual'),
    coalesce((elem ->> 'dependent_deduction')::numeric, 0)
  from jsonb_array_elements(p_brackets) as elem;
end;
$function$;
