import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LossAuditClient } from '@/components/audit/LossAuditClient';
import type { IrsTaxBracket, UserSettings } from '@/types/database.types';

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

  // Esta auditoria compara o "salário base + prémio" declarado na folha com
  // o ordenado real acordado — um cenário específico de Contrato Efetivo.
  // Em regime horista não existe essa divisão, por isso não faz sentido
  // (e, historicamente, os campos usados aqui podiam ainda conter valores
  // de exemplo copiados de outra conta — ver migração 0011).
  if (typedSettings.contract_regime !== 'effective') {
    return (
      <div className="flex justify-center py-12">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          A Auditoria de Perdas aplica-se apenas ao regime de{' '}
          <strong className="text-foreground">Contrato Efetivo</strong>, que compara o salário
          declarado na folha com o ordenado real acordado. Em regime{' '}
          <strong className="text-foreground">Horista</strong> este comparativo não se aplica.
        </p>
      </div>
    );
  }

  const { data: brackets } = await supabase
    .from('irs_tax_brackets')
    .select('*')
    .eq('user_settings_id', settings.id);

  return (
    <div className="py-6">
      <LossAuditClient
        initialSettings={typedSettings}
        brackets={(brackets ?? []) as IrsTaxBracket[]}
      />
    </div>
  );
}
