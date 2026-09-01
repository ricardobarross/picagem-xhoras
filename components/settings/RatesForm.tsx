'use client';

// components/settings/RatesForm.tsx
// Formulário do tarifário: valor/hora em dia útil, extra ao sábado,
// multiplicador de domingo, e o dia em que a folha fecha.
//
// Os campos de valor (dia útil / extra de sábado) começam vazios quando
// ainda estão a 0 na base de dados — não pré-preenchemos com nenhum
// exemplo, para não haver risco de ficar gravado por engano.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserSettings } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function numberOrEmpty(value: number): string {
  return value === 0 ? '' : String(value);
}

export function RatesForm({ userId, initialSettings }: { userId: string; initialSettings: UserSettings }) {
  const supabase = createClient();

  const [weekdayRate, setWeekdayRate] = useState(numberOrEmpty(initialSettings.weekday_rate));
  const [saturdayExtra, setSaturdayExtra] = useState(numberOrEmpty(initialSettings.saturday_extra_per_hour));
  const [sundayMultiplier, setSundayMultiplier] = useState(String(initialSettings.sunday_multiplier));
  const [payrollCutoffDay, setPayrollCutoffDay] = useState(String(initialSettings.payroll_cutoff_day));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekday = Number(weekdayRate.replace(',', '.')) || 0;
  const extra = Number(saturdayExtra.replace(',', '.')) || 0;
  const multiplier = Number(sundayMultiplier.replace(',', '.')) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const cutoff = Number(payrollCutoffDay);
    if (weekday <= 0) return setError('Introduz o valor por hora em dia útil.');
    if (multiplier <= 0) return setError('O multiplicador de domingo tem de ser maior que 0.');
    if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 28) {
      return setError('O dia de fecho tem de ser um número entre 1 e 28.');
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from('user_settings')
      .update({
        weekday_rate: weekday,
        saturday_extra_per_hour: extra,
        sunday_multiplier: multiplier,
        payroll_cutoff_day: cutoff,
      })
      .eq('user_id', userId);
    setSaving(false);

    if (updateError) return setError(updateError.message);
    setSaved(true);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Tarifário</CardTitle>
        <CardDescription>Define quanto ganhas por hora e o ciclo de pagamento.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Valor por hora em dia útil (€)">
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0,00"
              value={weekdayRate}
              onChange={(e) => setWeekdayRate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Extra por hora ao sábado (€ a mais sobre o valor de dia útil)">
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0,00"
              value={saturdayExtra}
              onChange={(e) => setSaturdayExtra(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Multiplicador ao domingo (2 = o dobro do dia útil)">
            <input
              type="number"
              min={1}
              step={0.1}
              value={sundayMultiplier}
              onChange={(e) => setSundayMultiplier(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Dia do mês em que a folha fecha (o pagamento é sempre no dia 1 seguinte)">
            <input
              type="number"
              min={1}
              max={28}
              value={payrollCutoffDay}
              onChange={(e) => setPayrollCutoffDay(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Com estes valores: sábado = {(weekday + extra).toFixed(2)}€/h · domingo ={' '}
            {(weekday * multiplier).toFixed(2)}€/h
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && <p className="text-sm text-green-600">Guardado.</p>}

          <Button type="submit" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
