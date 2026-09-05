-- supabase/migrations/0010_subsidy_overrides_and_receipts.sql
-- Pedido por Ricardo (04/09/2026), a pensar em partilhar a app com colegas
-- da mesma empresa: lá, o subsídio de férias não é automático — cada
-- trabalhador tem de o pedir, e o mês em que cai muda de ano para ano
-- (ex: 2026 pedido para outubro, mas a partir de 2027 volta a ser pedido
-- em janeiro). Isto adiciona:
--   1. subsidy_payment_overrides: registo por ano de em que mês cada
--      subsídio (férias/Natal) foi efetivamente pedido/recebido, para
--      substituir o mês "padrão" configurado em user_settings só nesse ano.
--   2. payslip_receipts: os valores de um recibo real de um mês (para
--      comparar com o que a app calcula que devia ser recebido) + o PDF
--      do recibo em si, guardado no bucket de storage 'receipts'.

-- ---------------------------------------------------------------------
-- 1. Override anual do mês de pagamento dos subsídios
-- ---------------------------------------------------------------------
create table public.subsidy_payment_overrides (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  reference_year  int not null check (reference_year between 2000 and 2100),
  subsidy_type    text not null check (subsidy_type in ('holiday', 'christmas')),
  received_month  int not null check (received_month between 1 and 12),
  received_day    int check (received_day between 1 and 31),
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, reference_year, subsidy_type)
);

comment on table public.subsidy_payment_overrides is
  'Substituições anuais do mês em que um subsídio (férias/Natal) foi pedido/recebido, para empresas onde isso não é automático nem sempre no mesmo mês. Sem registo para o ano em curso, usa-se o mês padrão em user_settings (holiday_subsidy_month/christmas_subsidy_month).';

create index idx_subsidy_overrides_user_year on public.subsidy_payment_overrides (user_id, reference_year);

create trigger trg_subsidy_overrides_updated_at
  before update on public.subsidy_payment_overrides
  for each row execute function public.set_updated_at();

alter table public.subsidy_payment_overrides enable row level security;

create policy "subsidy_overrides_select_own" on public.subsidy_payment_overrides
  for select using (auth.uid() = user_id);
create policy "subsidy_overrides_insert_own" on public.subsidy_payment_overrides
  for insert with check (auth.uid() = user_id);
create policy "subsidy_overrides_update_own" on public.subsidy_payment_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subsidy_overrides_delete_own" on public.subsidy_payment_overrides
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2. Recibos reais anexados, por mês, para comparação recebido vs. devido
-- ---------------------------------------------------------------------
create table public.payslip_receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  reference_year  int not null check (reference_year between 2000 and 2100),
  reference_month int not null check (reference_month between 1 and 12),

  -- Valores tal como aparecem no recibo real (todos opcionais — preenche-se
  -- só o que se sabe/quer comparar).
  received_base_salary       numeric(10,2),
  received_bonus             numeric(10,2), -- "Gratificação" / prémio
  received_overtime          numeric(10,2),
  received_meal_allowance    numeric(10,2),
  received_holiday_subsidy   numeric(10,2),
  received_christmas_subsidy numeric(10,2),
  received_social_security   numeric(10,2),
  received_irs               numeric(10,2),
  received_net_pay           numeric(10,2),

  -- Caminho do PDF no bucket de storage 'receipts' (formato:
  -- "<user_id>/<ano>-<mes>-<uuid>.pdf"), null se não foi anexado ficheiro.
  file_path       text,
  file_name       text,
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, reference_year, reference_month)
);

comment on table public.payslip_receipts is
  'Um recibo de vencimento real por mês, para comparação com o valor calculado pela app (o que a lei/o contrato exige) e para consulta futura. file_path aponta para o PDF no bucket de storage "receipts".';

create index idx_payslip_receipts_user_period on public.payslip_receipts (user_id, reference_year, reference_month);

create trigger trg_payslip_receipts_updated_at
  before update on public.payslip_receipts
  for each row execute function public.set_updated_at();

alter table public.payslip_receipts enable row level security;

create policy "payslip_receipts_select_own" on public.payslip_receipts
  for select using (auth.uid() = user_id);
create policy "payslip_receipts_insert_own" on public.payslip_receipts
  for insert with check (auth.uid() = user_id);
create policy "payslip_receipts_update_own" on public.payslip_receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payslip_receipts_delete_own" on public.payslip_receipts
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. Bucket de storage privado para os PDFs dos recibos
-- ---------------------------------------------------------------------
-- Convenção de caminho: "<user_id>/<qualquer-coisa>" — as políticas abaixo
-- restringem cada utilizador à sua própria pasta (storage.foldername(name)
-- devolve os segmentos do caminho antes do nome do ficheiro).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_select_own_folder" on storage.objects
  for select using (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "receipts_insert_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "receipts_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "receipts_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
  );
