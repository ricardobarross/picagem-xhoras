import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContractSettingsForm } from '@/components/settings/ContractSettingsForm';
import { RatesForm } from '@/components/settings/RatesForm';
import { DescontosForm } from '@/components/settings/DescontosForm';
import { SubsidyOverridesForm } from '@/components/settings/SubsidyOverridesForm';
import type { IrsTaxBracket, SubsidyPaymentOverride, UserSettings } from '@/types/database.types';

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
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

  const { data: subsidyOverrides } = await supabase
    .from('subsidy_payment_overrides')
    .select('*')
    .eq('user_id', user.id);

  const isEffective = typedSettings.contract_regime === 'effective';

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight">Configurações de Remuneração e Contrato</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gere os teus termos contratuais, perfil fiscal em Portugal, escalões de IRS e taxas de Segurança Social.
        </p>
      </div>

      {/* Formulário Principal: Contrato Efetivo e Perfil Fiscal */}
      <ContractSettingsForm userId={user.id} initialSettings={typedSettings} />

      {/* Se o trabalhador estiver em regime horista, mostra o formulário de tarifas horárias */}
      {!isEffective && (
        <RatesForm userId={user.id} initialSettings={typedSettings} />
      )}

      {/* Quando os subsídios de férias/Natal foram pedidos/recebidos, ano a ano
          (só relevante em Contrato Efetivo) */}
      {isEffective && (
        <SubsidyOverridesForm
          userId={user.id}
          initialSettings={typedSettings}
          initialOverrides={(subsidyOverrides ?? []) as SubsidyPaymentOverride[]}
        />
      )}

      {/* Formulário de Segurança Social e Escalões de IRS */}
      <DescontosForm
        userId={user.id}
        initialSettings={typedSettings}
        initialBrackets={(brackets ?? []) as IrsTaxBracket[]}
      />
    </div>
  );
}
