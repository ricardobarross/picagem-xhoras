// types/database.types.ts
// Tipos manuais alinhados com supabase/migrations/0001_init.sql.
// Em produção, substituir/gerar via:
//   npx supabase gen types typescript --project-id <id> > types/database.types.ts
//
// IMPORTANTE: usar sempre `type` (nunca `interface`) para os tipos de
// linha usados dentro de `Database`. Uma `interface` aqui faz a cadeia de
// tipos genéricos do @supabase/postgrest-js colapsar silenciosamente para
// `never` em `.insert()`/`.update()` — é por isto que o `supabase gen
// types` oficial gera sempre `type`, nunca `interface`.

export type RateType = 'fixed' | 'percentage';
export type PaymentMethod = 'card' | 'cash';
export type BonusPaymentType = 'lump_sum' | 'monthly_installments';
export type TransportFrequency = 'daily' | 'monthly';
export type PaidBy = 'employee' | 'employer';
export type IrsCalculationType = 'fixed_rate' | 'bracket';
export type DayType = 'normal' | 'saturday' | 'sunday' | 'holiday';
export type EntryStatus = 'in_progress' | 'completed';
export type EntrySource = 'clock' | 'manual';

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

  base_hourly_rate: number;

  saturday_rate_type: RateType;
  saturday_rate_value: number;
  sunday_rate_type: RateType;
  sunday_rate_value: number;
  holiday_rate_type: RateType;
  holiday_rate_value: number;
  night_shift_rate_type: RateType;
  night_shift_rate_value: number;
  night_shift_start_time: string; // "HH:MM:SS"
  night_shift_end_time: string;

  overtime_daily_threshold_hours: number;
  overtime_tier1_percentage: number;
  overtime_tier1_max_hours: number;
  overtime_tier2_percentage: number;

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

export type TimeEntry = {
  id: string;
  user_id: string;
  entry_date: string; // "YYYY-MM-DD"
  clock_in: string | null; // ISO timestamptz
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
  day_type: DayType;
  night_shift_override: boolean | null;
  status: EntryStatus;
  source: EntrySource;
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
        Insert: Partial<IrsTaxBracket>;
        Update: Partial<IrsTaxBracket>;
        Relationships: [];
      };
      time_entries: {
        Row: TimeEntry;
        Insert: Partial<TimeEntry> & { user_id: string; entry_date: string };
        Update: Partial<TimeEntry>;
        Relationships: [];
      };
    };
    // Convenção usada pelo próprio `supabase gen types typescript` para
    // "sem views/funções": um mapped type sobre `never` (sem índice de
    // assinatura). Usar Record<string, never> aqui colapsaria Tables
    // inteiro para `never` ao ser intersetado em TablesAndViews.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
};
