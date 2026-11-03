'use client';

// components/settings/IrsReductionForm.tsx
// Migração 0020 (03/11/2026): o governo português corta por vezes as
// taxas de retenção na fonte de IRS a meio do ano, como adiantamento de
// uma descida ainda não refletida nas tabelas (ex: Novembro/2026, -50%;
// o mesmo já aconteceu em Ago/Set de 2025, com outra percentagem). Como o
// mês e a percentagem variam de ano para ano, ficam configuráveis aqui —
// sem registo para um ano/mês, não há redução nenhuma (comportamento
// inalterado). Mesmo padrão de SubsidyOverridesForm.tsx.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { IrsReductionOverride } from '@/types/database.types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

function monthLabel(month: number) {
  return MONTH_OPTIONS.find((m) => m.value === month)?.label ?? String(month);
}

export function IrsReductionForm({
  userId,
  initialOverrides,
}: {
  userId: string;
  initialOverrides: IrsReductionOverride[];
}) {
  const supabase = createClient();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const [year, setYear] = useState(currentYear);
  const [overrides, setOverrides] = useState<IrsReductionOverride[]>(initialOverrides);
  const [newMonth, setNewMonth] = useState<number>(new Date().getMonth() + 1);
  const [newPercentage, setNewPercentage] = useState<number>(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overridesForYear = overrides
    .filter((o) => o.reference_year === year)
    .sort((a, b) => a.reference_month - b.reference_month);

  async function addOverride() {
    setSaving(true);
    setError(null);
    try {
      const { data, error: upsertError } = await supabase
        .from('irs_reduction_overrides')
        .upsert(
          { user_id: userId, reference_year: year, reference_month: newMonth, reduction_percentage: newPercentage },
          { onConflict: 'user_id,reference_year,reference_month' },
        )
        .select('*')
        .single();
      if (upsertError) throw new Error(upsertError.message);
      const saved = data as IrsReductionOverride;
      setOverrides((prev) => [
        ...prev.filter((o) => !(o.reference_year === year && o.reference_month === newMonth)),
        saved,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(month: number) {
    setSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('irs_reduction_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('reference_year', year)
        .eq('reference_month', month);
      if (deleteError) throw new Error(deleteError.message);
      setOverrides((prev) => prev.filter((o) => !(o.reference_year === year && o.reference_month === month)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Redução Intercalar de IRS</CardTitle>
        <CardDescription>
          Quando o governo corta temporariamente as taxas de retenção na fonte de IRS num mês específico (ex:
          Novembro/2026, -50%), regista aqui o ano, o mês e a percentagem — para a simulação do Dashboard refletir
          o desconto menor nesse mês. Sem registo, não há redução nenhuma.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Ano:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          {overridesForYear.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem redução registada para {year}.</p>
          )}
          {overridesForYear.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <span>
                {monthLabel(o.reference_month)}: <strong>-{o.reduction_percentage}%</strong>
              </span>
              <button
                type="button"
                onClick={() => removeOverride(o.reference_month)}
                disabled={saving}
                className="text-xs text-muted-foreground underline hover:text-destructive"
              >
                Remover
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Mês</label>
            <select
              value={newMonth}
              onChange={(e) => setNewMonth(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Redução (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={newPercentage}
              onChange={(e) => setNewPercentage(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={addOverride}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'A guardar…' : 'Adicionar'}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
