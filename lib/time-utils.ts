// lib/time-utils.ts
// Funções puras de apoio ao cálculo de horas — sem dependências externas,
// fáceis de testar isoladamente.

/** Diferença entre duas datas ISO, em horas decimais (nunca negativa). */
export function diffInHours(start: string | Date, end: string | Date): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, ms / 1000 / 60 / 60);
}

/**
 * Calcula quantas horas de um turno [clockIn, clockOut] caem dentro da
 * janela noturna configurada (ex.: 22:00–07:00), que pode atravessar a
 * meia-noite. Devolve horas decimais.
 */
export function computeNightOverlapHours(
  clockIn: Date,
  clockOut: Date,
  nightStart: string, // "HH:MM:SS" ou "HH:MM"
  nightEnd: string,
): number {
  if (clockOut <= clockIn) return 0;

  let overlapMs = 0;
  const cursor = new Date(clockIn);
  cursor.setHours(0, 0, 0, 0);

  // Percorre dia a dia (normalmente 1–2 iterações) construindo a janela
  // noturna real desse dia e intersetando com o turno.
  while (cursor < clockOut) {
    const windowStart = combineDateAndTime(cursor, nightStart);
    let windowEnd = combineDateAndTime(cursor, nightEnd);
    if (windowEnd <= windowStart) {
      // janela atravessa a meia-noite (ex.: 22:00 -> 07:00 do dia seguinte)
      windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const overlapStart = maxDate(clockIn, windowStart);
    const overlapEnd = minDate(clockOut, windowEnd);
    if (overlapEnd > overlapStart) {
      overlapMs += overlapEnd.getTime() - overlapStart.getTime();
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return overlapMs / 1000 / 60 / 60;
}

function combineDateAndTime(date: Date, time: string): Date {
  const [h, m, s] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(h, m ?? 0, s ?? 0, 0);
  return result;
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}
function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}

/** Formata horas decimais como "7h 30m". */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
