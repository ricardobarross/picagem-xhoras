import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { calculatePayslip } from '@/lib/salary-calculator';
import {
  formatHours,
  formatDatePt,
  getPayPeriod,
  toDateOnlyString,
  getDayCategory,
  type PayPeriod,
} from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DailyHoursChart, StackedBar, type DailyHours } from '@/components/dashboard/DashboardCharts';
import type { IrsTaxBracket, TimeEntry, UserSettings } from '@/types/database.types';

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

  const [{ data: entries }, { data: brackets }] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    supabase.from('irs_tax_brackets').select('*').eq('user_settings_id', typedSettings.id),
  ]);

  const typedEntries = (entries ?? []) as TimeEntry[];

  const payslip = calculatePayslip({
    entries: typedEntries,
    settings: typedSettings,
    brackets: (brackets ?? []) as IrsTaxBracket[],
    referenceMonth: period.end.getMonth() + 1,
  });

  const rateMissing = isEffective
    ? (typedSettings.base_salary ?? 0) <= 0
    : typedSettings.weekday_rate <= 0;

  // Uma barra por dia do período (incluindo dias sem registo, a 0h), para o gráfico
  const hoursByDate = new Map(typedEntries.map((e) => [e.entry_date, e.hours_worked]));
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

  return (
    <div className="flex flex-col gap-6">
      {/* Banner de Aviso de Perdas para Contrato Efetivo */}
      {isEffective && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
            <span className="text-foreground">
              Modo <strong>Contrato Efetivo</strong> ativo (Base {euro(typedSettings.base_salary || 1500)} + Prémio {euro(typedSettings.fixed_bonus || 500)}).
              O teu patrão está a poupar pelo menos <strong>1.000€/ano</strong> em subsídios de férias e natal.
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
        <CardContent className="flex flex-col gap-1 text-sm">
          {isEffective ? (
            <>
              <Row label="Vencimento Base Oficial" value={payslip.gross.baseSalary} />
              <Row label="Prémio Fixo Mensal" value={payslip.gross.fixedBonus} />
              {payslip.gross.overtimeIncome > 0 && (
                <Row
                  label={`Horas Extras (${formatHours(payslip.hours.overtimeHours)} a ${euro(typedSettings.overtime_fixed_rate || 12)}/h)`}
                  value={payslip.gross.overtimeIncome}
                />
              )}
              {payslip.gross.extraMealsIncome > 0 && (
                <Row
                  label="Refeições Extras (embutidas no prémio)"
                  value={payslip.gross.extraMealsIncome}
                />
              )}
              {payslip.gross.holidaySubsidy > 0 && (
                <Row label="Subsídio de Férias (Pago em Janeiro)" value={payslip.gross.holidaySubsidy} />
              )}
              {payslip.gross.christmasSubsidy > 0 && (
                <Row label="Subsídio de Natal (Pago em Novembro)" value={payslip.gross.christmasSubsidy} />
              )}
              <Row label="Subsídio de Alimentação" value={payslip.gross.mealAllowance} />
              {payslip.gross.transportAllowance > 0 && (
                <Row label="Subsídio de Transporte" value={payslip.gross.transportAllowance} />
              )}
            </>
          ) : (
            <>
              <Row label="Dias úteis" value={payslip.gross.fromWeekdayHours} />
              <Row label="Sábados" value={payslip.gross.fromSaturdayHours} />
              <Row label="Domingos" value={payslip.gross.fromSundayHours} />
              {payslip.gross.fromHolidayHours > 0 && (
                <Row label="Feriados" value={payslip.gross.fromHolidayHours} />
              )}
              <Row label="Subsídio de alimentação" value={payslip.gross.mealAllowance} />
              <Row label="Subsídio de transporte" value={payslip.gross.transportAllowance} />
            </>
          )}

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

          {isEffective && (
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground flex justify-between items-center">
              <span>
                Queres saber quanto a empresa te estaria a pagar com base no salário legal de 2.000€?
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
