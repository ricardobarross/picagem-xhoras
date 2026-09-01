// lib/time-utils.ts
// Funções puras de apoio a datas/horas — sem dependências externas, fáceis
// de testar isoladamente. Todas as funções que lidam com "que dia é este"
// evitam `new Date("YYYY-MM-DD")` (que o JS interpreta em UTC e pode
// deslocar um dia consoante o fuso horário) — em vez disso constroem a
// data a partir dos componentes ano/mês/dia explícitos, em hora local.
import type { DayCategory } from '@/types/database.types';

/** Converte uma Date para "YYYY-MM-DD" usando os componentes locais (nunca UTC). */
export function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parseia "YYYY-MM-DD" para uma Date à meia-noite local (nunca UTC). */
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Categoria de um dia (dia útil / sábado / domingo) a partir de "YYYY-MM-DD". */
export function getDayCategory(dateStr: string): DayCategory {
  const day = parseDateOnly(dateStr).getDay(); // 0 = domingo, 6 = sábado
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

export interface PayPeriod {
  /** Primeiro dia do período (dia seguinte ao fecho anterior). */
  start: Date;
  /** Último dia do período (o dia de fecho, ex.: dia 20). */
  end: Date;
  /** Dia 1 do mês seguinte ao fecho — quando o período é pago. */
  paymentDate: Date;
}

/**
 * Determina o período de pagamento (ciclo do dia `cutoffDay+1` ao
 * `cutoffDay` do mês seguinte) a que `referenceDate` pertence.
 *
 * Exemplo com cutoffDay = 20:
 *  - referenceDate = 15 de setembro → período 21 ago–20 set, pago 1 out.
 *  - referenceDate = 25 de setembro → período 21 set–20 out, pago 1 nov.
 */
export function getPayPeriod(referenceDate: Date, cutoffDay: number): PayPeriod {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed
  const day = referenceDate.getDate();

  // Mês (0-indexed, pode "transbordar" para o ano seguinte — o
  // construtor Date normaliza isso automaticamente) em que o período fecha.
  const endMonth = day > cutoffDay ? month + 1 : month;

  const end = new Date(year, endMonth, cutoffDay);
  const start = new Date(year, endMonth - 1, cutoffDay + 1);
  const paymentDate = new Date(year, endMonth + 1, 1);

  return { start, end, paymentDate };
}

/** Formata "YYYY-MM-DD" como "DD/MM/YYYY". */
export function formatDatePt(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata horas decimais como "7h 30m". */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
