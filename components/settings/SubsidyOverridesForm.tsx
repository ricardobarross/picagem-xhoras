'use client';

// components/settings/SubsidyOverridesForm.tsx
// Em empresas onde o subsídio de férias/Natal não é pago automaticamente
// no mesmo mês todos os anos (ex: é preciso pedir, e o mês pedido varia),
// isto permite registar, ano a ano, em que mês cada subsídio foi
// efetivamente pedido/recebido — sem precisar de mudar o mês "padrão" em
// Configurações sempre que isso acontece. Sem registo para um ano, a app
// usa sempre o mês padrão configurado acima.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SubsidyPaymentOverride, SubsidyType, UserSettings } from '@/types/database.types';
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

interface OverrideState {
  holiday: number | null; // null = sem override, usa o padrão
  christmas: number | null;
}

export function SubsidyOverridesForm({
  userId,
  initialSettings,
  initialOverrides,
}: {
  userId: string;
  initialSettings: UserSettings;
  initialOverrides: SubsidyPaymentOverride[];
}) {
  const supabase = createClient();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const [year, setYear] = useState(currentYear);
  const [overridesByYear, setOverridesByYear] = useState<Record<number, OverrideState>>(() => {
    const map: Record<number, OverrideState> = {};
    for (const y of yearOptions) map[y] = { holiday: null, christmas: null };
    for (const o of initialOverrides) {
      if (!map[o.reference_year]) map[o.reference_year] = { holiday: null, christmas: null };
      map[o.reference_year][o.subsidy_type] = o.received_month;
    }
    return map;
  });
  const [saving, setSaving] = useState<SubsidyType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = overridesByYear[year] ?? { holiday: null, christmas: null };

  async function saveOverride(subsidyType: SubsidyType, month: number) {
    setSaving(subsidyType);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from('subsidy_payment_overrides').upsert(
        { user_id: userId, reference_year: year, subsidy_type: subsidyType, received_month: month },
        { onConflict: 'user_id,reference_year,subsidy_type' },
      );
      if (upsertError) throw new Error(upsertError.message);
      setOverridesByYear((prev) => ({
        ...prev,
        [year]: { ...(prev[year] ?? { holiday: null, christmas: null }), [subsidyType]: month },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setSaving(null);
    }
  }

  async function clearOverride(subsidyType: SubsidyType) {
    setSaving(subsidyType);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('subsidy_payment_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('reference_year', year)
        .eq('subsidy_type', subsidyType);
      if (deleteError) throw new Error(deleteError.message);
      setOverridesByYear((prev) => ({
        ...prev,
        [year]: { ...(prev[year] ?? { holiday: null, christmas: null }), [subsidyType]: null },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover.');
    } finally {
      setSaving(null);
    }
  }

  function subsidyRow(subsidyType: SubsidyType, label: string, defaultMonth: number) {
    const override = current[subsidyType];
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">
            Padrão configurado acima: {monthLabel(defaultMonth)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={override ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') return clearOverride(subsidyType);
              return saveOverride(subsidyType, Number(value));
            }}
            disabled={saving === subsidyType}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Usar o padrão ({monthLabel(defaultMonth)})</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {saving === subsidyType && <span className="text-xs text-muted-foreground">A guardar…</span>}
          {override !== null && saving !== subsidyType && (
            <span className="text-xs text-green-600">
              Em {year}, recebido/a pedir em {monthLabel(override)}.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Quando os Subsídios Foram Pedidos/Recebidos</CardTitle>
        <CardDescription>
          Se na tua empresa o subsídio de férias (ou o de Natal) não é automático e o mês em que cai muda de ano
          para ano, regista aqui o mês real de cada ano — sem precisares de alterar o mês padrão acima sempre que
          isso acontecer.
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

        {subsidyRow('holiday', 'Subsídio de Férias', initialSettings.holiday_subsidy_month || 1)}
        {subsidyRow('christmas', 'Subsídio de Natal', initialSettings.christmas_subsidy_month || 11)}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
