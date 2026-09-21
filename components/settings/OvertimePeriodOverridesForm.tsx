'use client';

// components/settings/OvertimePeriodOverridesForm.tsx
// Histórico de períodos de apuração com data inicial/final explícitas —
// pedido por Ricardo (21/09/2026) porque a empresa muda o dia em que a
// folha fecha de ciclo para ciclo (ex.: fechou dia 20, no ciclo seguinte
// fechou dia 25). O campo único "Dia do mês em que a folha fecha" (em
// Tarifário/Contrato) não dava conta disso: mudar o dia fazia o sistema
// calcular o início do novo período como "dia de fecho + 1 do mês
// anterior", o que fica errado quando o fecho anterior não foi nesse
// mesmo dia.
//
// Cada período aqui cadastrado, ao cobrir a data de um cálculo, substitui
// inteiramente o período normal (ver lib/time-utils.ts::resolvePayPeriod).
// Fica em histórico — um registo por ciclo — para que relatórios de meses
// passados (em especial o Laudo de Auditoria) continuem corretos mesmo
// que o fecho volte a mudar depois. Sem nenhum período cadastrado, tudo
// continua a funcionar exatamente como antes (pelo "dia de fecho" único).

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { OvertimePeriodOverride } from '@/types/database.types';
import { formatDatePt } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function OvertimePeriodOverridesForm({
  userId,
  initialOverrides,
}: {
  userId: string;
  initialOverrides: OvertimePeriodOverride[];
}) {
  const supabase = createClient();

  const [overrides, setOverrides] = useState<OvertimePeriodOverride[]>(
    [...initialOverrides].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      return setError('Preenche a data inicial e a data final.');
    }
    if (endDate < startDate) {
      return setError('A data final não pode ser antes da data inicial.');
    }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('overtime_period_overrides')
      .insert({ user_id: userId, start_date: startDate, end_date: endDate })
      .select()
      .single();
    setSaving(false);

    if (insertError) return setError(insertError.message);

    setOverrides((prev) =>
      [...prev, data as OvertimePeriodOverride].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    );
    setStartDate('');
    setEndDate('');
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const { error: deleteError } = await supabase.from('overtime_period_overrides').delete().eq('id', id);
    setDeletingId(null);

    if (deleteError) return setError(deleteError.message);
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Períodos de Apuração de Horas Extras</CardTitle>
        <CardDescription>
          Se o dia em que a folha fecha mudar de ciclo para ciclo, regista aqui a data inicial e final exatas de
          cada período — em vez de mudar só o &quot;dia de fecho&quot; padrão, que assume o mesmo dia sempre. Sem
          nenhum período aqui, tudo continua a usar o dia de fecho configurado acima.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-end sm:gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Início</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Fim</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? 'A adicionar…' : 'Adicionar período'}
          </Button>
        </form>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum período cadastrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overrides.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm"
              >
                <span>
                  {formatDatePt(o.start_date)} – {formatDatePt(o.end_date)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(o.id)}
                  disabled={deletingId === o.id}
                  className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                >
                  {deletingId === o.id ? 'A remover…' : 'Remover'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
