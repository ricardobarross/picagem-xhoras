'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    // Navegação completa (não router.push do Next.js): um push+refresh só
    // invalida os dados da rota atual, mas as outras páginas já visitadas
    // (ex: /perdas, /dashboard) ficam em cache no cliente (Router Cache).
    // Se outra pessoa usar o mesmo telemóvel/browser a seguir e entrar
    // numa conta diferente, podia ver esse HTML antigo — com os dados de
    // quem tinha sessão aberta antes — até a cache expirar. Um reload
    // completo da página limpa tudo (caso real: Ricardo, 07/09/2026).
    window.location.href = '/login';
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut}>
      Sair
    </Button>
  );
}
