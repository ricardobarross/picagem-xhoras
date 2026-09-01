import { createClient } from '@/lib/supabase/server';
import { RatesForm } from '@/components/settings/RatesForm';
import { DescontosForm } from '@/components/settings/DescontosForm';
import type { IrsTaxBracket, UserSettings } from '@/types/database.types';

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user!.id)
    .single();

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há configurações guardadas para esta conta.
      </p>
    );
  }

  const typedSettings = settings as UserSettings;

  const { data: brackets } = await supabase
    .from('irs_tax_brackets')
    .select('*')
    .eq('user_settings_id', typedSettings.id)
    .order('min_income', { ascending: true });

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <RatesForm userId={user!.id} initialSettings={typedSettings} />
      <DescontosForm
        userId={user!.id}
        initialSettings={typedSettings}
        initialBrackets={(brackets ?? []) as IrsTaxBracket[]}
      />
    </div>
  );
}
