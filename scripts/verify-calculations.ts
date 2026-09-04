// scripts/verify-calculations.ts
// Script de verificação standalone (Plano de Verificação do
// implementation_plan.md + achados da Auditoria_Picagem_XHoras.pdf).
// Corre com `npm run verify` (usa tsx — não faz parte do build da app).
// Sem framework de testes: comparações simples com process.exitCode.

import {
  calculateHoursBreakdown,
  calculateGrossBreakdown,
  calculateIrs,
  calculatePayslip,
} from '../lib/salary-calculator';
import { formatHours, getDayCategory, isPortugueseHoliday, getPortugueseHolidays } from '../lib/time-utils';
import { auditContractLosses } from '../lib/loss-calculator';
import type { IrsTaxBracket, TimeEntry, UserSettings } from '../types/database.types';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(expected - actual) < 0.01
    : actual === expected;
  console.log(`${ok ? '✅' : '❌'} ${label} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

function checkTrue(label: string, condition: boolean) {
  console.log(`${condition ? '✅' : '❌'} ${label}`);
  if (!condition) failures++;
}

function baseSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: 'test-settings-id',
    user_id: 'test-user-id',
    contract_regime: 'effective',
    base_salary: 1500,
    fixed_bonus: 500,
    agreed_total_salary: 2000,
    overtime_fixed_rate: 12,
    extra_meal_value: 9.5,
    irs_marital_status: 'single',
    irs_dependents_count: 0,
    irs_has_disability: false,
    fiscal_region: 'continente',
    holiday_subsidy_month: 1,
    christmas_subsidy_month: 11,
    subsidy_mode: 'full_in_month',
    weekday_rate: 10,
    saturday_extra_per_hour: 2,
    sunday_multiplier: 2,
    payroll_cutoff_day: 20,
    meal_allowance_daily_value: 6,
    meal_allowance_payment_method: 'card',
    meal_allowance_taxable: false,
    bonus_payment_type: 'monthly_installments',
    bonus_lump_sum_month: null,
    transport_allowance_value: 0,
    transport_allowance_frequency: 'monthly',
    health_insurance_value: 0,
    health_insurance_paid_by: 'employer',
    social_security_rate: 11,
    irs_calculation_type: 'bracket',
    irs_fixed_rate: 0,
    declare_weekend_income: false,
    currency: 'EUR',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

console.log('--- F-03: arredondamento de formatHours (bug "Xh 60m") ---');
checkTrue('formatHours(7.995) === "8h" (não "7h 60m")', formatHours(7.995) === '8h');
checkTrue('formatHours(8) === "8h"', formatHours(8) === '8h');
checkTrue('formatHours(7.5) === "7h 30m"', formatHours(7.5) === '7h 30m');

console.log('\n--- F-09: feriados obrigatórios (dia útil ganha categoria "holiday") ---');
const year = new Date().getFullYear();
const holidays = getPortugueseHolidays(year);
checkTrue(`getPortugueseHolidays(${year}) devolve 13 datas`, holidays.length === 13);
checkTrue('25 de Abril é feriado', isPortugueseHoliday(`${year}-04-25`));
checkTrue('25 de Dezembro é feriado', isPortugueseHoliday(`${year}-12-25`));
// 25 de Abril de 2028 cai numa terça-feira (dia útil) — boa data fixa para testar a categoria.
checkTrue('getDayCategory("2028-04-25") === "holiday" (terça-feira)', getDayCategory('2028-04-25') === 'holiday');

console.log('\n--- Regime horista: feriado paga como domingo (Art. 269º CT), não como dia normal ---');
const hourlySettings = baseSettings({ contract_regime: 'hourly', weekday_rate: 10, sunday_multiplier: 2 });
const holidayEntry: TimeEntry[] = [
  { id: '1', user_id: 'u', entry_date: '2028-04-25', hours_worked: 8, notes: null, created_at: '', updated_at: '' },
];
const holidayHours = calculateHoursBreakdown(holidayEntry);
check('8h no feriado são contabilizadas em hours.holiday', holidayHours.holiday, 8);
const holidayGross = calculateGrossBreakdown(holidayHours, hourlySettings, 1);
check('Feriado pago a weekday_rate × sunday_multiplier (10×2×8=160€)', holidayGross.fromHolidayHours, 160);

console.log('\n--- Plano: 1.500€ base + 500€ prémio vs. 2.000€ legal (Art. 264º CT) ---');
const effectiveSettings = baseSettings();
const audit = auditContractLosses({ settings: effectiveSettings, overtimeHours: 10, extraMealsCount: 4 });
check('Perda no subsídio de férias', audit.subsidies.holidaySubsidyLoss, 500);
check('Perda no subsídio de Natal', audit.subsidies.christmasSubsidyLoss, 500);
check('Perda anual estrutural nos subsídios', audit.subsidies.totalAnnualSubsidiesLoss, 1000);

console.log('\n--- Plano: 10h extras a 12€/h (120€) vs. Art. 268º CT (1ª hora 14,42€/h → 144,20€+) ---');
check('Pago pela empresa (10h × 12€)', audit.overtime.paidByEmployer, 120);
check('Devido legalmente, 1ª hora de cada dia (10h × 14,42€)', audit.overtime.legalDueWeekdayFirstHour, 144.2);
checkTrue('Perda direta em horas extras > 0', audit.overtime.directOvertimeLoss > 0);

console.log('\n--- Plano: subsídio de Natal em Novembro vs. Férias em Janeiro (sem duodécimos) ---');
const novemberPayslip = calculatePayslip({ entries: [], settings: effectiveSettings, referenceMonth: 11 });
check('Subsídio de Natal pago em Novembro (= base 1.500€)', novemberPayslip.gross.christmasSubsidy, 1500);
check('Subsídio de Férias NÃO pago em Novembro', novemberPayslip.gross.holidaySubsidy, 0);
const januaryPayslip = calculatePayslip({ entries: [], settings: effectiveSettings, referenceMonth: 1 });
check('Subsídio de Férias pago em Janeiro (= base 1.500€)', januaryPayslip.gross.holidaySubsidy, 1500);

console.log('\n--- F-01: anualização dos escalões anuais de IRS (Art. 68º CIRS) na retenção mensal ---');
const officialAnnualBrackets: IrsTaxBracket[] = [
  { id: 'b1', user_settings_id: 's', min_income: 0, max_income: 8342, rate: 12.5, deduction: 0, created_at: '' },
  { id: 'b2', user_settings_id: 's', min_income: 8342, max_income: 12587, rate: 15.7, deduction: 266.94, created_at: '' },
  { id: 'b3', user_settings_id: 's', min_income: 12587, max_income: 17838, rate: 21.2, deduction: 959.26, created_at: '' },
];
const bracketSettings = baseSettings({ irs_calculation_type: 'bracket' });
// Base tributável mensal de 1.000€ × 14 = 14.000€/ano → cai no escalão dos 21,2% (12.587–17.838€).
const irsMensal = calculateIrs(1000, bracketSettings, officialAnnualBrackets);
check('IRS mensal sobre 1.000€ usando escalões ANUAIS (anualizado ×14, não aplicado direto)', irsMensal, 143.48);

console.log('\n--- Perda líquida na auditoria de perdas (Ricardo, 04/09/2026: os descontos sobre os valores em falta têm de entrar na conta) ---');
const netLossAudit = auditContractLosses({
  settings: effectiveSettings,
  overtimeHours: 10,
  extraMealsCount: 4,
  brackets: officialAnnualBrackets,
});
// Subsídio em falta (500€ bruto): desconta SS (11% = 55€) + IRS sobre os
// restantes 445€, anualizados ×14 (6.230€/ano) → escalão dos 12,5% da tabela
// de teste → IRS mensal ≈ 55,63€. Líquido = 500 - 55 - 55,63 = 389,37€.
checkTrue('Subsídio de férias em falta: perda líquida < perda bruta', netLossAudit.subsidies.holidaySubsidyLossNet < netLossAudit.subsidies.holidaySubsidyLoss);
check('Subsídio de férias em falta: perda líquida (500€ bruto - SS - IRS)', netLossAudit.subsidies.holidaySubsidyLossNet, 389.37);
check('Subsídio de Natal em falta: mesma perda líquida', netLossAudit.subsidies.christmasSubsidyLossNet, 389.37);
check('Total anual líquido nos subsídios (2× 389,37€)', netLossAudit.subsidies.totalAnnualSubsidiesLossNet, 778.74);

// Horas extras em falta (35,80€ bruto): só desconta IRS (sem SS, mesma regra
// de ssTaxableBase), por isso a perda líquida fica mais perto da bruta do
// que a dos subsídios.
checkTrue('Horas extras em falta: perda líquida < perda bruta', netLossAudit.overtime.directOvertimeLossNet < netLossAudit.overtime.directOvertimeLoss);
checkTrue(
  'Horas extras em falta: perda líquida não descontou SS (fica bem mais próxima da bruta do que a dos subsídios)',
  netLossAudit.overtime.directOvertimeLoss - netLossAudit.overtime.directOvertimeLossNet < netLossAudit.subsidies.holidaySubsidyLoss - netLossAudit.subsidies.holidaySubsidyLossNet,
);

checkTrue('Prejuízo total anual líquido < prejuízo total anual bruto', netLossAudit.totalAnnualLossProjectedNet < netLossAudit.totalAnnualLossProjected);

console.log('\n--- Segurança Social no regime efetivo incide só sobre o salário base ---');
const ssSettings = baseSettings({ base_salary: 1500, fixed_bonus: 500, social_security_rate: 11 });
const ssPayslip = calculatePayslip({ entries: [], settings: ssSettings });
check('Base sujeita a SS é só o salário base (1.500€), não 1.500€+500€ de prémio', ssPayslip.gross.ssTaxableBase, 1500);
check('SS descontada é 11% de 1.500€ (165€), não de 2.000€ (220€)', ssPayslip.deductions.socialSecurity, 165);

console.log('\n--- Privacidade: conta nova (sem configuração) não herda os valores de outra conta ---');
const unconfiguredSettings = baseSettings({
  base_salary: 0,
  fixed_bonus: 0,
  agreed_total_salary: 0,
  overtime_fixed_rate: 0,
  extra_meal_value: 0,
});
const unconfiguredPayslip = calculatePayslip({ entries: [], settings: unconfiguredSettings, referenceMonth: 1 });
check('Bruto de uma conta não configurada é 0€ (nunca 1.500€/2.000€ de outra conta)', unconfiguredPayslip.gross.totalGross, 0);
const unconfiguredAudit = auditContractLosses({ settings: unconfiguredSettings, overtimeHours: 10, extraMealsCount: 4 });
check('Auditoria de perdas de uma conta não configurada não usa 2.000€ de outra conta', unconfiguredAudit.agreedRealSalary, 0);
check('Percentagem de perda em indemnização não é NaN quando agreedRealSalary=0', unconfiguredAudit.severance.lossPercentage, 0);

console.log(`\n${failures === 0 ? '✅ Todos os testes passaram.' : `❌ ${failures} teste(s) falharam.`}`);
process.exitCode = failures === 0 ? 0 : 1;
