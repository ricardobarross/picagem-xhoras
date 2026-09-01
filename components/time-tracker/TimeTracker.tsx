'use client';

// components/time-tracker/TimeTracker.tsx
// Picagem em tempo real: Entrada -> Pausa/Almoço -> Regresso -> Saída.
// Cada utilizador só pode ter um turno "in_progress" de cada vez
// (garantido pelo índice único uq_time_entries_open_shift no schema).

import { useEffect, useState, useTransition } from 'react';
import { Coffee, LogIn, LogOut, PlayCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { TimeEntry } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatHours } from '@/lib/time-utils';

type ShiftStage = 'not_started' | 'clocked_in' | 'on_break' | 'completed';

function getStage(entry: TimeEntry | null): ShiftStage {
  if (!entry || !entry.clock_in) return 'not_started';
  if (entry.clock_out) return 'completed';
  if (entry.break_start && !entry.break_end) return 'on_break';
  return 'clocked_in';
}

export function TimeTracker({ initialEntry }: { initialEntry: TimeEntry | null }) {
  const supabase = createClient();
  const [entry, setEntry] = useState<TimeEntry | null>(initialEntry);
  const [now, setNow] = useState(new Date());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stage = getStage(entry);

  // Relógio ao vivo (para mostrar horas decorridas do turno atual)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  async function handleClockIn() {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setError('Sessão expirada. Inicia sessão novamente.');

    const { data, error: insertError } = await supabase
      .from('time_entries')
      .insert({
        user_id: userData.user.id,
        entry_date: today,
        clock_in: new Date().toISOString(),
        day_type: 'normal', // TODO: pré-preencher com base no dia da semana / calendário de feriados
        status: 'in_progress',
        source: 'clock',
      })
      .select()
      .single();

    if (insertError) return setError(insertError.message);
    setEntry(data);
  }

  async function handleBreakStart() {
    if (!entry) return;
    await updateEntry({ break_start: new Date().toISOString() });
  }

  async function handleBreakEnd() {
    if (!entry) return;
    await updateEntry({ break_end: new Date().toISOString() });
  }

  async function handleClockOut() {
    if (!entry) return;
    await updateEntry({ clock_out: new Date().toISOString(), status: 'completed' });
  }

  function updateEntry(patch: Partial<TimeEntry>) {
    if (!entry) return;
    setError(null);
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const { data, error: updateError } = await supabase
          .from('time_entries')
          .update(patch)
          .eq('id', entry.id)
          .select()
          .single();

        if (updateError) setError(updateError.message);
        else setEntry(data);
        resolve();
      });
    });
  }

  const elapsedLabel =
    entry?.clock_in && stage !== 'not_started' && stage !== 'completed'
      ? formatHours((now.getTime() - new Date(entry.clock_in).getTime()) / 1000 / 60 / 60)
      : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Picagem de Ponto</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <StatusBadge stage={stage} />

        {elapsedLabel && (
          <p className="text-sm text-muted-foreground">Turno em curso há {elapsedLabel}</p>
        )}

        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            size="lg"
            disabled={stage !== 'not_started' || isPending}
            onClick={handleClockIn}
            className="col-span-2"
          >
            <LogIn className="mr-2 h-4 w-4" /> Entrada
          </Button>

          <Button
            variant="secondary"
            disabled={stage !== 'clocked_in' || isPending}
            onClick={handleBreakStart}
          >
            <Coffee className="mr-2 h-4 w-4" /> Pausa
          </Button>

          <Button
            variant="secondary"
            disabled={stage !== 'on_break' || isPending}
            onClick={handleBreakEnd}
          >
            <PlayCircle className="mr-2 h-4 w-4" /> Regresso
          </Button>

          <Button
            variant="destructive"
            disabled={(stage !== 'clocked_in' && stage !== 'on_break') || isPending}
            onClick={handleClockOut}
            className="col-span-2"
          >
            <LogOut className="mr-2 h-4 w-4" /> Saída
          </Button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ stage }: { stage: ShiftStage }) {
  const map: Record<ShiftStage, { label: string; className: string }> = {
    not_started: { label: 'Sem turno iniciado', className: 'bg-muted text-muted-foreground' },
    clocked_in: { label: 'Em curso', className: 'bg-green-100 text-green-700' },
    on_break: { label: 'Em pausa', className: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Concluído', className: 'bg-blue-100 text-blue-700' },
  };
  const { label, className } = map[stage];
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}
