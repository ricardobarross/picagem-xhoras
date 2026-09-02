import Link from 'next/link';
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

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user!.id)
    .single();

  // Sem configurações ainda gravadas (não deveria acontecer — o trigger
  // handle_new_user() cria uma linha por defeito no registo).
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há configurações guardadas para esta conta.
      </p>
    );
  }

  const typedSettings = settings as UserSettings;

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

  // Atalhos rápidos: os últimos 6 períodos até ao atual (mais antigo → mais
  // recente), para não ter de clicar em "anterior" repetidamente.
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
      .eq('user_id', user!.id)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd),
    supabase.from('irs_tax_brackets').select('*').eq('user_settings_id', typedSettings.id),
  ]);

  const typedEntries = (entries ?? []) as TimeEntry[];

  const payslip = calculatePayslip({
    entries: typedEntries,
    settings: typedSettings,
    brackets: (brackets ?? []) as IrsTaxBracket[],
  });

  const weekdayRateMissing = typedSettings.weekday_rate <= 0;

  // Uma barra por dia do período (incluindo dias sem registo, a 0h), para
  // o gráfico de horas — assim dá para ver de imediato os "buracos".
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
      <div className="flex flex-col gap-3">
        {/* Seleção de período: uma única linha, acima de tudo o resto —
            os atalhos rápidos primeiro, a navegação dia-a-dia ao lado. */}
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

      {weekdayRateMissing && (
        <Card className="border-yellow-400">
          <CardContent className="pt-6 text-sm">
            Ainda não definiste o valor por hora em{' '}
            <a href="/configuracoes" className="underline">
              Configurações
            </a>
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
                { label: 'Dias úteis', value: payslip.gross.fromWeekdayHours, color: 'var(--series-weekday)' },
                { label: 'Sábados', value: payslip.gross.fromSaturdayHours, color: 'var(--series-saturday)' },
                { label: 'Domingos', value: payslip.gross.fromSundayHours, color: 'var(--series-sunday)' },
                { label: 'Subsídios', value: subsidiesTotal, color: 'var(--series-subsidies)' },
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
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <p>Dias úteis: {formatHours(payslip.hours.weekday)}</p>
          <p>Sábados: {formatHours(payslip.hours.saturday)}</p>
          <p>Domingos: {formatHours(payslip.hours.sunday)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulação de recibo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <Row label="Dias úteis" value={payslip.gross.fromWeekdayHours} />
          <Row label="Sábados" value={payslip.gross.fromSaturdayHours} />
          <Row label="Domingos" value={payslip.gross.fromSundayHours} />
          <Row label="Subsídio de alimentação" value={payslip.gross.mealAllowance} />
          <Row label="Subsídio de transporte" value={payslip.gross.transportAllowance} />
          <div className="my-2 h-px bg-border" />
          <Row label="Valor declarado (base de descontos)" value={payslip.gross.totalTaxable} />
          {!payslip.gross.weekendDeclared && payslip.gross.weekendIncome > 0 && (
            <Row label="Valor não declarado (fim de semana)" value={payslip.gross.totalNonTaxable} />
          )}
          <div className="my-2 h-px bg-border" />
          <Row label="Segurança Social" value={-payslip.deductions.socialSecurity} />
          <Row label="IRS" value={-payslip.deductions.irs} />
          <div className="my-2 h-px bg-border" />
          <Row label="Valor líquido a receber" value={payslip.netPay} bold />
          {!payslip.gross.weekendDeclared && payslip.gross.weekendIncome > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              O fim de semana não entra na Segurança Social nem no IRS — isto é opcional e pode ser mudado em{' '}
              <a href="/configuracoes" className="underline">
                Configurações
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{euro(value)}</span>
    </div>
  );
}
