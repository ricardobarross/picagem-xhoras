// lib/loss-calculator.ts
// Motor de cálculo de perdas laborais e auditoria de direitos sonegados
// comparando as condições praticadas pela entidade patronal com o regime
// legal obrigatório estabelecido pelo Código do Trabalho (Lei n.º 7/2009).

import type { UserSettings } from '@/types/database.types';

export interface OvertimeLossBreakdown {
  hoursCount: number;
  paidByEmployer: number; // Ex: horas * 12€
  legalDueWeekdayFirstHour: number; // horas * 14.42€
  legalDueWeekdaySubsequent: number; // horas * 15.87€
  legalDueWeekendHoliday: number; // horas * 17.31€
  averageLegalDue: number; // Média ponderada legal
  directOvertimeLoss: number; // Diferença a desfavor do trabalhador
}

export interface MealAllowanceLossBreakdown {
  extraMealsCount: number;
  mealUnitValue: number; // Ex: 9.50€
  totalGrossInBonus: number; // 9.50€ * contagem
  estimatedTaxesLostInBonus: number; // ~11% SS + ~15% IRS = ~26% perdidos em impostos indevidos
  netReceivedInBonus: number;
  netIfPaidInCard: number; // 100% isento até 10.20€
  mealLoss: number;
}

export interface SubsidiesLossBreakdown {
  paidHolidaySubsidy: number; // 1500€
  legalHolidaySubsidy: number; // 2000€
  holidaySubsidyLoss: number; // 500€
  paidChristmasSubsidy: number; // 1500€
  legalChristmasSubsidy: number; // 2000€
  christmasSubsidyLoss: number; // 500€
  totalAnnualSubsidiesLoss: number; // 1000€
}

export interface SeveranceImpact {
  severanceBasisEmployer: number; // 1500€
  severanceBasisLegal: number; // 2000€
  lossPercentage: number; // 25%
  lossPerYearOfSeniority: number; // Valor médio por cada ano trabalhado
}

export interface ContractLossAudit {
  // Salários
  declaredBaseSalary: number; // 1500€
  declaredFixedBonus: number; // 500€
  agreedRealSalary: number; // 2000€
  hourlyRateLegal: number; // (2000 * 12) / 2080 = 11.54€/h
  hourlyRateUnderDeclaredBase: number; // (1500 * 12) / 2080 = 8.65€/h

  // Horas Extras (taxas horárias)
  employerOvertimeRate: number; // 12.00€
  legalWeekday1stHourRate: number; // 11.54 * 1.25 = 14.42€ (+2.42€)
  legalWeekdaySubsequentRate: number; // 11.54 * 1.375 = 15.87€ (+3.87€)
  legalWeekendRate: number; // 11.54 * 1.50 = 17.31€ (+5.31€)

  // Perdas estruturais anuais garantidas
  subsidies: SubsidiesLossBreakdown;

  // Simulação com horas e refeições do mês/período
  overtime: OvertimeLossBreakdown;
  meals: MealAllowanceLossBreakdown;

  // Impacto em indemnização futura
  severance: SeveranceImpact;

  // Totais
  totalMonthlyLossSimulated: number;
  totalAnnualLossProjected: number;
}

/**
 * Calcula a retribuição horária legal com base nas 40h semanais (Art. 271º CT).
 * Fórmula: (Salário Mensal * 12) / (52 semanas * 40 horas) = Salário / 173.333
 */
export function calculateLegalHourlyRate(monthlySalary: number): number {
  return Number(((monthlySalary * 12) / 2080).toFixed(2));
}

/**
 * Realiza a auditoria comparativa entre o cenário real da empresa e o regime legal.
 */
export function auditContractLosses(params: {
  settings: UserSettings;
  overtimeHours?: number;
  extraMealsCount?: number;
}): ContractLossAudit {
  const { settings, overtimeHours = 10, extraMealsCount = 4 } = params;

  const declaredBaseSalary = settings.base_salary || 1500;
  const declaredFixedBonus = settings.fixed_bonus || 500;
  const agreedRealSalary = settings.agreed_total_salary || (declaredBaseSalary + declaredFixedBonus) || 2000;

  // Taxas Horárias (Art. 268º do Código do Trabalho)
  const hourlyRateLegal = calculateLegalHourlyRate(agreedRealSalary); // 11.54€
  const hourlyRateUnderDeclaredBase = calculateLegalHourlyRate(declaredBaseSalary); // 8.65€

  const employerOvertimeRate = settings.overtime_fixed_rate || 12.0;

  // Taxas legais mínimas sobre o ordenado real acordado (2000€)
  const legalWeekday1stHourRate = Number((hourlyRateLegal * 1.25).toFixed(2)); // +25% = 14.42€
  const legalWeekdaySubsequentRate = Number((hourlyRateLegal * 1.375).toFixed(2)); // +37.5% = 15.87€
  const legalWeekendRate = Number((hourlyRateLegal * 1.5).toFixed(2)); // +50% = 17.31€

  // Média estimada das horas extras legais (assumindo proporção mista típica: 40% 1ª hora, 40% subsequentes, 20% fds)
  const averageLegalOvertimeRate = Number(
    (legalWeekday1stHourRate * 0.4 + legalWeekdaySubsequentRate * 0.4 + legalWeekendRate * 0.2).toFixed(2),
  );

  // 1. Perda em Subsídios (Art. 264º do CT)
  const paidHolidaySubsidy = declaredBaseSalary;
  const legalHolidaySubsidy = agreedRealSalary;
  const holidaySubsidyLoss = legalHolidaySubsidy - paidHolidaySubsidy;

  const paidChristmasSubsidy = declaredBaseSalary;
  const legalChristmasSubsidy = agreedRealSalary;
  const christmasSubsidyLoss = legalChristmasSubsidy - paidChristmasSubsidy;

  const subsidies: SubsidiesLossBreakdown = {
    paidHolidaySubsidy,
    legalHolidaySubsidy,
    holidaySubsidyLoss,
    paidChristmasSubsidy,
    legalChristmasSubsidy,
    christmasSubsidyLoss,
    totalAnnualSubsidiesLoss: holidaySubsidyLoss + christmasSubsidyLoss,
  };

  // 2. Perda em Horas Extras
  const paidByEmployer = Number((overtimeHours * employerOvertimeRate).toFixed(2));
  const legalDueWeekdayFirstHour = Number((overtimeHours * legalWeekday1stHourRate).toFixed(2));
  const legalDueWeekdaySubsequent = Number((overtimeHours * legalWeekdaySubsequentRate).toFixed(2));
  const legalDueWeekendHoliday = Number((overtimeHours * legalWeekendRate).toFixed(2));
  const averageLegalDue = Number((overtimeHours * averageLegalOvertimeRate).toFixed(2));
  const directOvertimeLoss = Math.max(0, Number((averageLegalDue - paidByEmployer).toFixed(2)));

  const overtime: OvertimeLossBreakdown = {
    hoursCount: overtimeHours,
    paidByEmployer,
    legalDueWeekdayFirstHour,
    legalDueWeekdaySubsequent,
    legalDueWeekendHoliday,
    averageLegalDue,
    directOvertimeLoss,
  };

  // 3. Perda em Refeições Extras Camufladas no Prémio
  const mealUnitValue = settings.extra_meal_value || 9.5;
  const totalGrossInBonus = Number((extraMealsCount * mealUnitValue).toFixed(2));
  // Quando vem em prémio em dinheiro: paga 11% SS + retenção IRS (~15%) = ~26% desconto indevido
  const estimatedTaxPercentage = 0.26;
  const estimatedTaxesLostInBonus = Number((totalGrossInBonus * estimatedTaxPercentage).toFixed(2));
  const netReceivedInBonus = Number((totalGrossInBonus - estimatedTaxesLostInBonus).toFixed(2));
  const netIfPaidInCard = totalGrossInBonus; // Até 10.20€/dia em cartão é 100% isento
  const mealLoss = estimatedTaxesLostInBonus;

  const meals: MealAllowanceLossBreakdown = {
    extraMealsCount,
    mealUnitValue,
    totalGrossInBonus,
    estimatedTaxesLostInBonus,
    netReceivedInBonus,
    netIfPaidInCard,
    mealLoss,
  };

  // 4. Impacto em Indemnização por Despedimento (Art. 366º CT)
  // Calculado com base na retribuição base. Exemplo: 12 a 14 dias de base por ano de antiguidade.
  const daysPerYear = 14;
  const severanceBasisEmployer = declaredBaseSalary;
  const severanceBasisLegal = agreedRealSalary;
  const dailyRateEmployer = declaredBaseSalary / 30;
  const dailyRateLegal = agreedRealSalary / 30;
  const lossPerYearOfSeniority = Number(((dailyRateLegal - dailyRateEmployer) * daysPerYear).toFixed(2));
  const lossPercentage = Number((((severanceBasisLegal - severanceBasisEmployer) / severanceBasisLegal) * 100).toFixed(1));

  const severance: SeveranceImpact = {
    severanceBasisEmployer,
    severanceBasisLegal,
    lossPercentage,
    lossPerYearOfSeniority,
  };

  // Totais
  const totalMonthlyLossSimulated = Number((directOvertimeLoss + mealLoss).toFixed(2));
  // Anual = 1000€ dos subsídios + 11 meses de horas extras e refeições estimadas
  const totalAnnualLossProjected = Number(
    (subsidies.totalAnnualSubsidiesLoss + totalMonthlyLossSimulated * 11).toFixed(2),
  );

  return {
    declaredBaseSalary,
    declaredFixedBonus,
    agreedRealSalary,
    hourlyRateLegal,
    hourlyRateUnderDeclaredBase,
    employerOvertimeRate,
    legalWeekday1stHourRate,
    legalWeekdaySubsequentRate,
    legalWeekendRate,
    subsidies,
    overtime,
    meals,
    severance,
    totalMonthlyLossSimulated,
    totalAnnualLossProjected,
  };
}
