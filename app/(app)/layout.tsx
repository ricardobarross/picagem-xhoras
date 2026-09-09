import { redirect } from 'next/navigation';
import { AppShell, type AppNavItem } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/server';
import { hasAuditableDivergence } from '@/lib/loss-calculator';
import type { Profile, UserSettings } from '@/types/database.types';

const BASE_NAV_ITEMS: AppNavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/ponto', label: 'Picagem' },
  { href: '/recibos', label: 'Recibos' },
  { href: '/configuracoes', label: 'Configurações' },
];

const AUDIT_NAV_ITEM: AppNavItem = { href: '/perdas', label: 'Auditoria de Perdas', highlight: true };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', user.id).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ]);

  // A Auditoria de Perdas só interessa mostrar na navegação quando há
  // mesmo uma divergência a reportar (ver hasAuditableDivergence) —
  // caso contrário é um link para uma página vazia (pedido por Ricardo,
  // 05/09/2026).
  let showAuditNav = false;
  if (settings) {
    showAuditNav = hasAuditableDivergence(settings as UserSettings);
  }

  const navItems: AppNavItem[] = showAuditNav
    ? [BASE_NAV_ITEMS[0], BASE_NAV_ITEMS[1], AUDIT_NAV_ITEM, ...BASE_NAV_ITEMS.slice(2)]
    : BASE_NAV_ITEMS;

  const typedProfile = profile as Profile | null;
  // Sem nome preenchido em Configurações, cai para a parte local do email
  // (nunca fica em branco no cabeçalho).
  const userName = typedProfile?.full_name?.trim() || user.email?.split('@')[0] || 'Utilizador';
  const companyName = typedProfile?.company_name?.trim() || null;

  return (
    <AppShell navItems={navItems} userName={userName} companyName={companyName}>
      {children}
    </AppShell>
  );
}
