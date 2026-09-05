import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RecibosClient } from '@/components/receipts/RecibosClient';
import type { IrsTaxBracket, PayslipReceipt, SubsidyPaymentOverride, UserSettings } from '@/types/database.types';

export const metadata = {
  title: 'Recibos Reais | Picagem X€Horas',
  description: 'Anexa os teus recibos de vencimento reais e compara com o que a app calcula que devias receber.',
};

export default async function RecibosPage() {
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
      <div className="flex justify-center py-12">
        <p className="text-sm text-muted-foreground">
          Configurações ainda não criadas. Acede a{' '}
          <a href="/configuracoes" className="underline text-primary">
            Configurações
          </a>{' '}
          para iniciar.
        </p>
      </div>
    );
  }

  const typedSettings = settings as UserSettings;

  const [{ data: brackets }, { data: overrides }, { data: receipts }] = await Promise.all([
    supabase.from('irs_tax_brackets').select('*').eq('user_settings_id', typedSettings.id),
    supabase.from('subsidy_payment_overrides').select('*').eq('user_id', user.id),
    supabase
      .from('payslip_receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('reference_year', { ascending: false })
      .order('reference_month', { ascending: false }),
  ]);

  return (
    <div className="py-6">
      <RecibosClient
        userId={user.id}
        settings={typedSettings}
        brackets={(brackets ?? []) as IrsTaxBracket[]}
        overrides={(overrides ?? []) as SubsidyPaymentOverride[]}
        initialReceipts={(receipts ?? []) as PayslipReceipt[]}
      />
    </div>
  );
}
