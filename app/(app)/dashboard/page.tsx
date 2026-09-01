import { createClient } from '@/lib/supabase/server';
import { calculatePayslip } from '@/lib/salary-calculator';
import { formatHours } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TimeEntry, UserSettings } from '@/types/database.types';

function euro(value: number) {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user!.id)
    .single();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data: entries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user!.id)
    .gte('entry_date', monthStart)
    .lte('entry_date', monthEnd);

  // Sem configurações ainda gravadas (não deveria acontecer — o trigger
  // handle_new_user() cria uma linha por defeito no registo).
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há configurações guardadas para esta conta.
      </p>
    );
  }

  const payslip = calculatePayslip({
    year,
    month,
    entries: (entries ?? []) as TimeEntry[],
    settings: settings as UserSettings,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">
        Resumo de {now.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Horas no mês</CardTitle>
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
          <CardTitle>Discriminação de horas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <p>Normais: {formatHours(payslip.hours.normal)}</p>
          <p>Extra (1º escalão): {formatHours(payslip.hours.overtimeTier1)}</p>
          <p>Extra (2º escalão): {formatHours(payslip.hours.overtimeTier2)}</p>
          <p>Sábados: {formatHours(payslip.hours.saturday)}</p>
          <p>Domingos: {formatHours(payslip.hours.sunday)}</p>
          <p>Feriados: {formatHours(payslip.hours.holiday)}</p>
          <p>Noturnas: {formatHours(payslip.hours.night)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulação de recibo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <Row label="Horas normais" value={payslip.gross.fromNormalHours} />
          <Row label="Horas extra" value={payslip.gross.fromOvertime} />
          <Row label="Sábados" value={payslip.gross.fromSaturdayHours} />
          <Row label="Domingos" value={payslip.gross.fromSundayHours} />
          <Row label="Feriados" value={payslip.gross.fromHolidayHours} />
          <Row label="Adicional noturno" value={payslip.gross.fromNightPremium} />
          <Row label="Subsídio de alimentação" value={payslip.gross.mealAllowance} />
          <Row label="Duodécimos férias/Natal" value={payslip.gross.vacationChristmasBonus} />
          <Row label="Subsídio de transporte" value={payslip.gross.transportAllowance} />
          <div className="my-2 h-px bg-border" />
          <Row label="Segurança Social" value={-payslip.deductions.socialSecurity} />
          <Row label="IRS" value={-payslip.deductions.irs} />
          <div className="my-2 h-px bg-border" />
          <Row label="Valor líquido a receber" value={payslip.netPay} bold />
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
