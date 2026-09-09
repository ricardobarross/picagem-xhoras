// lib/audit-report.ts
// Motor de dados do "Laudo de Auditoria" (relatório formal, exportável em
// PDF) — pedido por Ricardo (09/09/2026): "quero descrição de todos os
// valores, mês, ano e total". Ao contrário do simulador interativo de
// lib/loss-calculator.ts (que usa um número de horas/refeições hipotético
// para UM mês), este ficheiro constrói o relatório a partir dos recibos
// reais que a pessoa registou em /recibos (payslip_receipts) — mês a mês,
// com subtotal por ano e total geral.
//
// Fica deliberadamente conservador: só apura um "prejuízo" quantificado
// (com valor em €) na rubrica onde a fórmula legal é inequívoca e não
// depende de dados que não temos (horas exactas trabalhadas em meses
// anteriores ao uso da Picagem, taxa de IRS aplicada em cada recibo, etc.):
// o Subsídio de Férias/Natal, Art. 264º, nº 2 do CT — que deve corresponder
// à retribuição regular (Vencimento Base + Gratificação/Prémio), não só ao
// Vencimento Base. Todas as outras rubricas (Gratificação, Horas Extras,
// Subsídio de Alimentação, Segurança Social, IRS, Líquido) entram só como
// registo informativo mês a mês, tal como já acontece em /recibos — sem
// inventar um "valor devido" que não se consegue fundamentar com os dados
// disponíveis.

import type { PayslipReceipt, SubsidyPaymentOverride, UserSettings } from '@/types/database.types';
import { resolveSubsidyMonths } from './salary-calculator';
import { monthNamePt } from './time-utils';

export interface MonthlyRegistryRow {
  year: number;
  month: number;
  monthLabel: string;
  baseSalaryPaid: number | null;
  bonusPaid: number | null;
  overtimePaid: number | null;
  mealAllowancePaid: number | null;
  socialSecurityPaid: number | null;
  irsPaid: number | null;
  netPayPaid: number | null;
  notes: string | null;
}

export interface SubsidyAuditRow {
  year: number;
  month: number;
  monthLabel: string;
  type: 'holiday' | 'christmas';
  typeLabel: string;
  regularPayBasis: number; // média anual de Vencimento Base + Gratificação usada como "retribuição regular"
  due: number; // = regularPayBasis (o que o Art. 264º exige)
  paid: number; // o que consta no recibo real desse mês
  diff: number; // paid - due (negativo = prejuízo para o trabalhador)
}

export interface YearTotal {
  year: number;
  shortfall: number; // soma dos prejuízos (valor absoluto) desse ano
  rowCount: number;
}

export interface AuditReportData {
  hasReceipts: boolean;
  periodLabel: string | null; // ex: "Janeiro de 2025 a Agosto de 2026"
  monthlyRegistry: MonthlyRegistryRow[];
  subsidyRows: SubsidyAuditRow[];
  yearTotals: YearTotal[];
  grandTotalShortfall: number;
}

function sortReceipts(a: PayslipReceipt, b: PayslipReceipt) {
  if (a.reference_year !== b.reference_year) return a.reference_year - b.reference_year;
  return a.reference_month - b.reference_month;
}

export function buildAuditReport(params: {
  settings: UserSettings;
  overrides: SubsidyPaymentOverride[];
  receipts: PayslipReceipt[];
}): AuditReportData {
  const { settings, overrides, receipts } = params;
  const sorted = [...receipts].sort(sortReceipts);

  const monthlyRegistry: MonthlyRegistryRow[] = sorted.map((r) => ({
    year: r.reference_year,
    month: r.reference_month,
    monthLabel: monthNamePt(r.reference_month),
    baseSalaryPaid: r.received_base_salary,
    bonusPaid: r.received_bonus,
    overtimePaid: r.received_overtime,
    mealAllowancePaid: r.received_meal_allowance,
    socialSecurityPaid: r.received_social_security,
    irsPaid: r.received_irs,
    netPayPaid: r.received_net_pay,
    notes: r.notes,
  }));

  if (sorted.length === 0) {
    return {
      hasReceipts: false,
      periodLabel: null,
      monthlyRegistry: [],
      subsidyRows: [],
      yearTotals: [],
      grandTotalShortfall: 0,
    };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const periodLabel = `${monthNamePt(first.reference_month)} de ${first.reference_year} a ${monthNamePt(last.reference_month)} de ${last.reference_year}`;

  const years = Array.from(new Set(sorted.map((r) => r.reference_year))).sort((a, b) => a - b);

  // Retribuição regular média de cada ano civil: Vencimento Base +
  // Gratificação/Prémio efetivamente pagos, nos meses desse ano com recibo
  // registado — é a base que o Art. 264º, nº 2 do CT manda usar para os
  // subsídios de férias/Natal (não só o Vencimento Base isolado).
  const yearRegularPay = new Map<number, number>();
  for (const year of years) {
    const monthsInYear = sorted.filter((r) => r.reference_year === year && r.received_base_salary !== null);
    if (monthsInYear.length === 0) continue;
    const sum = monthsInYear.reduce(
      (acc, r) => acc + (r.received_base_salary ?? 0) + (r.received_bonus ?? 0),
      0,
    );
    yearRegularPay.set(year, Number((sum / monthsInYear.length).toFixed(2)));
  }

  const subsidyRows: SubsidyAuditRow[] = [];
  for (const year of years) {
    const regularPay = yearRegularPay.get(year);
    if (regularPay === undefined) continue;
    const subsidyMonths = resolveSubsidyMonths(settings, overrides, year);

    const holidayReceipt = sorted.find(
      (r) => r.reference_year === year && r.reference_month === subsidyMonths.holiday,
    );
    if (holidayReceipt && holidayReceipt.received_holiday_subsidy !== null) {
      const paid = holidayReceipt.received_holiday_subsidy;
      subsidyRows.push({
        year,
        month: subsidyMonths.holiday,
        monthLabel: monthNamePt(subsidyMonths.holiday),
        type: 'holiday',
        typeLabel: 'Subsídio de Férias',
        regularPayBasis: regularPay,
        due: regularPay,
        paid,
        diff: Number((paid - regularPay).toFixed(2)),
      });
    }

    const christmasReceipt = sorted.find(
      (r) => r.reference_year === year && r.reference_month === subsidyMonths.christmas,
    );
    if (christmasReceipt && christmasReceipt.received_christmas_subsidy !== null) {
      const paid = christmasReceipt.received_christmas_subsidy;
      subsidyRows.push({
        year,
        month: subsidyMonths.christmas,
        monthLabel: monthNamePt(subsidyMonths.christmas),
        type: 'christmas',
        typeLabel: 'Subsídio de Natal',
        regularPayBasis: regularPay,
        due: regularPay,
        paid,
        diff: Number((paid - regularPay).toFixed(2)),
      });
    }
  }
  subsidyRows.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  const yearTotals: YearTotal[] = years
    .map((year) => {
      const rows = subsidyRows.filter((r) => r.year === year);
      const shortfall = rows.reduce((acc, r) => acc + Math.max(0, -r.diff), 0);
      return { year, shortfall: Number(shortfall.toFixed(2)), rowCount: rows.length };
    })
    .filter((y) => y.rowCount > 0);

  const grandTotalShortfall = Number(yearTotals.reduce((acc, y) => acc + y.shortfall, 0).toFixed(2));

  return {
    hasReceipts: true,
    periodLabel,
    monthlyRegistry,
    subsidyRows,
    yearTotals,
    grandTotalShortfall,
  };
}
