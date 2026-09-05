import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { createClient } from '@/lib/supabase/server';
import { hasAuditableDivergence } from '@/lib/loss-calculator';
import type { UserSettings } from '@/types/database.types';

interface NavItem {
  href: string;
  label: string;
  highlight?: boolean;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/ponto', label: 'Picagem' },
  { href: '/recibos', label: 'Recibos' },
  { href: '/configuracoes', label: 'Configurações' },
];

const AUDIT_NAV_ITEM: NavItem = { href: '/perdas', label: 'Auditoria de Perdas', highlight: true };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A Auditoria de Perdas só interessa mostrar na navegação quando há
  // mesmo uma divergência a reportar (ver hasAuditableDivergence) —
  // caso contrário é um link para uma página vazia (pedido por Ricardo,
  // 05/09/2026).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let showAuditNav = false;
  if (user) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (settings) {
      showAuditNav = hasAuditableDivergence(settings as UserSettings);
    }
  }

  const navItems: NavItem[] = showAuditNav
    ? [BASE_NAV_ITEMS[0], BASE_NAV_ITEMS[1], AUDIT_NAV_ITEM, ...BASE_NAV_ITEMS.slice(2)]
    : BASE_NAV_ITEMS;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight hover:opacity-90">
            Picagem X€Horas
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  item.highlight
                    ? 'inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 font-medium text-red-600 hover:bg-red-500/20 transition-colors'
                    : 'text-muted-foreground hover:text-foreground transition-colors'
                }
              >
                {item.label}
                {item.highlight && (
                  <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </Link>
            ))}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
