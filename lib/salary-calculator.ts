// lib/salary-calculator.ts
// Motor de cálculo do salário líquido a partir dos registos de ponto
// (TimeEntry[]) e da configuração remuneratória (UserSettings).
//
// Fluxo geral:
//   1. Para cada turno, calcular horas trabalhadas (bruto - pausa).
//   2. Classificar essas horas em categorias: normal, extra (2 escalões),
//      sábado, domingo, feriado, noturno (a componente noturna é sempre
//      calculada à parte e SOMADA ao prémio, não substitui a categoria
//      do dia — ex.: um turno de domingo à noite conta domingo + noturno).
//   3. Multiplicar cada categoria pela respetiva taxa (fixa ou % sobre a
//      base) para obter o rendimento das horas.
//   4. Somar subsídios (alimentação, duodécimos de férias/Natal,
//      transporte) para obter o rendimento bruto total.
//   5. Separar o que entra para a base tributável (rendimento coletável)
//      do que é isento, e aplicar Segurança Social + IRS.
//   6. Líquido = Bruto total − Segurança Social − IRS.

import type { TimeEntry, UserSettings, IrsTaxBracket, DayType } from '@/types/database.types';
import { diffInHours, computeNightOverlapHours } from './time-utils';

// ---------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------

export interface HoursBreakdown {
  normal: number;
  saturday: number;
  sunday: number;
  holiday: number;
  night: number; // horas noturnas (adicional), já incluídas em normal/saturday/etc.
  overtimeTier1: number;
  overtimeTier2: number;
  total: number;
}

export interface GrossBreakdown {
  fromNormalHours: number;
  fromSaturdayHours: number;
  fromSundayHours: number;
  fromHolidayHours: number;
  fromNightPremium: number;
  fromOvertime: number;
  mealAllowance: number;
  vacationChristmasBonus: number;
  transportAllowance: number;
  totalTaxable: number;      // entra para a base de IRS/SS
  totalNonTaxable: number;   // isento (ex.: subsídio de alimentação até ao limite)
  totalGross: number;        // taxable + nonTaxable
}

export interface DeductionsBreakdown {
  socialSecurity: number;
  irs: number;
  totalDeductions: number;
}

export interface PayslipSummary {
  period: { year: number; month: number };
  hours: HoursBreakdown;
  gross: GrossBreakdown;
  deductions: DeductionsBreakdown;
  netPay: number;
}

// ---------------------------------------------------------------------
// 1–2. Horas trabalhadas por turno + classificação
// ---------------------------------------------------------------------

function shiftWorkedHours(entry: TimeEntry): number {
  if (!entry.clock_in || !entry.clock_out) return 0;
  const gross = diffInHours(entry.clock_in, entry.clock_out);
  const pause =
    entry.break_start && entry.break_end ? diffInHours(entry.break_start, entry.break_end) : 0;
  return Math.max(0, gross - pause);
}

function shiftNightHours(entry: TimeEntry, settings: UserSettings): number {
  if (entry.night_shift_override === false) return 0;
  if (!entry.clock_in || !entry.clock_out) return 0;

  if (entry.night_shift_override === true) {
    return shiftWorkedHours(entry); // turno inteiro marcado como noturno
  }

  // Deteção automática por sobreposição com a janela configurada.
  return computeNightOverlapHours(
    new Date(entry.clock_in),
    new Date(entry.clock_out),
    settings.night_shift_start_time,
    settings.night_shift_end_time,
  );
}

/**
 * Agrega todos os turnos do período em totais por categoria.
 * As horas extra só se aplicam a dias 'normal' que excedam o limiar
 * diário configurado (overtime_daily_threshold_hours); em sábados,
 * domingos e feriados a totalidade das horas usa a taxa desse dia.
 */
export function calculateHoursBreakdown(
  entries: TimeEntry[],
  settings: UserSettings,
): HoursBreakdown {
  const breakdown: HoursBreakdown = {
    normal: 0,
    saturday: 0,
    sunday: 0,
    holiday: 0,
    night: 0,
    overtimeTier1: 0,
    overtimeTier2: 0,
    total: 0,
  };

  for (const entry of entries) {
    if (entry.status !== 'completed') continue; // turnos em curso não entram no cálculo

    const worked = shiftWorkedHours(entry);
    const night = shiftNightHours(entry, settings);
    breakdown.night += night;
    breakdown.total += worked;

    if (entry.day_type === 'normal') {
      const threshold = settings.overtime_daily_threshold_hours;
      const regular = Math.min(worked, threshold);
      const extra = Math.max(0, worked - threshold);

      const tier1 = Math.min(extra, settings.overtime_tier1_max_hours);
      const tier2 = Math.max(0, extra - settings.overtime_tier1_max_hours);

      breakdown.normal += regular;
      breakdown.overtimeTier1 += tier1;
      breakdown.overtimeTier2 += tier2;
    } else {
      // sábado / domingo / feriado: sem separação de horas extra (a
      // totalidade das horas já usa a taxa premium desse tipo de dia)
      breakdown[entry.day_type as Exclude<DayType, 'normal'>] += worked;
    }
  }

  return breakdown;
}

// ---------------------------------------------------------------------
// 3–4. Rendimento bruto
// ---------------------------------------------------------------------

/** Resolve um par (tipo, valor) em €/h efetivo, dado o valor base. */
function resolveRate(type: 'fixed' | 'percentage', value: number, baseRate: number): number {
  return type === 'fixed' ? value : baseRate * (1 + value / 100);
}

export function calculateGrossBreakdown(
  hours: HoursBreakdown,
  settings: UserSettings,
  daysWorkedInMonth: number,
): GrossBreakdown {
  const base = settings.base_hourly_rate;

  const saturdayRate = resolveRate(settings.saturday_rate_type, settings.saturday_rate_value, base);
  const sundayRate = resolveRate(settings.sunday_rate_type, settings.sunday_rate_value, base);
  const holidayRate = resolveRate(settings.holiday_rate_type, settings.holiday_rate_value, base);

  const fromNormalHours = hours.normal * base;
  const fromSaturdayHours = hours.saturday * saturdayRate;
  const fromSundayHours = hours.sunday * sundayRate;
  const fromHolidayHours = hours.holiday * holidayRate;

  // Adicional noturno: um prémio somado por cima da taxa normal das horas
  // que já foram contabilizadas acima (não duplica a hora, só o extra).
  const nightPremiumRate =
    settings.night_shift_rate_type === 'fixed'
      ? settings.night_shift_rate_value
      : base * (settings.night_shift_rate_value / 100);
  const fromNightPremium = hours.night * nightPremiumRate;

  const overtimeTier1Rate = base * (1 + settings.overtime_tier1_percentage / 100);
  const overtimeTier2Rate = base * (1 + settings.overtime_tier2_percentage / 100);
  const fromOvertime =
    hours.overtimeTier1 * overtimeTier1Rate + hours.overtimeTier2 * overtimeTier2Rate;

  // ----- Subsídios -----
  const mealAllowance = settings.meal_allowance_daily_value * daysWorkedInMonth;

  const vacationChristmasBonus =
    settings.bonus_payment_type === 'monthly_installments'
      ? (base * 160) / 12 // aproximação: 1/12 de um "salário mensal" de referência (ajustável)
      : 0; // valor de lump_sum deve ser lançado manualmente no mês configurado (bonus_lump_sum_month)

  const transportAllowance =
    settings.transport_allowance_frequency === 'daily'
      ? settings.transport_allowance_value * daysWorkedInMonth
      : settings.transport_allowance_value;

  const taxableHoursIncome =
    fromNormalHours +
    fromSaturdayHours +
    fromSundayHours +
    fromHolidayHours +
    fromNightPremium +
    fromOvertime;

  const nonTaxableMeal = settings.meal_allowance_taxable ? 0 : mealAllowance;
  const taxableMeal = settings.meal_allowance_taxable ? mealAllowance : 0;

  const totalTaxable = taxableHoursIncome + taxableMeal + vacationChristmasBonus + transportAllowance;
  const totalNonTaxable = nonTaxableMeal;

  return {
    fromNormalHours,
    fromSaturdayHours,
    fromSundayHours,
    fromHolidayHours,
    fromNightPremium,
    fromOvertime,
    mealAllowance,
    vacationChristmasBonus,
    transportAllowance,
    totalTaxable,
    totalNonTaxable,
    totalGross: totalTaxable + totalNonTaxable,
  };
}

// ---------------------------------------------------------------------
// 5. Descontos (Segurança Social + IRS)
// ---------------------------------------------------------------------

function calculateIrs(taxableBase: number, settings: UserSettings, brackets: IrsTaxBracket[]): number {
  if (settings.irs_calculation_type === 'fixed_rate') {
    return taxableBase * (settings.irs_fixed_rate / 100);
  }

  // Modelo de escalões com parcela a abater, à semelhança das tabelas de
  // retenção na fonte portuguesas: imposto = base * taxa − dedução.
  const bracket = brackets
    .filter((b) => taxableBase >= b.min_income && (b.max_income === null || taxableBase <= b.max_income))
    .sort((a, b) => b.min_income - a.min_income)[0];

  if (!bracket) return 0;
  return Math.max(0, taxableBase * (bracket.rate / 100) - bracket.deduction);
}

export function calculateDeductions(
  gross: GrossBreakdown,
  settings: UserSettings,
  brackets: IrsTaxBracket[] = [],
): DeductionsBreakdown {
  const socialSecurity = gross.totalTaxable * (settings.social_security_rate / 100);
  const irsBase = gross.totalTaxable - socialSecurity; // SS é dedutível antes do IRS
  const irs = calculateIrs(irsBase, settings, brackets);

  return {
    socialSecurity,
    irs,
    totalDeductions: socialSecurity + irs,
  };
}

// ---------------------------------------------------------------------
// 6. Função de alto nível — usada pela Dashboard
// ---------------------------------------------------------------------

export function calculatePayslip(params: {
  year: number;
  month: number; // 1-12
  entries: TimeEntry[];
  settings: UserSettings;
  brackets?: IrsTaxBracket[];
}): PayslipSummary {
  const { year, month, entries, settings, brackets = [] } = params;

  const daysWorkedInMonth = new Set(
    entries.filter((e) => e.status === 'completed').map((e) => e.entry_date),
  ).size;

  const hours = calculateHoursBreakdown(entries, settings);
  const gross = calculateGrossBreakdown(hours, settings, daysWorkedInMonth);
  const deductions = calculateDeductions(gross, settings, brackets);

  return {
    period: { year, month },
    hours,
    gross,
    deductions,
    netPay: gross.totalGross - deductions.totalDeductions,
  };
}
