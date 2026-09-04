// types/database.types.ts
// Tipos manuais alinhados com supabase/migrations/0001_init.sql + 0002_simplify.sql
// + 0003_declared_income.sql + 0004_official_irs_brackets.sql.
// Em produção, substituir/gerar via:
//   npx supabase gen types typescript --project-id <id> > types/database.types.ts
//
// IMPORTANTE: usar sempre `type` (nunca `interface`) para os tipos de
// linha usados dentro de `Database`. Uma `interface` aqui faz a cadeia de
// tipos genéricos do @supabase/postgrest-js colapsar silenciosamente para
// `never` em `.insert()`/`.update()` — é por isto que o `supabase gen
// types` oficial gera sempre `type`, nunca `interface`.

// Tipo genérico de valor JSON, igual ao que `supabase gen types typescript`
// produz — usado nos parâmetros/retorno de funções RPC (jsonb).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PaymentMethod = 'card' | 'cash';
export type BonusPaymentType = 'lump_sum' | 'monthly_installments';
export type TransportFrequency = 'daily' | 'monthly';
export type PaidBy = 'employee' | 'employer';
export type IrsCalculationType = 'fixed_rate' | 'bracket';
export type ContractRegime = 'effective' | 'hourly';
export type IrsMaritalStatus = 'single' | 'married_1_earner' | 'married_2_earners';
export type FiscalRegion = 'continente' | 'acores' | 'madeira';
export type SubsidyMode = 'full_in_month' | 'duodecimos';
// work = dia normal trabalhado; unjustified_absence = falta injustificada
// (hours_worked guarda as horas em falta); sick_leave = baixa médica (um
// registo = um dia inteiro, hours_worked não é usado); justified_absence =
// falta justificada (Art. 255º CT, um registo = um dia, sem desconto).
export type TimeEntryType = 'work' | 'unjustified_absence' | 'sick_leave' | 'justified_absence';

// Categoria do dia, derivada da data (dia da semana) — não é guardada em
// lado nenhum, é sempre calculada a partir de `entry_date`.
export type DayCategory = 'weekday' | 'saturday' | 'sunday' | 'holiday';

export type Profile = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  id: string;
  user_id: string;

  // Regime de trabalho: 'effective' (contrato sem termo / TCO) ou 'hourly' (prestador / à hora)
  contract_regime: ContractRegime;
  base_salary: number; // Ex: 1500€
  fixed_bonus: number; // Ex: 500€
  agreed_total_salary: number; // Ex: 2000€ (acordado, usado para auditoria de perdas)
  overtime_fixed_rate: number; // Ex: 12€/h
  extra_meal_value: number; // Ex: 9.50€

  // Perfil fiscal de retenção na fonte em Portugal (Art. 99º CIRS)
  irs_marital_status: IrsMaritalStatus;
  irs_dependents_count: number;
  irs_has_disability: boolean;
  fiscal_region: FiscalRegion;

  // Calendário de subsídios de Férias e Natal
  holiday_subsidy_month: number; // 1 = Janeiro, etc.
  christmas_subsidy_month: number; // 11 = Novembro, etc.
  subsidy_mode: SubsidyMode;

  // Tarifário (usado no modo horista): dia útil é o valor base; sábado = dia útil + extra; domingo
  // = dia útil × multiplicador (por defeito 2, ou seja, o dobro).
  weekday_rate: number;
  saturday_extra_per_hour: number;
  sunday_multiplier: number;

  // Ciclo de pagamento: a folha fecha neste dia do mês (por defeito 20) e
  // paga-se no dia 1 do mês seguinte ao fecho.
  payroll_cutoff_day: number;

  meal_allowance_daily_value: number;
  meal_allowance_payment_method: PaymentMethod;
  meal_allowance_taxable: boolean;

  bonus_payment_type: BonusPaymentType;
  bonus_lump_sum_month: number | null;

  transport_allowance_value: number;
  transport_allowance_frequency: TransportFrequency;

  health_insurance_value: number;
  health_insurance_paid_by: PaidBy;

  social_security_rate: number;
  irs_calculation_type: IrsCalculationType;
  irs_fixed_rate: number;

  // Se true, sábado/domingo entram na base declarada (SS + IRS). Por
  // defeito (false) só os dias úteis + subsídios tributáveis contam —
  // cada trabalhador negoceia isto de forma diferente com o patrão.
  declare_weekend_income: boolean;

  currency: string;
  created_at: string;
  updated_at: string;
};

export type IrsTaxBracket = {
  id: string;
  user_settings_id: string;
  min_income: number;
  max_income: number | null;
  rate: number;
  deduction: number;
  created_at: string;
};

// Tabela de referência (não editável na app) com os escalões gerais de
// IRS do Continente por ano fiscal — usada só para pré-preencher
// `irs_tax_brackets` a partir do botão "Carregar escalões oficiais".
export type IrsOfficialBracket = {
  id: string;
  fiscal_year: number;
  min_income: number;
  max_income: number | null;
  rate: number;
  deduction: number;
  created_at: string;
};

// Um registo por dia: a data, o tipo (trabalho/falta/baixa) e, para dias
// de trabalho ou falta injustificada, quantas horas. Sábado/domingo/dia
// útil é sempre deduzido de `entry_date`.
export type TimeEntry = {
  id: string;
  user_id: string;
  entry_date: string; // "YYYY-MM-DD"
  entry_type: TimeEntryType;
  // Obrigatório para 'work'/'unjustified_absence' (horas); null/ignorado
  // para 'sick_leave'/'justified_absence' (um registo = um dia inteiro).
  hours_worked: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Estrutura mínima esperada pelo @supabase/postgrest-js (GenericSchema):
// cada tabela precisa de Row/Insert/Update/Relationships, e o schema de
// Tables/Views/Functions. Em produção, substituir tudo isto por
// `supabase gen types typescript`, que gera este ficheiro automaticamente
// a partir do schema real.
export type Database = {
  // Marcador usado pela cadeia de tipos genéricos do supabase-js/postgrest-js
  // para resolver corretamente as opções do cliente (ClientOptions) e, com
  // isso, os tipos de Row/Insert/Update por tabela. Sem isto, `.from(...)`
  // acaba a resolver para tipos genéricos (ex.: Insert vira `never`).
  // O `supabase gen types typescript` real já inclui este campo.
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: Partial<UserSettings> & { user_id: string };
        Update: Partial<UserSettings>;
        Relationships: [];
      };
      irs_tax_brackets: {
        Row: IrsTaxBracket;
        Insert: Partial<IrsTaxBracket> & { user_settings_id: string; min_income: number; rate: number };
        Update: Partial<IrsTaxBracket>;
        Relationships: [];
      };
      time_entries: {
        Row: TimeEntry;
        Insert: Partial<TimeEntry> & { user_id: string; entry_date: string };
        Update: Partial<TimeEntry>;
        Relationships: [];
      };
      irs_official_brackets: {
        Row: IrsOfficialBracket;
        Insert: Partial<IrsOfficialBracket> & { fiscal_year: number; min_income: number; rate: number; deduction: number };
        Update: Partial<IrsOfficialBracket>;
        Relationships: [];
      };
    };
    // Convenção usada pelo próprio `supabase gen types typescript` para
    // "sem views": um mapped type sobre `never` (sem índice de
    // assinatura). Usar Record<string, never> aqui colapsaria Tables
    // inteiro para `never` ao ser intersetado em TablesAndViews.
    Views: { [_ in never]: never };
    Functions: {
      // supabase/migrations/0006_atomic_irs_brackets.sql — substitui os
      // escalões de IRS de um user_settings numa única transação atómica
      // (ver DescontosForm.tsx), em vez do antigo delete+insert em dois
      // pedidos HTTP separados.
      replace_irs_tax_brackets: {
        Args: {
          p_user_settings_id: string;
          p_brackets: Json;
        };
        Returns: undefined;
      };
    };
  };
};
