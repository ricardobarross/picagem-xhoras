import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LossAuditClient } from '@/components/audit/LossAuditClient';
import { hasAuditableDivergence } from '@/lib/loss-calculator';
import type {
  IrsTaxBracket,
  PayslipReceipt,
  Profile,
  SubsidyPaymentOverride,
  UserSettings,
} from '@/types/database.types';

export const metadata = {
  title: 'Auditoria de Perdas Contratuais | Picagem XHoras',
  description: 'Análise de perdas financeiras e direitos laborais sonegados com base no Código do Trabalho.',
};

export default async function PerdasPage() {
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

  // A Auditoria só compara o que é pago com o que a lei exige quando há
  // mesmo uma divergência configurada (ex: prémio separado do salário
  // base, hora extra abaixo do mínimo legal, refeições extras pagas em
  // prémio). Sem isso é informação desnecessária — fica oculta (pedido
  // por Ricardo, 05/09/2026).
  if (!hasAuditableDivergence(typedSettings)) {
    return (
      <div className="flex justify-center py-12">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Não há nenhuma divergência a reportar com as configurações atuais — a Auditoria de
          Perdas só aparece quando existe uma diferença entre o que está configurado em{' '}
          <a href="/configuracoes" className="underline text-primary">
            Configurações
          </a>{' '}
          e o que a lei exige (ex: salário dividido em base + prémio, hora extra abaixo do
          mínimo legal, ou refeições extras pagas em prémio).
        </p>
      </div>
    );
  }

  const [{ data: brackets }, { data: receipts }, { data: overrides }, { data: profile }] = await Promise.all([
    supabase.from('irs_tax_brackets').select('*').eq('user_settings_id', settings.id),
    supabase.from('payslip_receipts').select('*').eq('user_id', user.id),
    supabase.from('subsidy_payment_overrides').select('*').eq('user_id', user.id),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ]);

  const typedProfile = profile as Profile | null;
  const userName = typedProfile?.full_name?.trim() || user.email?.split('@')[0] || 'Utilizador';
  const companyName = typedProfile?.company_name?.trim() || null;

  return (
    <div className="py-6">
      <LossAuditClient
        initialSettings={typedSettings}
        brackets={(brackets ?? []) as IrsTaxBracket[]}
        receipts={(receipts ?? []) as PayslipReceipt[]}
        overrides={(overrides ?? []) as SubsidyPaymentOverride[]}
        userName={userName}
        companyName={companyName}
      />
    </div>
  );
}
