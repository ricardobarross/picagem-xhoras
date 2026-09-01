// app/(app)/ponto/page.tsx
// Server Component: busca o turno em aberto (se existir) e entrega-o
// já pronto ao componente cliente, evitando um pedido extra no browser.

import { createClient } from '@/lib/supabase/server';
import { TimeTracker } from '@/components/time-tracker/TimeTracker';

export default async function PontoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: openEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user!.id)
    .eq('status', 'in_progress')
    .maybeSingle();

  return (
    <div className="flex justify-center py-10">
      <TimeTracker initialEntry={openEntry ?? null} />
    </div>
  );
}
