// app/(app)/ponto/page.tsx
// Server Component: busca os registos do mês atual e entrega-os já
// prontos ao componente cliente, evitando um pedido extra no browser.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PontoClient } from '@/components/time-tracker/PontoClient';
import { toDateOnlyString } from '@/lib/time-utils';

export default async function PontoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const now = new Date();
  const start = toDateOnlyString(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = toDateOnlyString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data: entries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('entry_date', start)
    .lte('entry_date', end);

  return (
    <div className="flex justify-center py-10">
      <PontoClient userId={user.id} initialEntries={entries ?? []} />
    </div>
  );
}
