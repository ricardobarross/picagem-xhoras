import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/ponto', label: 'Picagem' },
  { href: '/perdas', label: 'Auditoria de Perdas', highlight: true },
  { href: '/configuracoes', label: 'Configurações' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight hover:opacity-90">
            Picagem X€Horas
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_ITEMS.map((item) => (
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
