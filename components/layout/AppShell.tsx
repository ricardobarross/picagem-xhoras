'use client';

// components/layout/AppShell.tsx
// Casca de navegação da app: sidebar retrátil no desktop, barra de abas no
// fundo no telemóvel, cabeçalho com o nome de quem tem sessão iniciada e
// assinatura fixa "App criado por Ricardo Barros". Substitui o menu
// horizontal antigo (pedido por Ricardo, 09/09/2026: "não quero o menu do
// jeito que ta la em cima, prefiro ele um botão lateral para expandir" +
// "quero que fique o nome da pessoa logada no cabeçalho" + "quero isso com
// cara de App mesmo, não quero com aparencia de site").
//
// O estado de expandido/colapsado da sidebar fica em localStorage (só
// afeta o desktop) para lembrar a preferência entre sessões — envolvido em
// try/catch porque localStorage pode não estar disponível (modo privado,
// SSR na primeira renderização).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Clock,
  Receipt,
  Scale,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';

export interface AppNavItem {
  href: string;
  label: string;
  highlight?: boolean;
}

const ICONS: Record<string, typeof LayoutDashboard> = {
  '/dashboard': LayoutDashboard,
  '/ponto': Clock,
  '/recibos': Receipt,
  '/perdas': Scale,
  '/configuracoes': Settings,
};

const SIDEBAR_STORAGE_KEY = 'xhoras-sidebar-expanded';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppShell({
  navItems,
  userName,
  companyName,
  children,
}: {
  navItems: AppNavItem[];
  userName: string;
  companyName?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  // Só depois de montar no cliente (a leitura tem de acontecer depois da
  // hidratação — o servidor não tem localStorage, por isso o primeiro
  // render é sempre "expandida" e só aqui é que pode mudar). Sincroniza com
  // localStorage, um sistema externo — não com outro estado React — por
  // isso o setState síncrono aqui é o padrão correto, não o anti-padrão que
  // a regra normalmente apanha.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setExpanded(stored === '1');
    } catch {
      // localStorage indisponível — mantém o valor por defeito (expandida).
    }
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignora — preferência simplesmente não persiste
      }
      return next;
    });
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const activeItem = navItems.find((item) => isActive(item.href));
  const avatarInitials = initials(userName);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — só no desktop (md+) */}
      <aside
        className={`no-print hidden md:flex md:flex-shrink-0 md:flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] py-5 transition-[width] duration-200 ${
          expanded ? 'md:w-60' : 'md:w-[76px]'
        }`}
      >
        <div className={`flex items-center gap-2.5 px-4 mb-6 ${expanded ? '' : 'justify-center'}`}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-primary text-sm font-extrabold text-primary-foreground tracking-tight">
            X€
          </div>
          {expanded && (
            <span className="whitespace-nowrap text-[14.5px] font-bold tracking-tight text-foreground">
              Picagem X€Horas
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'Colapsar menu' : 'Expandir menu'}
          className={`mb-5 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px] border border-[var(--sidebar-border)] bg-card text-muted-foreground ${
            expanded ? 'self-end mr-4' : 'self-center'
          }`}
        >
          {expanded ? <ChevronLeft className="h-[15px] w-[15px]" /> : <ChevronRight className="h-[15px] w-[15px]" />}
        </button>

        <nav className="flex flex-col gap-0.5 px-3">
          {navItems.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] transition-colors ${
                  expanded ? '' : 'justify-center'
                } ${
                  active
                    ? 'bg-[var(--accent-soft)] font-bold text-[var(--accent-dark)]'
                    : 'font-medium text-muted-foreground hover:bg-card'
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {expanded && (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {item.label}
                    {item.highlight && (
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--warn)]" />
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--sidebar-border)] px-4 pt-3.5">
          {expanded ? (
            <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
              App criado por
              <br />
              <strong className="font-semibold text-muted-foreground">Ricardo Barros</strong>
            </p>
          ) : (
            <p className="text-center text-[10px] font-bold text-[var(--text-faint)]">RB</p>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        {/* Cabeçalho */}
        <header className="no-print flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-7">
          <span className="text-[16.5px] font-bold tracking-tight">
            {activeItem?.label ?? 'Picagem X€Horas'}
          </span>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[13px] font-semibold leading-tight">{userName}</div>
              {companyName && (
                <div className="text-[11.5px] leading-tight text-muted-foreground">{companyName}</div>
              )}
            </div>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[13px] font-bold text-[var(--accent-dark)]">
              {avatarInitials}
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 sm:px-7 md:pb-6">{children}</main>

        {/* Barra de abas — só no telemóvel */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] px-1 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:hidden">
          {navItems.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-0.5 text-[10px] ${
                  active ? 'font-bold text-[var(--accent-dark)]' : 'font-medium text-[var(--text-faint)]'
                }`}
              >
                {item.highlight && (
                  <span className="absolute right-1 top-0 h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
                )}
                <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.1 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
