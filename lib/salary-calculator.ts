// lib/salary-calculator.ts
// Motor de cálculo do salário líquido a partir dos registos diários de
// horas (TimeEntry[]) e da configuração remuneratória (UserSettings).
//
// Modelo simplificado:
//   - Dia útil (seg-sex): weekday_rate €/h.
//   - Sábado: weekday_rate + saturday_extra_per_hour.
//   - Domingo: weekday_rate × sunday_multiplier (por defeito 2 = o dobro).
//   - A categoria do dia é sempre deduzida de entry_date, nunca guardada.
//
// Fluxo:
//   1. Classificar cada dia (weekday/saturday/sunday) e somar horas.
//   2. Multiplicar cada categoria pela respetiva taxa → rendimento das horas.
//   3. Somar subsídios (alimentação, transporte). O subsídio de férias/Natal
//      não é um pagamento à parte neste modelo — já está embutido no valor
//      da hora — por isso não entra em lado nenhum do cálculo.
//   4. Separar o que entra para a base declarada (tributável) do que não
//      entra. Por defeito, sábado/domingo NÃO entram na base declarada —
//      isto é opcional (settings.declare_weekend_income), porque cada
//      trabalhador tem um acordo diferente com o patrão.
//   5. Aplicar Segurança Social (% da base declarada) + IRS (escalão ou
//      taxa fixa, também sobre a base declarada).
//   6. Líquido = Bruto total − Segurança Social − IRS.

import type { TimeEntry, UserSettings, IrsTaxBracket } from '@/types/database.types';
import { getDayCategory } from './time-utils';

export interface HoursBreakdown {
  weekday: number;
  saturday: number;
  sunday: number;
  total: number;
}

export interface GrossBreakdown {
  fromWeekdayHours: number;
  fromSaturdayHours: number;
  fromSundayHours: number;
  mealAllowance: number;
  transportAllowance: number;
  totalTaxable: number; // entra para a base de IRS/SS ("valor declarado")
  totalNonTaxable: number; // isento / não declarado (recebido sem descontos)
  totalGross: number; // taxable + nonTaxable — o que a trabalhadora recebe no total
  weekendIncome: number; // fromSaturdayHours + fromSundayHours, para referência no dashboard
  weekendDeclared: boolean; // eco de settings.declare_weekend_income, para a UI
}

export interface DeductionsBreakdown {
  socialSecurity: number;
  irs: number;
  totalDeductions: number;
}

export interface PayslipSummary {
  hours: HoursBreakdown;
  gross: GrossBreakdown;
  deductions: DeductionsBreakdown;
  netPay: number;
}

// ---------------------------------------------------------------------
// 1. Horas por categoria de dia
// ---------------------------------------------------------------------

export function calculateHoursBreakdown(entries: TimeEntry[]): HoursBreakdown {
  const breakdown: HoursBreakdown = { weekday: 0, saturday: 0, sunday: 0, total: 0 };

  for (const entry of entries) {
    const category = getDayCategory(entry.entry_date);
    breakdown[category] += entry.hours_worked;
    breakdown.total += entry.hours_worked;
  }

  return breakdown;
}

// ---------------------------------------------------------------------
// 2–3. Rendimento bruto
// ---------------------------------------------------------------------

export function calculateGrossBreakdown(
  hours: HoursBreakdown,
  settings: UserSettings,
  daysWorkedInPeriod: number,
): GrossBreakdown {
  const weekdayRate = settings.weekday_rate;
  const saturdayRate = weekdayRate + settings.saturday_extra_per_hour;
  const sundayRate = weekdayRate * settings.sunday_multiplier;

  const fromWeekdayHours = hours.weekday * weekdayRate;
  const fromSaturdayHours = hours.saturday * saturdayRate;
  const fromSundayHours = hours.sunday * sundayRate;

  // ----- Subsídios -----
  // Nota: o subsídio de férias/Natal (duodécimos) NÃO entra aqui — está
  // embutido no valor da hora dela, não é um pagamento extra a somar.
  const mealAllowance = settings.meal_allowance_daily_value * daysWorkedInPeriod;

  const transportAllowance =
    settings.transport_allowance_frequency === 'daily'
      ? settings.transport_allowance_value * daysWorkedInPeriod
      : settings.transport_allowance_value;

  const weekendIncome = fromSaturdayHours + fromSundayHours;
  const weekendDeclared = settings.declare_weekend_income;

  // Por defeito o fim de semana não entra na base declarada (SS + IRS) —
  // é recebido à parte, sem descontos. Cada utilizador pode ligar isto em
  // Configurações, consoante o acordo que tem com o patrão.
  const declaredHoursIncome = fromWeekdayHours + (weekendDeclared ? weekendIncome : 0);
  const undeclaredHoursIncome = weekendDeclared ? 0 : weekendIncome;

  const nonTaxableMeal = settings.meal_allowance_taxable ? 0 : mealAllowance;
  const taxableMeal = settings.meal_allowance_taxable ? mealAllowance : 0;

  const totalTaxable = declaredHoursIncome + taxableMeal + transportAllowance;
  const totalNonTaxable = nonTaxableMeal + undeclaredHoursIncome;

  return {
    fromWeekdayHours,
    fromSaturdayHours,
    fromSundayHours,
    mealAllowance,
    transportAllowance,
    totalTaxable,
    totalNonTaxable,
    totalGross: totalTaxable + totalNonTaxable,
    weekendIncome,
    weekendDeclared,
  };
}

// ---------------------------------------------------------------------
// 4. Descontos (Segurança Social + IRS)
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
// 5. Função de alto nível — usada pela Dashboard
// ---------------------------------------------------------------------

export function calculatePayslip(params: {
  entries: TimeEntry[];
  settings: UserSettings;
  brackets?: IrsTaxBracket[];
}): PayslipSummary {
  const { entries, settings, brackets = [] } = params;

  const daysWorkedInPeriod = new Set(entries.map((e) => e.entry_date)).size;

  const hours = calculateHoursBreakdown(entries);
  const gross = calculateGrossBreakdown(hours, settings, daysWorkedInPeriod);
  const deductions = calculateDeductions(gross, settings, brackets);

  return {
    hours,
    gross,
    deductions,
    netPay: gross.totalGross - deductions.totalDeductions,
  };
}
