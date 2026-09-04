-- supabase/migrations/0006_atomic_irs_brackets.sql
-- Corrige o achado F-04 da auditoria técnica (04/09/2026): a gravação dos
-- escalões de IRS de cada utilizador fazia um DELETE seguido de um INSERT
-- como dois pedidos HTTP separados a partir do browser (DescontosForm.tsx).
-- Se a ligação caísse entre as duas chamadas, o utilizador perdia todos os
-- escalões configurados sem ficarem substituídos pelos novos.
--
-- Esta função corre as duas operações dentro da mesma invocação de função
-- em PL/pgSQL — que o Postgres executa sempre como parte da transação
-- implícita do próprio SELECT/CALL que a chama — por isso um erro a meio
-- do INSERT desfaz também o DELETE anterior, nunca deixando a tabela
-- num estado intermédio.

create or replace function public.replace_irs_tax_brackets(
  p_user_settings_id uuid,
  p_brackets jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Confirma a posse do user_settings antes de mexer em qualquer linha.
  -- Redundante com as políticas de RLS de irs_tax_brackets (que também
  -- validam via user_settings.user_id = auth.uid()), mas dá um erro mais
  -- claro do que uma falha silenciosa de RLS.
  if not exists (
    select 1 from public.user_settings us
    where us.id = p_user_settings_id and us.user_id = auth.uid()
  ) then
    raise exception 'Não autorizado a alterar os escalões deste user_settings.';
  end if;

  delete from public.irs_tax_brackets
  where user_settings_id = p_user_settings_id;

  insert into public.irs_tax_brackets (user_settings_id, min_income, max_income, rate, deduction)
  select
    p_user_settings_id,
    (elem ->> 'min_income')::numeric,
    nullif(elem ->> 'max_income', '')::numeric,
    (elem ->> 'rate')::numeric,
    coalesce((elem ->> 'deduction')::numeric, 0)
  from jsonb_array_elements(p_brackets) as elem;
end;
$$;

comment on function public.replace_irs_tax_brackets(uuid, jsonb) is
  'Substitui atomicamente os escalões de IRS de um user_settings (delete + insert numa única invocação de função, evitando o estado intermédio "sem escalões" caso a ligação caia a meio — achado F-04 da auditoria de 04/09/2026).';

-- authenticated precisa de poder chamar a função (o grant de EXECUTE a
-- PUBLIC criado por defeito já cobre isto, mas fica explícito).
grant execute on function public.replace_irs_tax_brackets(uuid, jsonb) to authenticated;
