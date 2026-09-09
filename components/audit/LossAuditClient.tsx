'use client';

// components/audit/LossAuditClient.tsx
// Dashboard interativo de auditoria de direitos sonegados e perdas laborais.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  Calculator,
  CheckCircle2,
  FileText,
  HelpCircle,
  Scale,
  ShieldAlert,
  TrendingDown,
  Upload,
} from 'lucide-react';
import type { IrsTaxBracket, PayslipReceipt, SubsidyPaymentOverride, UserSettings } from '@/types/database.types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { auditContractLosses } from '@/lib/loss-calculator';
import { buildAuditReport } from '@/lib/audit-report';
import { AuditReportDocument } from '@/components/audit/AuditReportDocument';

function euro(value: number) {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function monthName(month: number): string {
  return MONTH_NAMES_PT[month - 1] ?? 'mês configurado';
}

export function LossAuditClient({
  initialSettings,
  brackets = [],
  receipts = [],
  overrides = [],
  userName,
  companyName,
}: {
  initialSettings: UserSettings;
  brackets?: IrsTaxBracket[];
  receipts?: PayslipReceipt[];
  overrides?: SubsidyPaymentOverride[];
  userName: string;
  companyName?: string | null;
}) {
  // Simuladores interativos
  const [simulatedOtHours, setSimulatedOtHours] = useState(15);
  const [simulatedExtraMeals, setSimulatedExtraMeals] = useState(6);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const audit = auditContractLosses({
    settings: initialSettings,
    overtimeHours: simulatedOtHours,
    extraMealsCount: simulatedExtraMeals,
    brackets,
  });

  const report = useMemo(
    () => buildAuditReport({ settings: initialSettings, overrides, receipts }),
    [initialSettings, overrides, receipts],
  );

  const holidayMonthName = monthName(initialSettings.holiday_subsidy_month);
  const christmasMonthName = monthName(initialSettings.christmas_subsidy_month);
  // A mesma taxa de perda fiscal (~26% de SS+IRS) usada em audit.meals, aplicada
  // por refeição em vez de ao total simulado, para a linha da tabela comparativa.
  const netPerMealInBonus = Number((audit.meals.mealUnitValue * 0.74).toFixed(2));
  const lossPerMeal = Number((audit.meals.mealUnitValue - netPerMealInBonus).toFixed(2));

  if (showReport) {
    return (
      <AuditReportDocument
        onBack={() => setShowReport(false)}
        audit={audit}
        report={report}
        userName={userName}
        companyName={companyName}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto pb-16">
      {/* 1. Header com Alerta de Impacto */}
      <div className="rounded-xl border border-[var(--warn)]/25 bg-[var(--warn-soft)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-[var(--warn)]/15 p-3 text-[var(--warn-text)]">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Auditoria de Perdas Contratuais
                </h1>
                <span className="rounded bg-[var(--warn)]/15 px-2.5 py-0.5 text-xs font-semibold text-[var(--warn-text)]">
                  Direitos Sonegados
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Análise minuciosa entre o salário acordado de{' '}
                <strong className="text-foreground">{euro(audit.agreedRealSalary)}</strong> e a divisão
                imposta pela empresa ({euro(audit.declaredBaseSalary)} base + {euro(audit.declaredFixedBonus)} prémio).
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={() => setShowReport(true)} className="gap-2 whitespace-nowrap">
              <FileText className="h-4 w-4" />
              Gerar Relatório de Auditoria
            </Button>
            <Link href="/configuracoes">
              <Button variant="outline" size="sm" className="w-full whitespace-nowrap">
                Ajustar Dados em Configurações
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Grandes Números de Prejuízo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Perda Anual em Subsídios */}
        <Card className="border-[var(--warn)]/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Perda Anual em Subsídios</span>
              <TrendingDown className="h-4 w-4 text-[var(--warn)]" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[var(--warn-text)]">
              -{euro(audit.subsidies.totalAnnualSubsidiesLossNet)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Valor líquido estimado (já descontados SS + IRS). Bruto exigido pela lei:{' '}
              {euro(audit.subsidies.totalAnnualSubsidiesLoss)} (-{euro(audit.subsidies.christmasSubsidyLoss)} no
              Subsídio de Natal em {christmasMonthName} e -{euro(audit.subsidies.holidaySubsidyLoss)} no Subsídio de
              Férias em {holidayMonthName}).
            </p>
          </CardContent>
        </Card>

        {/* Perda Média por Hora Extra */}
        <Card className="border-[var(--warn)]/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Prejuízo por Hora Extra</span>
              <ArrowDownRight className="h-4 w-4 text-[var(--warn)]" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[var(--warn-text)]">
              -{(audit.legalWeekdaySubsequentRate - audit.employerOvertimeRate).toFixed(2)} €/h
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recebes {euro(audit.employerOvertimeRate)}/h. O valor legal devido vai até {euro(audit.legalWeekendRate)}/h.
            </p>
          </CardContent>
        </Card>

        {/* Desconto Indevido em Refeições */}
        <Card className="border-[var(--warn)]/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Impostos em Refeições</span>
              <AlertTriangle className="h-4 w-4 text-[var(--warn)]" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[var(--warn-text)]">~26%</div>
            <p className="mt-1 text-xs text-muted-foreground">
              A refeição extra ({euro(audit.meals.mealUnitValue)}) no prémio paga SS e IRS, em vez de 100% isenta em cartão.
            </p>
          </CardContent>
        </Card>

        {/* Impacto em Indemnização */}
        <Card className="border-[var(--accent)] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Indemnização Futura</span>
              <Scale className="h-4 w-4 text-[var(--accent-dark)]" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[var(--accent-dark)]">
              -{audit.severance.lossPercentage}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Menos {euro(audit.severance.lossPerYearOfSeniority)} por cada ano de casa em caso de cessação.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Tabela Comparativa Lado a Lado */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Tabela Comparativa: O Que a Empresa Paga vs. O Que a Lei Exige
          </CardTitle>
          <CardDescription>
            Comparativo detalhado fundamentado no Código do Trabalho português para o teu salário acordado de {euro(audit.agreedRealSalary)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Direito / Rubrica</th>
                  <th className="px-4 py-3">Praticado Pela Empresa</th>
                  <th className="px-4 py-3">Exigido Pela Lei (CT)</th>
                  <th className="px-4 py-3 text-right">Prejuízo Para Ti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Salário Base Mensal
                    <span className="block text-xs font-normal text-muted-foreground">
                      Base oficial para todos os cálculos
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--warn-text)] font-semibold">
                    {euro(audit.declaredBaseSalary)} (+ {euro(audit.declaredFixedBonus)} prémio)
                  </td>
                  <td className="px-4 py-3 text-[var(--accent-dark)] font-semibold">
                    {euro(audit.agreedRealSalary)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    Art. 258º e 260º CT
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Subsídio de Férias ({holidayMonthName})
                    <span className="block text-xs font-normal text-muted-foreground">
                      Calculado sobre a retribuição efetiva
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{euro(audit.subsidies.paidHolidaySubsidy)}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{euro(audit.subsidies.legalHolidaySubsidy)}</td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(audit.subsidies.holidaySubsidyLossNet)}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      bruto: {euro(audit.subsidies.holidaySubsidyLoss)}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Subsídio de Natal ({christmasMonthName})
                    <span className="block text-xs font-normal text-muted-foreground">
                      Igual a 1 mês de remuneração
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{euro(audit.subsidies.paidChristmasSubsidy)}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{euro(audit.subsidies.legalChristmasSubsidy)}</td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(audit.subsidies.christmasSubsidyLossNet)}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      bruto: {euro(audit.subsidies.christmasSubsidyLoss)}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Horas Extras em Dia Útil (1.ª hora)
                    <span className="block text-xs font-normal text-muted-foreground">
                      Art. 268º, nº 1, al. a): +25% sobre valor/hora
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{euro(audit.employerOvertimeRate)}/h</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{euro(audit.legalWeekday1stHourRate)}/h</td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(audit.legalWeekday1stHourRate - audit.employerOvertimeRate)}/h
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Horas Extras em Dia Útil (Horas seguintes)
                    <span className="block text-xs font-normal text-muted-foreground">
                      Art. 268º, nº 1, al. a): +37,5% sobre valor/hora
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{euro(audit.employerOvertimeRate)}/h</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{euro(audit.legalWeekdaySubsequentRate)}/h</td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(audit.legalWeekdaySubsequentRate - audit.employerOvertimeRate)}/h
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Horas Extras Fim de Semana / Feriado
                    <span className="block text-xs font-normal text-muted-foreground">
                      Art. 268º, nº 1, al. b): +50% sobre valor/hora
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{euro(audit.employerOvertimeRate)}/h</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{euro(audit.legalWeekendRate)}/h</td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(audit.legalWeekendRate - audit.employerOvertimeRate)}/h
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-3 font-medium">
                    Refeições Extras ({euro(audit.meals.mealUnitValue)})
                    <span className="block text-xs font-normal text-muted-foreground">
                      Inseridas no prémio vs. Cartão de Refeição
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Tributada (~{euro(netPerMealInBonus)} líquido)
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    100% Isenta ({euro(audit.meals.mealUnitValue)} líquido)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[var(--warn-text)]">
                    -{euro(lossPerMeal)} por refeição
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Simulador Interativo Mensal e Anual */}
      <Card className="border-primary/20 bg-muted/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Simulador de Prejuízo Acumulado
          </CardTitle>
          <CardDescription>
            Ajusta o número de horas extras e refeições que realizas num mês típico para ver o total roubado do teu bolso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="flex justify-between text-sm font-medium">
                <span>Horas Extras no Mês:</span>
                <span className="font-bold text-primary">{simulatedOtHours} horas</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={simulatedOtHours}
                onChange={(e) => setSimulatedOtHours(Number(e.target.value))}
                className="mt-2 w-full cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0h</span>
                <span>30h</span>
                <span>60h</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm font-medium">
                <span>Refeições Extras no Mês:</span>
                <span className="font-bold text-primary">{simulatedExtraMeals} refeições</span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={simulatedExtraMeals}
                onChange={(e) => setSimulatedExtraMeals(Number(e.target.value))}
                className="mt-2 w-full cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>12</span>
                <span>25</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 grid grid-cols-1 gap-4 sm:grid-cols-3 text-center">
            <div className="p-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">
                Perda Média Mensal Estimada
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--warn-text)]">
                -{euro(audit.totalMonthlyLossSimulatedNet)} / mês
              </p>
              <p className="text-[11px] text-muted-foreground">
                {euro(audit.overtime.directOvertimeLossNet)} em horas (líquido) + {euro(audit.meals.mealLoss)} em
                refeições
              </p>
            </div>

            <div className="p-2 border-y sm:border-y-0 sm:border-x border-border">
              <p className="text-xs uppercase font-medium text-muted-foreground">
                Perda Anual Garantida (Subsídios, líquido)
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--warn-text)]">
                -{euro(audit.subsidies.totalAnnualSubsidiesLossNet)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {euro(audit.subsidies.holidaySubsidyLossNet)} em {holidayMonthName} + {euro(audit.subsidies.christmasSubsidyLossNet)} em{' '}
                {christmasMonthName} (bruto: {euro(audit.subsidies.totalAnnualSubsidiesLoss)})
              </p>
            </div>

            <div className="p-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">
                Prejuízo Total Projetado ao Ano
              </p>
              <p className="mt-1 text-3xl font-extrabold text-[var(--warn-text)]">
                -{euro(audit.totalAnnualLossProjectedNet)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Dinheiro líquido que ficou no bolso do patrão (bruto exigido pela lei: {euro(audit.totalAnnualLossProjected)})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Área de Receção e Análise de Recibos de Vencimento */}
      <Card className="border-[var(--accent)] shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--accent-dark)]" />
            <CardTitle className="text-lg">Análise dos Teus Recibos de Vencimento</CardTitle>
          </div>
          <CardDescription>
            {report.hasReceipts
              ? `${report.monthlyRegistry.length} recibo(s) real(is) já registado(s) — incluídos automaticamente no Relatório de Auditoria acima.`
              : 'Podes fornecer as linhas e rubricas dos teus recibos reais para auditarmos cêntimo a cêntimo a retenção de IRS, descontos de Segurança Social e camuflagem de prémios.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent-dark)] flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-[var(--accent-dark)] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {report.hasReceipts
                  ? 'Os recibos registados em Recibos alimentam o Relatório de Auditoria:'
                  : 'O que precisamos de verificar nos teus recibos:'}
              </p>
              <ul className="mt-1 list-disc list-inside space-y-1 text-xs">
                <li>Designação exata das rubricas (ex: &quot;Vencimento Base&quot;, &quot;Prémio de Produtividade&quot;, &quot;Gratificação&quot;).</li>
                <li>Taxa percentual de Retenção na Fonte de IRS aplicada em cada mês.</li>
                <li>Base de incidência de Segurança Social (se incide sobre {euro(audit.declaredBaseSalary)} ou sobre {euro(audit.agreedRealSalary)}).</li>
                <li>Como vêm discriminadas as horas extras e refeições de {euro(audit.meals.mealUnitValue)}.</li>
              </ul>
              <Link href="/recibos" className="mt-2 inline-block text-xs font-semibold underline">
                {report.hasReceipts ? 'Adicionar ou editar recibos →' : 'Ir para Recibos e anexar o primeiro →'}
              </Link>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Notas rápidas (opcional — não substitui o registo estruturado em Recibos):
            </label>
            <textarea
              rows={4}
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="Exemplo: Recibo de Maio/2026: Vencimento Base 1000,00€ | Prémio 300,00€ (incluindo 10h extras a 8€) | IRS taxa 15% | SS 11%..."
              className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              onClick={() => setReceiptSaved(true)}
              disabled={!receiptNotes.trim()}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Guardar Nota Rápida
            </Button>

            {receiptSaved && (
              <span className="text-xs text-[var(--accent-dark)] font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Nota guardada nesta sessão.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 6. Enquadramento Legal e Fundamentação Jurídica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            Fundamentação Legal no Código do Trabalho (Lei n.º 7/2009)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs text-muted-foreground">
          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Artigo 258.º e 260.º — Princípio da Retribuição Total</p>
            <p className="mt-1">
              Toda a prestação regular e periódica que o trabalhador recebe em dinheiro ou em espécie
              constitui retribuição. A divisão artificial de um ordenado acordado em &quot;salário base&quot; e &quot;prémio fixo&quot;
              para subtrair encargos patronais viola o princípio da verdade remuneratória.
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Artigo 264.º — Subsídio de Férias e de Natal</p>
            <p className="mt-1">
              O montante dos subsídios de férias e de Natal deve corresponder à retribuição que o trabalhador
              auferiria se estivesse em trabalho efetivo, abrangendo não só o base mas também prémios regulares.
              A empresa subtrai o equivalente a {euro(audit.subsidies.totalAnnualSubsidiesLossNet)} líquidos por ano (bruto: {euro(audit.subsidies.totalAnnualSubsidiesLoss)}) ao limitar o subsídio a {euro(audit.declaredBaseSalary)}.
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Artigo 268.º — Remuneração do Trabalho Suplementar</p>
            <p className="mt-1">
              O trabalho suplementar é pago com acréscimo legal mínimo: 25% na 1.ª hora em dia útil, 37,5%
              nas horas seguintes e 50% em dias de descanso/feriados. A imposição de uma tarifa fixa de {euro(audit.employerOvertimeRate)}/h
              sem discriminação em folha constitui contraordenação laboral grave.
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-semibold text-foreground">Artigo 366.º — Compensação por Cessação do Contrato</p>
            <p className="mt-1">
              Em caso de despedimento ou cessação de contrato, o cálculo da indemnização legal incide
              sobre a retribuição base mensal. Ao teres {euro(audit.declaredBaseSalary)} em vez de {euro(audit.agreedRealSalary)}, a tua indemnização é reduzida em {audit.severance.lossPercentage}%.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
