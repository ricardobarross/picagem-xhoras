// lib/supabase/client.ts
// Cliente Supabase para uso em Client Components ("use client").
// Usa @supabase/ssr para partilhar a sessão via cookies com o servidor.

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
