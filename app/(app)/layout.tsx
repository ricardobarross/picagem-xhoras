import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/ponto', label: 'Picagem' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Picagem X€Horas</span>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
                {item.label}
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
