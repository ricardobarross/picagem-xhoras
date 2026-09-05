// lib/salary-calculator.ts
// Motor de cálculo do salário líquido a partir dos registos diários de
// horas (TimeEntry[]) e da configuração remuneratória (UserSettings).
//
// Suporta dois regimes:
//   1. 'effective': Contrato Efetivo / Trabalho por Conta de Outrem em Portugal:
//      - Vencimento base mensal (ex: 1500€)
//      - Prémio fixo regular (ex: 500€)
//      - Horas extras remuneradas a taxa fixa acordada (ex: 12€/h)
//      - Refeições extras (ex: 9.50€)
//      - Subsídios de Férias e Natal por inteiro no mês estipulado (ex: Jan/Nov)
//   2. 'hourly': Prestação de serviços / trabalho por hora:
//      - Dia útil: weekday_rate €/h
//      - Sábado: weekday_rate + saturday_extra_per_hour
//      - Domingo: weekday_rate × sunday_multiplier

import type { TimeEntry, UserSettings, IrsTaxBracket, SubsidyPaymentOverride } from '@/types/database.types';
import { getDayCategory } from './time-utils';

export interface HoursBreakdown {
  weekday: number;
  saturday: number;
  sunday: number;
  holiday: number; // Feriados obrigatórios que caem em dia útil (ver getDayCategory)
  total: number;
  standardHours: number; // Horas dentro do horário normal (até 8h/dia útil)
  overtimeHours: number; // Horas além das 8h, em fim de semana, ou em feriado
}

export interface AbsencesBreakdown {
  unjustifiedAbsenceHours: number; // Faltas Hora Injustificada
  sickLeaveDays: number; // Baixa médica (dias inteiros)
  justifiedAbsenceDays: number; // Falta justificada (Art. 255º CT — sem perda de retribuição)
}

export interface GrossBreakdown {
  fromWeekdayHours: number;
  fromSaturdayHours: number;
  fromSundayHours: number;
  fromHolidayHours: number;
  mealAllowance: number;
  transportAllowance: number;
  totalTaxable: number; // entra para a base de IRS ("valor declarado")
  totalNonTaxable: number; // isento / não declarado (recebido sem descontos)
  totalGross: number; // taxable + nonTaxable — o que a pessoa recebe no total
  // Base de incidência da Segurança Social. Confirmado com os recibos
  // reais partilhados por Ricardo (04/09/2026, recibos de mai/jul/set/nov
  // 2025): o "Valor sujeito a SS" de cada mês é sempre o Vencimento Base
  // (líquido de faltas/baixa) + Subsídio de Férias/Natal + Prémio de
  // Produção quando pago — e exclui sempre a "Gratificação" (o prémio
  // fixo/variável usado para camuflar excedentes). Ex: novembro/2025,
  // Valor sujeito a SS = 3.081,41€ = 1.250,00 (base) + 1.210,41 (subsídio
  // de Natal) + 621,00 (prémio de produção); ficou de fora só a
  // Gratificação de 300,00€. No regime efetivo, ssTaxableBase inclui por
  // isso o salário base e os subsídios de férias/Natal — mas continua a
  // excluir o prémio fixo, horas extras e refeições extras (ainda
  // tratados como "Gratificação"/camuflagem, tal como no recibo real).
  // Base usada para o IRS (totalTaxable) mantém-se inalterada. No regime
  // horista mantém-se igual ao totalTaxable, como sempre foi.
  ssTaxableBase: number;
  weekendIncome: number; // fromSaturdayHours + fromSundayHours, para referência no dashboard
  weekendDeclared: boolean; // eco de settings.declare_weekend_income, para a UI

  // Campos específicos de Contrato Efetivo
  baseSalary: number;
  fixedBonus: number;
  overtimeIncome: number;
  extraMealsIncome: number;
  holidaySubsidy: number;
  christmasSubsidy: number;
  contractRegime: 'effective' | 'hourly';

  // Faltas/baixa (só têm efeito no regime efetivo — confirmado com recibos
  // reais de mai/jul/set 2025, Metalomecânica 3 Triângulos: "Faltas Hora
  // Injustificada" desconta ao valor/hora legal (base×12/2080, arredondado
  // a 2 casas antes de multiplicar — dá exatamente os 7,21€/h do recibo) e
  // "Baixa" desconta ao valor/dia (base/30, dá exatamente os 41,67€/dia do
  // recibo). Ambas reduzem o Vencimento Base e por isso também a base de
  // SS/IRS. Falta justificada não desconta nada (Art. 255º CT), fica só
  // registada para referência.
  unjustifiedAbsenceHours: number;
  unjustifiedAbsenceDeduction: number;
  sickLeaveDays: number;
  sickLeaveDeduction: number;
  justifiedAbsenceDays: number;
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
// 1. Horas por categoria de dia e separação normal/extra
// ---------------------------------------------------------------------

export function calculateHoursBreakdown(entries: TimeEntry[]): HoursBreakdown {
  const breakdown: HoursBreakdown = {
    weekday: 0,
    saturday: 0,
    sunday: 0,
    holiday: 0,
    total: 0,
    standardHours: 0,
    overtimeHours: 0,
  };

  for (const entry of entries) {
    // Faltas/baixa/falta justificada não são horas trabalhadas — são
    // contabilizadas à parte em calculateAbsencesBreakdown.
    if ((entry.entry_type ?? 'work') !== 'work') continue;
    const category = getDayCategory(entry.entry_date);
    const hoursWorked = entry.hours_worked ?? 0;
    breakdown[category] += hoursWorked;
    breakdown.total += hoursWorked;

    if (category === 'weekday') {
      const normal = Math.min(8, hoursWorked);
      const extra = Math.max(0, hoursWorked - 8);
      breakdown.standardHours += normal;
      breakdown.overtimeHours += extra;
    } else {
      // Fim de semana e feriados contam como horas extra / suplementares no regime padrão
      breakdown.overtimeHours += hoursWorked;
    }
  }

  return breakdown;
}

// ---------------------------------------------------------------------
// 2b. Faltas e baixa no período
// ---------------------------------------------------------------------

export function calculateAbsencesBreakdown(entries: TimeEntry[]): AbsencesBreakdown {
  const breakdown: AbsencesBreakdown = {
    unjustifiedAbsenceHours: 0,
    sickLeaveDays: 0,
    justifiedAbsenceDays: 0,
  };

  for (const entry of entries) {
    if (entry.entry_type === 'unjustified_absence') {
      breakdown.unjustifiedAbsenceHours += entry.hours_worked ?? 0;
    } else if (entry.entry_type === 'sick_leave') {
      breakdown.sickLeaveDays += 1; // um registo = um dia inteiro de baixa
    } else if (entry.entry_type === 'justified_absence') {
      breakdown.justifiedAbsenceDays += 1;
    }
  }

  return breakdown;
}

// Resolve em que mês cada subsídio (férias/Natal) se aplica num dado ano:
// usa o override em subsidy_payment_overrides para esse ano/tipo quando
// existe, senão cai para o mês padrão configurado em UserSettings. Útil
// para empresas (como a de Ricardo) onde o subsídio de férias não é
// automático e muda de mês de ano para ano.
export function resolveSubsidyMonths(
  settings: UserSettings,
  overrides: SubsidyPaymentOverride[],
  year: number,
): { holiday: number; christmas: number } {
  const holidayOverride = overrides.find((o) => o.reference_year === year && o.subsidy_type === 'holiday');
  const christmasOverride = overrides.find((o) => o.reference_year === year && o.subsidy_type === 'christmas');
  return {
    holiday: holidayOverride?.received_month ?? (settings.holiday_subsidy_month || 1),
    christmas: christmasOverride?.received_month ?? (settings.christmas_subsidy_month || 11),
  };
}

// ---------------------------------------------------------------------
// 2–3. Rendimento bruto
// ---------------------------------------------------------------------

export function calculateGrossBreakdown(
  hours: HoursBreakdown,
  settings: UserSettings,
  daysWorkedInPeriod: number,
  referenceMonth?: number, // 1 a 12
  absences: AbsencesBreakdown = { unjustifiedAbsenceHours: 0, sickLeaveDays: 0, justifiedAbsenceDays: 0 },
  // Substitui, só para este cálculo, em que mês cada subsídio é pago —
  // usado quando há um registo em subsidy_payment_overrides para o ano em
  // curso (empresas onde o subsídio não é automático nem sempre no mesmo
  // mês). Sem override, usa-se sempre settings.holiday_subsidy_month /
  // settings.christmas_subsidy_month, como antes.
  subsidyMonths: { holiday: number; christmas: number } = {
    holiday: settings.holiday_subsidy_month || 1,
    christmas: settings.christmas_subsidy_month || 11,
  },
): GrossBreakdown {
  const isEffective = settings.contract_regime === 'effective';

  // Subsídios de transporte e alimentação padrão
  const mealAllowance = settings.meal_allowance_daily_value * daysWorkedInPeriod;
  const transportAllowance =
    settings.transport_allowance_frequency === 'daily'
      ? settings.transport_allowance_value * daysWorkedInPeriod
      : settings.transport_allowance_value;

  if (isEffective) {
    // Sem fallback para um valor "de exemplo": um utilizador que ainda não
    // configurou o regime efetivo (base_salary = 0) deve ver 0€, nunca os
    // valores de outra conta — o aviso "rateMissing" no dashboard já cobre
    // este caso pedindo para preencher Configurações.
    const baseSalary = settings.base_salary || 0;
    const fixedBonus = settings.fixed_bonus || 0;
    const overtimeRate = settings.overtime_fixed_rate || 0;
    const overtimeIncome = hours.overtimeHours * overtimeRate;

    // Refeições extras estimadas: 1 por dia com mais de 2h extras ou fins de semana trabalhados
    const extraMealValue = settings.extra_meal_value || 0;
    // Considera refeições extras se houver horas suplementares significativas
    const estimatedExtraMeals = Math.floor(hours.overtimeHours / 3);
    const extraMealsIncome = estimatedExtraMeals * extraMealValue;

    // Subsídios de Férias e Natal se o mês coincidir
    let holidaySubsidy = 0;
    let christmasSubsidy = 0;
    if (referenceMonth !== undefined) {
      if (referenceMonth === subsidyMonths.holiday) {
        holidaySubsidy = baseSalary; // A empresa paga apenas sobre o base
      }
      if (referenceMonth === subsidyMonths.christmas) {
        christmasSubsidy = baseSalary; // A empresa paga apenas sobre o base
      }
    }

    // No modelo da empresa do utilizador:
    // Horas extras e refeições extras vêm camufladas dentro da rubrica de prémio/gratificação
    const totalBonusAndExtras = fixedBonus + overtimeIncome + extraMealsIncome;

    // Faltas injustificadas (por hora) e baixa (por dia) descontam ao
    // Vencimento Base — confirmado com os recibos reais (ver comentário em
    // GrossBreakdown). O valor/hora e o valor/dia são arredondados a 2
    // casas antes de multiplicar pelas horas/dias, tal como aparece
    // discriminado no recibo (7,21€/h e 41,67€/dia para um base de 1.250€).
    const legalHourlyRate = Number((((baseSalary * 12) / 2080)).toFixed(2)); // Art. 271º CT
    const dailyRate = Number((baseSalary / 30).toFixed(2));
    const unjustifiedAbsenceDeduction = Number((absences.unjustifiedAbsenceHours * legalHourlyRate).toFixed(2));
    const sickLeaveDeduction = Number((absences.sickLeaveDays * dailyRate).toFixed(2));
    const totalAbsenceDeductions = Number((unjustifiedAbsenceDeduction + sickLeaveDeduction).toFixed(2));

    // Tributação: Base + Prémio + Subsídios tributáveis + Subsídios de férias/natal - Faltas/Baixa
    const nonTaxableMeal = settings.meal_allowance_taxable ? 0 : mealAllowance;
    const taxableMeal = settings.meal_allowance_taxable ? mealAllowance : 0;

    const totalTaxable =
      baseSalary +
      totalBonusAndExtras +
      taxableMeal +
      transportAllowance +
      holidaySubsidy +
      christmasSubsidy -
      totalAbsenceDeductions;
    const totalNonTaxable = nonTaxableMeal;
    const totalGross = totalTaxable + totalNonTaxable;

    return {
      fromWeekdayHours: baseSalary,
      fromSaturdayHours: hours.saturday * overtimeRate,
      fromSundayHours: hours.sunday * overtimeRate,
      fromHolidayHours: hours.holiday * overtimeRate,
      mealAllowance,
      transportAllowance,
      totalTaxable,
      totalNonTaxable,
      totalGross,
      ssTaxableBase: baseSalary + holidaySubsidy + christmasSubsidy - totalAbsenceDeductions,
      weekendIncome: (hours.saturday + hours.sunday) * overtimeRate,
      weekendDeclared: true,
      baseSalary,
      fixedBonus,
      overtimeIncome,
      extraMealsIncome,
      holidaySubsidy,
      christmasSubsidy,
      contractRegime: 'effective',
      unjustifiedAbsenceHours: absences.unjustifiedAbsenceHours,
      unjustifiedAbsenceDeduction,
      sickLeaveDays: absences.sickLeaveDays,
      sickLeaveDeduction,
      justifiedAbsenceDays: absences.justifiedAbsenceDays,
    };
  }

  // --- Modo Horista / Prestação de Serviços (Original) ---
  const weekdayRate = settings.weekday_rate;
  const saturdayRate = weekdayRate + settings.saturday_extra_per_hour;
  const sundayRate = weekdayRate * settings.sunday_multiplier;
  // Não há uma coluna própria para a taxa de feriado (ver migrações) — a
  // lei equipara o descanso em feriado ao de domingo (Art. 269º CT), por
  // isso reutiliza-se o mesmo multiplicador do domingo.
  const holidayRate = weekdayRate * settings.sunday_multiplier;

  const fromWeekdayHours = hours.weekday * weekdayRate;
  const fromSaturdayHours = hours.saturday * saturdayRate;
  const fromSundayHours = hours.sunday * sundayRate;
  const fromHolidayHours = hours.holiday * holidayRate;

  const weekendIncome = fromSaturdayHours + fromSundayHours;
  const premiumIncome = weekendIncome + fromHolidayHours;
  const weekendDeclared = settings.declare_weekend_income;

  const declaredHoursIncome = fromWeekdayHours + (weekendDeclared ? premiumIncome : 0);
  const undeclaredHoursIncome = weekendDeclared ? 0 : premiumIncome;

  const nonTaxableMeal = settings.meal_allowance_taxable ? 0 : mealAllowance;
  const taxableMeal = settings.meal_allowance_taxable ? mealAllowance : 0;

  const totalTaxable = declaredHoursIncome + taxableMeal + transportAllowance;
  const totalNonTaxable = nonTaxableMeal + undeclaredHoursIncome;

  return {
    fromWeekdayHours,
    fromSaturdayHours,
    fromSundayHours,
    fromHolidayHours,
    mealAllowance,
    transportAllowance,
    totalTaxable,
    totalNonTaxable,
    totalGross: totalTaxable + totalNonTaxable,
    ssTaxableBase: totalTaxable,
    weekendIncome,
    weekendDeclared,
    baseSalary: 0,
    fixedBonus: 0,
    overtimeIncome: 0,
    extraMealsIncome: 0,
    holidaySubsidy: 0,
    christmasSubsidy: 0,
    contractRegime: 'hourly',
    // Faltas/baixa só têm efeito no regime efetivo (ver comentário em
    // GrossBreakdown) — no regime horista quem não trabalha simplesmente
    // não recebe por essas horas, sem rubrica de desconto própria.
    unjustifiedAbsenceHours: 0,
    unjustifiedAbsenceDeduction: 0,
    sickLeaveDays: 0,
    sickLeaveDeduction: 0,
    justifiedAbsenceDays: 0,
  };
}

// ---------------------------------------------------------------------
// 4. Descontos (Segurança Social + IRS)
// ---------------------------------------------------------------------

export function calculateIrs(
  taxableBase: number,
  settings: UserSettings,
  brackets: IrsTaxBracket[],
): number {
  if (taxableBase <= 0) return 0;

  if (settings.irs_calculation_type === 'fixed_rate') {
    return taxableBase * (settings.irs_fixed_rate / 100);
  }

  if (brackets.length === 0) return 0;

  // Deteção inteligente de escalões anuais (CIRS Art. 68º) vs escalões mensais:
  // Se o menor limiar > 3000 ou maior limiar > 5000, a tabela é anual.
  const isAnnualScale = brackets.some((b) => b.min_income > 3000 || (b.max_income !== null && b.max_income > 5000));

  if (isAnnualScale) {
    // Anualização fiscal para folha de pagamento (base × 14 meses)
    const annualBase = taxableBase * 14;
    const bracket = brackets
      .filter((b) => annualBase >= b.min_income && (b.max_income === null || annualBase <= b.max_income))
      .sort((a, b) => b.min_income - a.min_income)[0];

    if (!bracket) return 0;
    const annualTax = Math.max(0, annualBase * (bracket.rate / 100) - bracket.deduction);
    return Math.round((annualTax / 14) * 100) / 100;
  }

  // Tabela em valores mensais diretos
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
  const ssRate = settings.social_security_rate || 11;
  const socialSecurity = gross.ssTaxableBase * (ssRate / 100);
  const irsBase = Math.max(0, gross.totalTaxable - socialSecurity); // SS dedutível antes do IRS
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
  referenceMonth?: number; // 1 a 12
  subsidyMonths?: { holiday: number; christmas: number };
}): PayslipSummary {
  const { entries, settings, brackets = [], referenceMonth, subsidyMonths } = params;

  const daysWorkedInPeriod = new Set(entries.map((e) => e.entry_date)).size;

  const hours = calculateHoursBreakdown(entries);
  const absences = calculateAbsencesBreakdown(entries);
  const gross = subsidyMonths
    ? calculateGrossBreakdown(hours, settings, daysWorkedInPeriod, referenceMonth, absences, subsidyMonths)
    : calculateGrossBreakdown(hours, settings, daysWorkedInPeriod, referenceMonth, absences);
  const deductions = calculateDeductions(gross, settings, brackets);

  return {
    hours,
    gross,
    deductions,
    netPay: gross.totalGross - deductions.totalDeductions,
  };
}
