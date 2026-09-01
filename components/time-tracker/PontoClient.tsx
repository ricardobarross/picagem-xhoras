'use client';

// components/time-tracker/PontoClient.tsx
// Ecrã de picagem simplificado:
//   1. Cartão rápido "quantas horas trabalhaste hoje" (para preencher ao
//      fim do dia — um número, e ponto).
//   2. Calendário do mês, editável: clicar num dia mostra um campo para
//      escrever/corrigir as horas desse dia.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TimeEntry } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toDateOnlyString, formatDatePt } from '@/lib/time-utils';

const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface DayCell {
  date: Date;
  dateStr: string;
  inMonth: boolean;
}

function buildMonthGrid(year: number, month: number): DayCell[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // semana começa à segunda
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: DayCell[] = [];
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push({ date: d, dateStr: toDateOnlyString(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, dateStr: toDateOnlyString(d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    cells.push({ date: d, dateStr: toDateOnlyString(d), inMonth: false });
  }
  return cells;
}

export function PontoClient({
  userId,
  initialEntries,
}: {
  userId: string;
  initialEntries: TimeEntry[];
}) {
  const supabase = createClient();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateOnlyString(today), [today]);

  const [entriesMap, setEntriesMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const e of initialEntries) map[e.entry_date] = e.hours_worked;
    return map;
  });

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [todayInput, setTodayInput] = useState(
    entriesMap[todayStr] !== undefined ? String(entriesMap[todayStr]) : '',
  );
  const [todaySaving, setTodaySaving] = useState(false);
  const [todaySaved, setTodaySaved] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Vai buscar os registos do mês visível sempre que a navegação muda.
  useEffect(() => {
    const start = toDateOnlyString(new Date(viewYear, viewMonth, 1));
    const end = toDateOnlyString(new Date(viewYear, viewMonth + 1, 0));

    supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('entry_date', start)
      .lte('entry_date', end)
      .then(({ data, error: fetchError }) => {
        if (fetchError) return setError(fetchError.message);
        setEntriesMap((prev) => {
          const next = { ...prev };
          // limpa dias do mês visível antes de repor (para refletir remoções)
          for (const cell of buildMonthGrid(viewYear, viewMonth)) {
            if (cell.inMonth) delete next[cell.dateStr];
          }
          for (const e of data ?? []) next[e.entry_date] = e.hours_worked;
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, userId]);

  async function upsertHours(dateStr: string, hours: number) {
    setError(null);
    if (hours <= 0) {
      // 0 horas = remover o registo desse dia
      const { error: deleteError } = await supabase
        .from('time_entries')
        .delete()
        .eq('user_id', userId)
        .eq('entry_date', dateStr);
      if (deleteError) throw new Error(deleteError.message);
      setEntriesMap((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      return;
    }

    const { error: upsertError } = await supabase
      .from('time_entries')
      .upsert({ user_id: userId, entry_date: dateStr, hours_worked: hours }, { onConflict: 'user_id,entry_date' });
    if (upsertError) throw new Error(upsertError.message);
    setEntriesMap((prev) => ({ ...prev, [dateStr]: hours }));
  }

  async function handleSaveToday() {
    const hours = Number(todayInput.replace(',', '.'));
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      return setError('Introduz um número de horas válido (0 a 24).');
    }
    setTodaySaving(true);
    setTodaySaved(false);
    try {
      await upsertHours(todayStr, hours);
      setTodaySaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setTodaySaving(false);
    }
  }

  function handleSelectDay(dateStr: string) {
    setSelectedDate(dateStr);
    setEditValue(entriesMap[dateStr] !== undefined ? String(entriesMap[dateStr]) : '');
    setError(null);
  }

  async function handleSaveEdit() {
    if (!selectedDate) return;
    const hours = editValue.trim() === '' ? 0 : Number(editValue.replace(',', '.'));
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      return setError('Introduz um número de horas válido (0 a 24).');
    }
    setEditSaving(true);
    try {
      await upsertHours(selectedDate, hours);
      if (selectedDate === todayStr) setTodayInput(hours > 0 ? String(hours) : '');
      setSelectedDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setEditSaving(false);
    }
  }

  function goToMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Hoje, {formatDatePt(todayStr)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="text-sm text-muted-foreground">Quantas horas trabalhaste hoje?</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              placeholder="ex.: 8"
              value={todayInput}
              onChange={(e) => {
                setTodayInput(e.target.value);
                setTodaySaved(false);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button onClick={handleSaveToday} disabled={todaySaving || todayInput.trim() === ''}>
              {todaySaving ? 'A guardar…' : 'Guardar'}
            </Button>
          </div>
          {todaySaved && <p className="text-sm text-green-600">Guardado.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => goToMonth(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" onClick={() => goToMonth(1)}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAY_HEADERS.map((h) => (
              <div key={h} className="py-1">
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const dayOfWeek = cell.date.getDay(); // 0 = domingo, 6 = sábado
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const hours = entriesMap[cell.dateStr];
              const isSelected = selectedDate === cell.dateStr;
              const isToday = cell.dateStr === todayStr;

              return (
                <button
                  key={cell.dateStr}
                  onClick={() => handleSelectDay(cell.dateStr)}
                  className={[
                    'flex aspect-square flex-col items-center justify-center rounded-md border text-xs transition-colors',
                    cell.inMonth ? '' : 'opacity-30',
                    isSelected ? 'border-primary ring-2 ring-ring' : 'border-border',
                    isToday ? 'font-semibold' : '',
                    isWeekend ? 'bg-muted/50' : '',
                    hours ? 'bg-green-100 dark:bg-green-950' : '',
                  ].join(' ')}
                >
                  <span>{cell.date.getDate()}</span>
                  {hours ? <span className="text-[10px] text-green-700 dark:text-green-400">{hours}h</span> : null}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-4 flex items-center gap-2 rounded-md border p-3">
              <span className="text-sm">{formatDatePt(selectedDate)}:</span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                autoFocus
                placeholder="horas (0 para apagar)"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'A guardar…' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)}>
                Cancelar
              </Button>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
