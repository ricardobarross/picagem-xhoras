'use client';

// components/audit/AuditReportDocument.tsx
// Laudo de Auditoria de Direitos Laborais — documento formal, exportável em
// PDF (via impressão do browser), com fundamentação no Código do Trabalho e
// o apuramento mês a mês, ano a ano e total geral, a partir dos recibos
// reais registados em /recibos. Pedido por Ricardo (09/09/2026): "quero uma
// opção de relatório, la na auditoria... como um laudo da auditoria, com
// fundamentação baseado nos dados fornecidos e nas leis vigentes" +
// "quero descrição de todos os valores, mês, ano e total".

import { ArrowLeft, Printer } from 'lucide-react';
import type { ContractLossAudit } from '@/lib/loss-calculator';
import type { AuditReportData } from '@/lib/audit-report';
import { Button } from '@/components/ui/button';

function euro(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
};

const DOC_NUMBER = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}${String(
  new Date().getDate(),
).padStart(2, '0')}`;

export function AuditReportDocument({
  onBack,
  audit,
  report,
  userName,
  companyName,
}: {
  onBack: () => void;
  audit: ContractLossAudit;
  report: AuditReportData;
  userName: string;
  companyName?: string | null;
}) {
  const today = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
  const overtimeGap = Number((audit.legalWeekdaySubsequentRate - audit.employerOvertimeRate).toFixed(2));

  return (
    <div className="flex flex-col">
      <div className="no-print sticky top-0 z-10 -mx-4 mb-6 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Exportar PDF
        </Button>
      </div>

      <div
        className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-8 shadow-sm sm:p-12 print:max-w-none print:border-0 print:shadow-none"
        style={SERIF_STYLE}
      >
        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--accent-dark)]" style={{ fontFamily: 'inherit' }}>
          Picagem X€Horas
        </p>
        <h1 className="mb-1.5 text-[24px] font-bold leading-tight text-foreground">
          Laudo de Auditoria de Direitos Laborais
        </h1>
        <p className="mb-7 text-[12px] text-muted-foreground">
          Nº {DOC_NUMBER} · Gerado em {today}
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 border-y border-border py-4 text-[12.5px] sm:grid-cols-2">
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Trabalhador</p>
            <p className="font-semibold">{userName}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Entidade Patronal</p>
            <p className="font-semibold">{companyName || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] text-[var(--text-faint)]">Período de Referência</p>
            <p className="font-semibold">
              {report.periodLabel ?? 'Ainda sem recibos reais registados — ver secção V'}
            </p>
          </div>
        </div>

        <h2 className="mb-2.5 text-[14px] font-bold">I. Objeto e Metodologia</h2>
        <p className="mb-5 text-[13.5px] leading-[1.75]">
          O presente laudo resulta de uma auditoria automatizada aos registos de remuneração introduzidos pelo
          trabalhador na aplicação Picagem X€Horas — quer nas configurações contratuais, quer nos recibos de
          vencimento reais anexados em &quot;Recibos&quot; — comparando os valores efetivamente processados pela
          entidade patronal com o regime legalmente devido nos termos do Código do Trabalho (Lei n.º 7/2009, de 12
          de fevereiro), na redação em vigor à data de emissão deste documento.
        </p>

        <h2 className="mb-2.5 text-[14px] font-bold">II. Fundamentação Legal</h2>
        <div className="mb-5 text-[13.5px] leading-[1.75]">
          <p className="mb-2.5">
            <strong>Art. 258.º e 260.º</strong> — toda a prestação regular e periódica que o trabalhador recebe em
            dinheiro ou em espécie constitui retribuição. A divisão de um ordenado acordado em &quot;salário
            base&quot; e &quot;prémio/gratificação&quot; fixos e regulares não afasta essa qualificação.
          </p>
          <p className="mb-2.5">
            <strong>Art. 264.º, n.º 2</strong> — os subsídios de férias e de Natal devem corresponder à retribuição
            que o trabalhador auferiria se estivesse em trabalho efetivo, ou seja, à retribuição regular
            (Vencimento Base + prestações fixas e periódicas), e não apenas ao Vencimento Base isolado.
          </p>
          <p className="mb-2.5">
            <strong>Art. 268.º, n.º 1, al. a) e b)</strong> — o trabalho suplementar é pago com um acréscimo mínimo
            de 25% na 1.ª hora e 37,5% nas horas seguintes em dia útil, e 50% em dia de descanso/feriado.
          </p>
          <p>
            <strong>Art. 366.º</strong> — a compensação por antiguidade em caso de cessação do contrato é calculada
            sobre a retribuição base e diuturnidades efetivamente auferidas.
          </p>
        </div>

        <h2 className="mb-2.5 text-[14px] font-bold">III. Apuramento dos Subsídios de Férias e Natal</h2>
        <p className="mb-3 text-[12.5px] leading-[1.7] text-muted-foreground">
          Para cada ano civil com recibos registados, a retribuição regular devida corresponde à média mensal de
          Vencimento Base + Gratificação/Prémio efetivamente pagos nesse ano (Art. 264º, n.º 2 CT). Só entram
          rubricas de meses com recibo real anexado — nenhum valor é estimado ou inventado.
        </p>

        {report.subsidyRows.length > 0 ? (
          <>
            <table className="mb-2 w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                  <td className="border-b-2 border-foreground/70 py-1.5">Ano</td>
                  <td className="border-b-2 border-foreground/70 py-1.5">Mês</td>
                  <td className="border-b-2 border-foreground/70 py-1.5">Rubrica</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Devido (retrib. regular)</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Pago (recibo real)</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Diferença</td>
                </tr>
              </thead>
              <tbody>
                {report.subsidyRows.map((row) => (
                  <tr key={`${row.year}-${row.type}`} className="border-b border-border">
                    <td className="py-2">{row.year}</td>
                    <td className="py-2">{row.monthLabel}</td>
                    <td className="py-2">{row.typeLabel}</td>
                    <td className="py-2 text-right">{euro(row.due)}</td>
                    <td className="py-2 text-right">{euro(row.paid)}</td>
                    <td
                      className={`py-2 text-right font-semibold ${row.diff < 0 ? 'text-[var(--warn-text)]' : ''}`}
                    >
                      {row.diff >= 0 ? '+' : ''}
                      {euro(row.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mb-2 flex flex-col gap-1 text-[12.5px]">
              {report.yearTotals.map((yt) => (
                <div key={yt.year} className="flex justify-between border-b border-border py-1.5">
                  <span>
                    Total {yt.year} ({yt.rowCount} rubrica{yt.rowCount > 1 ? 's' : ''})
                  </span>
                  <span className="font-semibold text-[var(--warn-text)]">-{euro(yt.shortfall)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 text-[14px] font-bold">
                <span>Total Geral do Período</span>
                <span className="text-[var(--warn-text)]">-{euro(report.grandTotalShortfall)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="mb-5 rounded-md bg-[var(--warn-soft)] p-4 text-[13px] text-[var(--warn-text)]">
            Ainda não há recibos reais registados em &quot;Recibos&quot; que cubram um mês de pagamento de
            subsídio de férias ou de Natal. Com base apenas na configuração contratual atual (
            {euro(audit.declaredBaseSalary)} de base + {euro(audit.declaredFixedBonus)} de prémio, contra{' '}
            {euro(audit.agreedRealSalary)} de retribuição acordada), a perda estrutural estimada é de{' '}
            {euro(audit.subsidies.totalAnnualSubsidiesLoss)}/ano em subsídios — regista os recibos reais em
            &quot;Recibos&quot; para este laudo passar a apurar o valor mês a mês.
          </p>
        )}

        <h2 className="mb-2.5 mt-7 text-[14px] font-bold">IV. Registo Mensal Completo</h2>
        <p className="mb-3 text-[12.5px] leading-[1.7] text-muted-foreground">
          Todos os valores constantes dos recibos reais registados, mês a mês. Gratificação, Horas Extras, Subsídio
          de Alimentação, Segurança Social, IRS e Líquido variam consoante o mês (faltas, produção, tabela de IRS
          aplicada) e entram aqui apenas como registo — sem veredicto de certo/errado, à semelhança da página
          &quot;Recibos&quot;.
        </p>
        {report.monthlyRegistry.length > 0 ? (
          <div className="mb-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
              <thead>
                <tr className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                  <td className="border-b-2 border-foreground/70 py-1.5">Mês/Ano</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Venc. Base</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Gratificação</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">H. Extras</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Sub. Aliment.</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Seg. Social</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">IRS</td>
                  <td className="border-b-2 border-foreground/70 py-1.5 text-right">Líquido</td>
                </tr>
              </thead>
              <tbody>
                {report.monthlyRegistry.map((row) => (
                  <tr key={`${row.year}-${row.month}`} className="border-b border-border">
                    <td className="py-1.5 whitespace-nowrap">
                      {row.monthLabel}/{row.year}
                    </td>
                    <td className="py-1.5 text-right">{euro(row.baseSalaryPaid)}</td>
                    <td className="py-1.5 text-right">{euro(row.bonusPaid)}</td>
                    <td className="py-1.5 text-right">{euro(row.overtimePaid)}</td>
                    <td className="py-1.5 text-right">{euro(row.mealAllowancePaid)}</td>
                    <td className="py-1.5 text-right">{euro(row.socialSecurityPaid)}</td>
                    <td className="py-1.5 text-right">{euro(row.irsPaid)}</td>
                    <td className="py-1.5 text-right font-medium">{euro(row.netPayPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-5 text-[13px] text-muted-foreground">Sem recibos reais registados.</p>
        )}

        <h2 className="mb-2.5 text-[14px] font-bold">V. Horas Extras — Taxa Praticada vs. Taxa Legal</h2>
        <p className="mb-5 text-[13.5px] leading-[1.75]">
          A empresa pratica uma taxa fixa de {euro(audit.employerOvertimeRate)}/hora extra. Com base na retribuição
          acordada de {euro(audit.agreedRealSalary)}, o Art. 268º, n.º 1 CT exige no mínimo{' '}
          {euro(audit.legalWeekday1stHourRate)}/h na 1.ª hora, {euro(audit.legalWeekdaySubsequentRate)}/h nas horas
          seguintes em dia útil, e {euro(audit.legalWeekendRate)}/h em fim de semana/feriado — uma diferença de pelo
          menos {euro(overtimeGap)} por hora extra em dia útil (horas seguintes). Não há registo de horas extras
          exatas por mês anterior ao uso da funcionalidade de Picagem nesta aplicação, pelo que este laudo não
          apura um valor total em falta nesta rubrica — apenas a taxa em vigor.
        </p>

        <h2 className="mb-2.5 text-[14px] font-bold">VI. Conclusão</h2>
        <p className="mb-8 text-[13.5px] leading-[1.75]">
          {report.hasReceipts ? (
            <>
              Com base nos recibos reais registados e na legislação em vigor, apurou-se uma divergência de{' '}
              <strong>{euro(report.grandTotalShortfall)}</strong> nos subsídios de férias e de Natal ao longo do
              período de {report.periodLabel}, para além do acréscimo por hora extra em falta descrito na secção
              V. Este valor tem caráter informativo, resulta exclusivamente dos dados introduzidos pelo próprio
              trabalhador e deve ser confirmado junto de um(a) advogado(a) ou da Autoridade para as Condições do
              Trabalho (ACT) antes de qualquer ação formal.
            </>
          ) : (
            <>
              Sem recibos reais registados, este laudo baseia-se apenas na configuração contratual atual — regista
              os recibos em &quot;Recibos&quot; para obter o apuramento mês a mês, ano a ano e total geral. Este
              valor tem caráter informativo e deve ser confirmado junto de um(a) advogado(a) ou da Autoridade para
              as Condições do Trabalho (ACT) antes de qualquer ação formal.
            </>
          )}
        </p>

        <div className="border-t border-border pt-4 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Documento gerado eletronicamente a partir dos dados inseridos pelo próprio utilizador — dispensa
          assinatura e não constitui aconselhamento jurídico.
          <br />
          Picagem X€Horas — aplicação criada por Ricardo Barros.
        </div>
      </div>
    </div>
  );
}
