import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LossAuditClient } from '@/components/audit/LossAuditClient';
import type { UserSettings } from '@/types/database.types';

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

  return (
    <div className="py-6">
      <LossAuditClient initialSettings={settings as UserSettings} />
    </div>
  );
}
