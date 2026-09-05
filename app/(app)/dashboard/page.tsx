import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { calculatePayslip, resolveSubsidyMonths } from '@/lib/salary-calculator';
import {
  formatHours,
  formatDatePt,
  getPayPeriod,
  toDateOnlyString,
  getDayCategory,
  monthNamePt,
  type PayPeriod,
} from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DailyHoursChart, StackedBar, type DailyHours } from '@/components/dashboard/DashboardCharts';
import type { IrsTaxBracket, SubsidyPaymentOverride, TimeEntry, UserSettings } from '@/types/database.types';

function euro(value: number) {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

// Rótulo curto de um período para as "pills" de atalho — ex.: "ago./26".
function formatPeriodPill(period: PayPeriod) {
  return period.end.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
}

function samePeriod(a: PayPeriod, b: PayPeriod) {
  return toDateOnlyString(a.start) === toDateOnlyString(b.start);
}

// A referência que identifica um período na URL é um dia dentro dele —
// simplesmente o dia a seguir ao fecho anterior (o próprio period.start).
function periodRef(period: PayPeriod) {
  return toDateOnlyString(period.start);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há configurações guardadas para esta conta.
      </p>
    );
  }

  const typedSettings = settings as UserSettings;
  const isEffective = typedSettings.contract_regime === 'effective';

  // O período por defeito é o atual (a partir de hoje); ?periodo=YYYY-MM-DD
  // navega para outro período, escolhendo qualquer dia dentro dele.
  const { periodo } = await searchParams;
  const isValidDateParam = typeof periodo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(periodo);
  const referenceDate = isValidDateParam ? new Date(`${periodo}T00:00:00`) : new Date();
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  const period = getPayPeriod(safeReferenceDate, typedSettings.payroll_cutoff_day);
  const currentPeriod = getPayPeriod(new Date(), typedSettings.payroll_cutoff_day);
  const isCurrentPeriod = samePeriod(period, currentPeriod);

  const periodStart = toDateOnlyString(period.start);
  const periodEnd = toDateOnlyString(period.end);

  // Referências para navegar: um dia antes do início / um dia depois do
  // fim do período em vista cai sempre no período anterior/seguinte.
  const prevRefDate = new Date(period.start);
  prevRefDate.setDate(prevRefDate.getDate() - 1);
  const nextRefDate = new Date(period.end);
  nextRefDate.setDate(nextRefDate.getDate() + 1);
  const prevHref = `/dashboard?periodo=${toDateOnlyString(prevRefDate)}`;
  const nextHref = `/dashboard?periodo=${toDateOnlyString(nextRefDate)}`;

  // Atalhos rápidos: os últimos 6 períodos até ao atual
  const periodPresets: PayPeriod[] = [];
  let cursor = new Date(currentPeriod.start);
  for (let i = 0; i < 6; i++) {
    const p = getPayPeriod(cursor, typedSettings.payroll_cutoff_day);
    periodPresets.push(p);
    cursor = new Date(p.start);
    cursor.setDate(cursor.getDate() - 1);
  }
  periodPresets.reverse();

  const periodYear = period.end.getFullYear();

  const [{ data: entries }, { data: brackets }, { data: subsidyOverrides }] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    supabase.from('irs_tax_brackets').select('*').eq('user_settings_id', typedSettings.id),
    supabase.from('subsidy_payment_overrides').select('*').eq('user_id', user.id).eq('reference_year', periodYear),
  ]);

  const typedEntries = (entries ?? []) as TimeEntry[];

  const subsidyMonths = resolveSubsidyMonths(
    typedSettings,
    (subsidyOverrides ?? []) as SubsidyPaymentOverride[],
    periodYear,
  );

  const payslip = calculatePayslip({
    entries: typedEntries,
    settings: typedSettings,
    brackets: (brackets ?? []) as IrsTaxBracket[],
    referenceMonth: period.end.getMonth() + 1,
    subsidyMonths,
  });

  const rateMissing = isEffective
    ? (typedSettings.base_salary ?? 0) <= 0
    : typedSettings.weekday_rate <= 0;

  // Uma barra por dia do período (incluindo dias sem registo, a 0h), para o gráfico
  const hoursByDate = new Map(
    typedEntries.filter((e) => e.entry_type === 'work').map((e) => [e.entry_date, e.hours_worked ?? 0]),
  );
  const dailyHours: DailyHours[] = [];
  for (let d = new Date(period.start); d <= period.end; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateOnlyString(d);
    dailyHours.push({
      date: dateStr,
      hours: hoursByDate.get(dateStr) ?? 0,
      category: getDayCategory(dateStr),
    });
  }

  const subsidiesTotal = payslip.gross.mealAllowance + payslip.gross.transportAllowance;

  // Perda anual estrutural nos subsídios de férias/Natal, calculada a
  // partir das configurações reais desta conta — nunca um valor fixo, para
  // não mostrar a um utilizador o prejuízo calculado com o salário de outra
  // conta.
  const yearlySubsidyLoss = Math.max(
    0,
    (typedSettings.agreed_total_salary - typedSettings.base_salary) * 2,
  );

  // Linhas da "Simulação do Recibo de Vencimento" no layout Remunerações /
  // Descontos do recibo real da empresa (form RH.17.17, Metalomecânica 3
  // Triângulos) — pedido por Ricardo (04/09/2026) para partilhar a app com
  // colegas: "o layout do recibo no dashboard poderia ser semelhante ao da
  // empresa". Valor/hora e valor/dia calculados como no recibo real (ver
  // lib/salary-calculator.ts): base×12/2080 arredondado, e base/30.
  const legalHourlyRate = typedSettings.base_salary > 0 ? Number(((typedSettings.base_salary * 12) / 2080).toFixed(2)) : 0;
  const dailyRate = typedSettings.base_salary > 0 ? Number((typedSettings.base_salary / 30).toFixed(2)) : 0;
  const daysWorkedInPeriod = new Set(typedEntries.filter((e) => e.entry_type === 'work').map((e) => e.entry_date)).size;
  // No recibo real, horas extras/refeições extras vêm sempre camufladas
  // numa única linha "Gratificação" junto com o prémio fixo — ver comentário
  // em calculateGrossBreakdown.
  const combinedBonusAndExtras = payslip.gross.fixedBonus + payslip.gross.overtimeIncome + payslip.gross.extraMealsIncome;

  const remuneracaoRows: { label: string; qty?: string; unit?: string; total: number }[] = [
    { label: 'Vencimento Base', total: payslip.gross.baseSalary },
  ];
  if (payslip.gross.unjustifiedAbsenceHours > 0) {
    remuneracaoRows.push({
      label: 'Faltas Hora Injustificada',
      qty: formatHours(payslip.gross.unjustifiedAbsenceHours),
      unit: euro(-legalHourlyRate),
      total: -payslip.gross.unjustifiedAbsenceDeduction,
    });
  }
  if (payslip.gross.sickLeaveDays > 0) {
    remuneracaoRows.push({
      label: 'Baixa',
      qty: `${payslip.gross.sickLeaveDays} dia${payslip.gross.sickLeaveDays > 1 ? 's' : ''}`,
      unit: euro(-dailyRate),
      total: -payslip.gross.sickLeaveDeduction,
    });
  }
  if (payslip.gross.justifiedAbsenceDays > 0) {
    remuneracaoRows.push({
      label: 'Falta Justificada (Art. 255º CT, sem desconto)',
      qty: `${payslip.gross.justifiedAbsenceDays} dia${payslip.gross.justifiedAbsenceDays > 1 ? 's' : ''}`,
      total: 0,
    });
  }
  if (payslip.gross.mealAllowance > 0) {
    remuneracaoRows.push({
      label: 'Sub. de Refeição',
      qty: daysWorkedInPeriod > 0 ? String(daysWorkedInPeriod) : undefined,
      unit: daysWorkedInPeriod > 0 ? euro(typedSettings.meal_allowance_daily_value || 0) : undefined,
      total: payslip.gross.mealAllowance,
    });
  }
  if (payslip.gross.transportAllowance > 0) {
    remuneracaoRows.push({ label: 'Subsídio de Transporte', total: payslip.gross.transportAllowance });
  }
  if (combinedBonusAndExtras > 0) {
    remuneracaoRows.push({ label: 'Gratificação', qty: '1', unit: euro(combinedBonusAndExtras), total: combinedBonusAndExtras });
  }
  if (payslip.gross.holidaySubsidy > 0) {
    remuneracaoRows.push({
      label: `Subsídio de Férias (pago em ${monthNamePt(subsidyMonths.holiday)})`,
      total: payslip.gross.holidaySubsidy,
    });
  }
  if (payslip.gross.christmasSubsidy > 0) {
    remuneracaoRows.push({
      label: `Subsídio de Natal (pago em ${monthNamePt(subsidyMonths.christmas)})`,
      total: payslip.gross.christmasSubsidy,
    });
  }

  const descontoRows: { label: string; rate?: string; total: number }[] = [
    {
      label: 'Segurança Social',
      rate: `${typedSettings.social_security_rate || 11}%`,
      total: payslip.deductions.socialSecurity,
    },
    { label: 'Imposto S/ Rendimento (IRS)', total: payslip.deductions.irs },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Banner de Aviso de Perdas para Contrato Efetivo — só depois de a
          conta ter configurado a remuneração (senão mostraria 0€ sem sentido). */}
      {isEffective && !rateMissing && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
            <span className="text-foreground">
              Modo <strong>Contrato Efetivo</strong> ativo (Base {euro(typedSettings.base_salary)} + Prémio {euro(typedSettings.fixed_bonus)}).
              {yearlySubsidyLoss > 0 && (
                <>
                  {' '}O teu patrão está a poupar pelo menos <strong>{euro(yearlySubsidyLoss)}/ano</strong> em subsídios de férias e natal.
                </>
              )}
            </span>
          </div>
          <Link
            href="/perdas"
            className="inline-flex items-center whitespace-nowrap font-semibold text-red-600 hover:underline"
          >
            Ver Auditoria de Perdas →
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {periodPresets.map((p) => {
              const active = samePeriod(p, period);
              return (
                <Link
                  key={periodRef(p)}
                  href={`/dashboard?periodo=${periodRef(p)}`}
                  className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                >
                  {formatPeriodPill(p)}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={prevHref}
              className="rounded-md border border-input px-2 py-1 text-sm hover:bg-accent"
              aria-label="Período anterior"
            >
              ←
            </Link>
            {!isCurrentPeriod && (
              <Link
                href="/dashboard"
                className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent"
              >
                Atual
              </Link>
            )}
            {isCurrentPeriod ? (
              <span
                className="cursor-not-allowed rounded-md border border-input px-2 py-1 text-sm text-muted-foreground opacity-40"
                aria-hidden
              >
                →
              </span>
            ) : (
              <Link
                href={nextHref}
                className="rounded-md border border-input px-2 py-1 text-sm hover:bg-accent"
                aria-label="Período seguinte"
              >
                →
              </Link>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            {isCurrentPeriod ? 'Período atual' : 'Período'}: {formatDatePt(periodStart)} – {formatDatePt(periodEnd)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pagamento previsto: {formatDatePt(toDateOnlyString(period.paymentDate))}
          </p>
        </div>
      </div>

      {rateMissing && (
        <Card className="border-yellow-400">
          <CardContent className="pt-6 text-sm">
            Ainda não definiste a tua remuneração em{' '}
            <Link href="/configuracoes" className="underline font-semibold">
              Configurações
            </Link>{' '}
            — os valores abaixo estão a 0€.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Horas no período</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatHours(payslip.hours.total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bruto estimado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {euro(payslip.gross.totalGross)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Líquido estimado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-green-600">
            {euro(payslip.netPay)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Horas por dia no período</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyHoursChart days={dailyHours} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição do bruto</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBar
              segments={[
                {
                  label: isEffective ? 'Salário Base' : 'Dias úteis',
                  value: isEffective ? payslip.gross.baseSalary : payslip.gross.fromWeekdayHours,
                  color: 'var(--series-weekday)',
                },
                {
                  label: isEffective ? 'Prémios & Extras' : 'Sábados',
                  value: isEffective
                    ? payslip.gross.fixedBonus + payslip.gross.overtimeIncome + payslip.gross.extraMealsIncome
                    : payslip.gross.fromSaturdayHours,
                  color: 'var(--series-saturday)',
                },
                {
                  label: isEffective ? 'Subs. Férias/Natal' : 'Domingos',
                  value: isEffective
                    ? payslip.gross.holidaySubsidy + payslip.gross.christmasSubsidy
                    : payslip.gross.fromSundayHours,
                  color: 'var(--series-sunday)',
                },
                { label: 'Alimentação / Transp.', value: subsidiesTotal, color: 'var(--series-subsidies)' },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Líquido vs. descontos</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBar
              segments={[
                { label: 'Líquido', value: payslip.netPay, color: 'var(--series-liquido)' },
                { label: 'Segurança Social', value: payslip.deductions.socialSecurity, color: 'var(--series-ss)' },
                { label: 'IRS', value: payslip.deductions.irs, color: 'var(--series-irs)' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discriminação de horas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <p>Total: {formatHours(payslip.hours.total)}</p>
          <p>Dias úteis: {formatHours(payslip.hours.weekday)}</p>
          <p>Fins de semana: {formatHours(payslip.hours.saturday + payslip.hours.sunday)}</p>
          {payslip.hours.holiday > 0 && <p>Feriados: {formatHours(payslip.hours.holiday)}</p>}
          <p>
            Horas extras:{' '}
            <strong className="text-primary">{formatHours(payslip.hours.overtimeHours)}</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Simulação do Recibo de Vencimento</CardTitle>
            <span className="text-xs text-muted-foreground">
              {isEffective ? 'Regime: Contrato Efetivo' : 'Regime: Horista'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isEffective ? (
            <>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Remunerações
                  </p>
                  <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.5rem_5rem] gap-x-2 border-b pb-1 text-[11px] font-medium text-muted-foreground">
                    <span>Descrição</span>
                    <span className="text-right">Hora/Dia</span>
                    <span className="text-right">Valor Unit.</span>
                    <span className="text-right">Valor Total</span>
                  </div>
                  <div className="divide-y">
                    {remuneracaoRows.map((row) => (
                      <ReceiptRemuneracaoRow key={row.label} {...row} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Descontos
                  </p>
                  <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem] gap-x-2 border-b pb-1 text-[11px] font-medium text-muted-foreground">
                    <span>Descrição</span>
                    <span className="text-right">Taxa</span>
                    <span className="text-right">Valor</span>
                  </div>
                  <div className="divide-y">
                    {descontoRows.map((row) => (
                      <ReceiptDescontoRow key={row.label} {...row} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />
              <Row label="Líquido a Receber" value={payslip.netPay} bold />

              <div className="grid grid-cols-1 gap-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                <span>Valor sujeito a Segurança Social: {euro(payslip.gross.ssTaxableBase)}</span>
                <span>Valor sujeito a IRS: {euro(payslip.gross.totalTaxable)}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              <Row label="Dias úteis" value={payslip.gross.fromWeekdayHours} />
              <Row label="Sábados" value={payslip.gross.fromSaturdayHours} />
              <Row label="Domingos" value={payslip.gross.fromSundayHours} />
              {payslip.gross.fromHolidayHours > 0 && (
                <Row label="Feriados" value={payslip.gross.fromHolidayHours} />
              )}
              <Row label="Subsídio de alimentação" value={payslip.gross.mealAllowance} />
              <Row label="Subsídio de transporte" value={payslip.gross.transportAllowance} />

              <div className="my-2 h-px bg-border" />
              <Row label="Rendimento Bruto Total" value={payslip.gross.totalGross} />
              <Row label="Valor Tributável Sujeito a Descontos" value={payslip.gross.totalTaxable} />

              <div className="my-2 h-px bg-border" />
              <Row
                label={`Segurança Social (${typedSettings.social_security_rate || 11}%)`}
                value={-payslip.deductions.socialSecurity}
              />
              <Row label="Retenção na Fonte de IRS" value={-payslip.deductions.irs} />

              <div className="my-2 h-px bg-border" />
              <Row label="Valor Líquido a Receber" value={payslip.netPay} bold />
            </div>
          )}

          {isEffective && !rateMissing && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground flex justify-between items-center">
              <span>
                Queres saber quanto a empresa te estaria a pagar com base no salário legal de {euro(typedSettings.agreed_total_salary)}?
              </span>
              <Link href="/perdas" className="font-semibold text-primary underline ml-2 whitespace-nowrap">
                Ver Comparador de Perdas →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-semibold text-foreground' : ''}`}>
      <span>{label}</span>
      <span>{euro(value)}</span>
    </div>
  );
}

// Uma linha da tabela "Remunerações" — Descrição / Hora-Dia / Valor
// Unitário / Valor Total, como no recibo real (form RH.17.17). Hora/Dia e
// Valor Unitário ficam "—" quando a rubrica não tem preço por unidade (ex.
// subsídios, gratificação agregada).
function ReceiptRemuneracaoRow({
  label,
  qty,
  unit,
  total,
}: {
  label: string;
  qty?: string;
  unit?: string;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_4.5rem_5rem] items-baseline gap-x-2 py-1.5 text-xs sm:text-sm">
      <span className="pr-1">{label}</span>
      <span className="text-right text-muted-foreground">{qty ?? '—'}</span>
      <span className="text-right text-muted-foreground">{unit ?? '—'}</span>
      <span className={`text-right font-medium ${total < 0 ? 'text-red-600' : ''}`}>{euro(total)}</span>
    </div>
  );
}

// Uma linha da tabela "Descontos" — Descrição / Taxa / Valor do Desconto.
function ReceiptDescontoRow({ label, rate, total }: { label: string; rate?: string; total: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem] items-baseline gap-x-2 py-1.5 text-xs sm:text-sm">
      <span className="pr-1">{label}</span>
      <span className="text-right text-muted-foreground">{rate ?? '—'}</span>
      <span className="text-right font-medium text-red-600">{euro(total)}</span>
    </div>
  );
}
