'use client';

// components/time-tracker/PontoClient.tsx
// Ecrã de picagem simplificado:
//   1. Cartão rápido "quantas horas trabalhaste hoje" (para preencher ao
//      fim do dia — um número, e ponto).
//   2. Calendário do mês, editável: clicar num dia mostra um seletor de
//      tipo de registo (trabalho / falta injustificada / baixa / falta
//      justificada) e, quando aplicável, o campo de horas desse dia.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TimeEntry, TimeEntryType } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toDateOnlyString, formatDatePt } from '@/lib/time-utils';

const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Tipos que precisam de um número de horas; os outros (sick_leave,
// justified_absence) representam sempre um dia inteiro por registo.
const TYPES_WITH_HOURS: TimeEntryType[] = ['work', 'unjustified_absence'];

const TYPE_CONFIG: Record<TimeEntryType, { label: string; shortLabel: string; badgeClass: string }> = {
  work: {
    label: 'Trabalho',
    shortLabel: 'h',
    badgeClass: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  },
  unjustified_absence: {
    label: 'Falta Injustificada',
    shortLabel: 'h falta',
    badgeClass: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400',
  },
  sick_leave: {
    label: 'Baixa Médica',
    shortLabel: 'Baixa',
    badgeClass: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
  },
  justified_absence: {
    label: 'Falta Justificada',
    shortLabel: 'Falta',
    badgeClass: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  },
};

interface DayEntry {
  type: TimeEntryType;
  hours: number; // só relevante para os tipos em TYPES_WITH_HOURS
}

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

function entryToDayEntry(e: TimeEntry): DayEntry {
  return { type: e.entry_type ?? 'work', hours: e.hours_worked ?? 0 };
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

  const [entriesMap, setEntriesMap] = useState<Record<string, DayEntry>>(() => {
    const map: Record<string, DayEntry> = {};
    for (const e of initialEntries) map[e.entry_date] = entryToDayEntry(e);
    return map;
  });

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [todayInput, setTodayInput] = useState(
    entriesMap[todayStr]?.type === 'work' && entriesMap[todayStr].hours > 0
      ? String(entriesMap[todayStr].hours)
      : '',
  );
  const [todaySaving, setTodaySaving] = useState(false);
  const [todaySaved, setTodaySaved] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editType, setEditType] = useState<TimeEntryType>('work');
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Vai buscar os registos do mês visível sempre que a navegação muda.
  // Usa AbortController para cancelar o pedido anterior: sem isto, navegar
  // rapidamente entre meses pode fazer a resposta de um mês antigo chegar
  // depois da do mês atual e sobrepor-se aos dados corretos (race condition).
  useEffect(() => {
    const start = toDateOnlyString(new Date(viewYear, viewMonth, 1));
    const end = toDateOnlyString(new Date(viewYear, viewMonth + 1, 0));

    const controller = new AbortController();

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('time_entries')
          .select('*')
          .eq('user_id', userId)
          .gte('entry_date', start)
          .lte('entry_date', end)
          .abortSignal(controller.signal);

        if (controller.signal.aborted) return; // resposta obsoleta de uma navegação anterior — ignora
        if (fetchError) return setError(fetchError.message);
        setEntriesMap((prev) => {
          const next = { ...prev };
          // limpa dias do mês visível antes de repor (para refletir remoções)
          for (const cell of buildMonthGrid(viewYear, viewMonth)) {
            if (cell.inMonth) delete next[cell.dateStr];
          }
          for (const e of (data ?? []) as TimeEntry[]) next[e.entry_date] = entryToDayEntry(e);
          return next;
        });
      } catch {
        // Pedido cancelado por navegação rápida entre meses — não é um erro real a mostrar.
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, userId]);

  // hours só é usado (e obrigatório > 0) para os tipos em TYPES_WITH_HOURS;
  // para sick_leave/justified_absence cada registo é sempre um dia inteiro.
  async function upsertEntry(dateStr: string, type: TimeEntryType, hours: number) {
    setError(null);
    const needsHours = TYPES_WITH_HOURS.includes(type);

    if (needsHours && hours <= 0) {
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

    const { error: upsertError } = await supabase.from('time_entries').upsert(
      {
        user_id: userId,
        entry_date: dateStr,
        entry_type: type,
        hours_worked: needsHours ? hours : null,
      },
      { onConflict: 'user_id,entry_date' },
    );
    if (upsertError) throw new Error(upsertError.message);
    setEntriesMap((prev) => ({ ...prev, [dateStr]: { type, hours: needsHours ? hours : 0 } }));
  }

  async function removeEntry(dateStr: string) {
    setError(null);
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
  }

  async function handleSaveToday() {
    const hours = Number(todayInput.replace(',', '.'));
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      return setError('Introduz um número de horas válido (0 a 24).');
    }
    setTodaySaving(true);
    setTodaySaved(false);
    try {
      await upsertEntry(todayStr, 'work', hours);
      setTodaySaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setTodaySaving(false);
    }
  }

  function handleSelectDay(dateStr: string) {
    setSelectedDate(dateStr);
    const existing = entriesMap[dateStr];
    setEditType(existing?.type ?? 'work');
    setEditValue(existing && existing.hours > 0 ? String(existing.hours) : '');
    setError(null);
  }

  async function handleSaveEdit() {
    if (!selectedDate) return;
    const needsHours = TYPES_WITH_HOURS.includes(editType);
    const hours = editValue.trim() === '' ? 0 : Number(editValue.replace(',', '.'));

    if (needsHours) {
      if (Number.isNaN(hours) || hours < 0 || hours > 24) {
        return setError('Introduz um número de horas válido (0 a 24).');
      }
    }

    setEditSaving(true);
    try {
      if (needsHours) {
        await upsertEntry(selectedDate, editType, hours);
        if (selectedDate === todayStr && editType === 'work') {
          setTodayInput(hours > 0 ? String(hours) : '');
        }
      } else {
        // Baixa / falta justificada: um dia inteiro, sem horas.
        await upsertEntry(selectedDate, editType, 1);
      }
      setSelectedDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemoveEdit() {
    if (!selectedDate) return;
    setEditSaving(true);
    try {
      await removeEntry(selectedDate);
      if (selectedDate === todayStr) setTodayInput('');
      setSelectedDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover.');
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

  const selectedNeedsHours = TYPES_WITH_HOURS.includes(editType);

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
          <p className="text-xs text-muted-foreground">
            Para registar uma falta, baixa ou falta justificada, seleciona o dia no calendário abaixo.
          </p>
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
              const entry = entriesMap[cell.dateStr];
              const isSelected = selectedDate === cell.dateStr;
              const isToday = cell.dateStr === todayStr;
              const config = entry ? TYPE_CONFIG[entry.type] : null;

              return (
                <button
                  key={cell.dateStr}
                  onClick={() => handleSelectDay(cell.dateStr)}
                  className={[
                    'flex aspect-square flex-col items-center justify-center rounded-md border text-xs transition-colors',
                    cell.inMonth ? '' : 'opacity-30',
                    isSelected ? 'border-primary ring-2 ring-ring' : 'border-border',
                    isToday ? 'font-semibold' : '',
                    isWeekend && !config ? 'bg-muted/50' : '',
                    config ? config.badgeClass : '',
                  ].join(' ')}
                >
                  <span>{cell.date.getDate()}</span>
                  {config && (
                    <span className="text-[10px]">
                      {TYPES_WITH_HOURS.includes(entry!.type) ? `${entry!.hours}${config.shortLabel}` : config.shortLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-4 flex flex-col gap-3 rounded-md border p-3">
              <span className="text-sm font-medium">{formatDatePt(selectedDate)}</span>

              <div className="flex flex-wrap gap-1">
                {(Object.keys(TYPE_CONFIG) as TimeEntryType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditType(type)}
                    className={[
                      'rounded-md border px-2.5 py-1 text-xs transition-colors',
                      editType === type
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    ].join(' ')}
                  >
                    {TYPE_CONFIG[type].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {selectedNeedsHours ? (
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    autoFocus
                    placeholder="horas (0 para apagar)"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Regista o dia {editType === 'sick_leave' ? 'inteiro de baixa' : 'inteiro de falta justificada'},
                    sem necessidade de indicar horas.
                  </span>
                )}
                <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? 'A guardar…' : 'Guardar'}
                </Button>
                {entriesMap[selectedDate] && (
                  <Button size="sm" variant="outline" onClick={handleRemoveEdit} disabled={editSaving}>
                    Remover
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
