'use client';

// components/settings/ProfileForm.tsx
// Nome e empresa de quem tem sessão iniciada — usados no cabeçalho da app
// (sidebar/topo) e na identificação do Laudo de Auditoria. Pedido por
// Ricardo (09/09/2026): "quero que fique o nome da pessoa logada no
// cabeçalho". Sem isto preenchido, a app cai para a parte local do email.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const INPUT_CLASS = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export function ProfileForm({ userId, initialProfile }: { userId: string; initialProfile: Profile | null }) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '');
  const [companyName, setCompanyName] = useState(initialProfile?.company_name ?? '');
  const [jobTitle, setJobTitle] = useState(initialProfile?.job_title ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: fullName.trim() || null,
          company_name: companyName.trim() || null,
          job_title: jobTitle.trim() || null,
        },
        { onConflict: 'id' },
      );
      if (upsertError) throw new Error(upsertError.message);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar o perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          O teu nome e empresa aparecem no cabeçalho da app e na identificação do Laudo de Auditoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Nome completo</span>
          <input
            type="text"
            className={INPUT_CLASS}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex.: Ricardo Barros"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Empresa / Entidade Patronal</span>
          <input
            type="text"
            className={INPUT_CLASS}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ex.: Metalomecânica 3 Triângulos"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Função (opcional)</span>
          <input
            type="text"
            className={INPUT_CLASS}
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Ex.: Operador de Máquinas"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar Perfil'}
          </Button>
          {saved && <span className="text-xs font-medium text-[var(--accent-dark)]">Guardado.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
