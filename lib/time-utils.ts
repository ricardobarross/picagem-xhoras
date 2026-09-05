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

/**
 * Calcula a data da Páscoa (domingo) para um dado ano — algoritmo de
 * Meeus/Jones/Butcher (calendário Gregoriano), usado para derivar os
 * feriados móveis portugueses (Sexta-feira Santa e Corpo de Deus).
 */
function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Feriados obrigatórios em Portugal Continental para um dado ano (Código
 * do Trabalho — Lei n.º 7/2009, art. 234º). Inclui os fixos e os móveis
 * derivados da Páscoa (Sexta-feira Santa = Páscoa - 2 dias; Corpo de Deus
 * = Páscoa + 60 dias). Não inclui feriados municipais nem os facultativos
 * (Carnaval, aniversário do concelho), que variam por acordo/localidade.
 */
export function getPortugueseHolidays(year: number): Date[] {
  const easter = calculateEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  return [
    new Date(year, 0, 1), // Ano Novo
    goodFriday, // Sexta-feira Santa
    easter, // Domingo de Páscoa
    new Date(year, 3, 25), // Dia da Liberdade
    new Date(year, 4, 1), // Dia do Trabalhador
    corpusChristi, // Corpo de Deus
    new Date(year, 5, 10), // Dia de Portugal
    new Date(year, 7, 15), // Assunção de Nossa Senhora
    new Date(year, 9, 5), // Implantação da República
    new Date(year, 10, 1), // Todos os Santos
    new Date(year, 11, 1), // Restauração da Independência
    new Date(year, 11, 8), // Imaculada Conceição
    new Date(year, 11, 25), // Natal
  ];
}

const holidayCache = new Map<number, Set<string>>();

function holidaySetForYear(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(getPortugueseHolidays(year).map(toDateOnlyString));
    holidayCache.set(year, set);
  }
  return set;
}

/** Verifica se "YYYY-MM-DD" é feriado obrigatório em Portugal Continental. */
export function isPortugueseHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  return holidaySetForYear(year).has(dateStr);
}

/**
 * Categoria de um dia (dia útil / sábado / domingo / feriado) a partir de
 * "YYYY-MM-DD". Feriados que caem ao fim de semana mantêm a categoria de
 * fim de semana (já mais favorável ou equivalente); só os feriados em dia
 * útil são reclassificados como 'holiday', para que ganhem o acréscimo
 * legal correspondente em vez de serem pagos como um dia normal.
 */
export function getDayCategory(dateStr: string): DayCategory {
  const day = parseDateOnly(dateStr).getDay(); // 0 = domingo, 6 = sábado
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  if (isPortugueseHoliday(dateStr)) return 'holiday';
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
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Nome do mês em português a partir do número (1 = Janeiro). Usado sempre
// que se mostra o mês de um subsídio/período em vez de o número.
export function monthNamePt(month: number): string {
  return MONTH_NAMES_PT[month - 1] ?? 'mês configurado';
}

export function formatDatePt(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata horas decimais como "7h 30m" ou "8h". */
export function formatHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
