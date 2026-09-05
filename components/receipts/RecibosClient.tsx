'use client';

// components/receipts/RecibosClient.tsx
// Página /recibos: anexar o PDF real do recibo de vencimento de um mês,
// registar os valores que nele constam, e comparar com o que a app
// calcula que devias receber nesse mês (Vencimento Base, Segurança
// Social e Subsídios de Férias/Natal — os únicos itens que dá para
// verificar de forma determinística sem picagem desse mês). Gratificação,
// Horas Extras, Subsídio de Alimentação, IRS e Líquido ficam só como
// registo do que o recibo real diz, sem veredicto de certo/errado, porque
// variam mês a mês (horas extras/prémio camuflados — ver
// lib/salary-calculator.ts). Pedido por Ricardo (04/09/2026): "queria a
// opção de anexar o recibo e referir ao mês, fazendo uma comparação ao
// que foi recebido e ao que recebi, o que serviria para consultas
// futuras."
//
// O formulário + comparação vivem em <ReceiptForm>, remontado com
// key={`${year}-${month}`} sempre que o período muda — assim o estado
// local (form/file) arranca já preenchido a partir do recibo existente
// para esse período sem precisar de um useEffect a chamar setState (ver
// https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes).

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculatePayslip, resolveSubsidyMonths } from '@/lib/salary-calculator';
import { monthNamePt } from '@/lib/time-utils';
import type { IrsTaxBracket, PayslipReceipt, SubsidyPaymentOverride, UserSettings } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function euro(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const INPUT_CLASS = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm';
const SELECT_CLASS = 'rounded-md border border-input bg-background px-2 py-1.5 text-sm';

type ReceiptFormState = {
  received_base_salary: string;
  received_bonus: string;
  received_overtime: string;
  received_meal_allowance: string;
  received_holiday_subsidy: string;
  received_christmas_subsidy: string;
  received_social_security: string;
  received_irs: string;
  received_net_pay: string;
  notes: string;
};

const EMPTY_FORM: ReceiptFormState = {
  received_base_salary: '',
  received_bonus: '',
  received_overtime: '',
  received_meal_allowance: '',
  received_holiday_subsidy: '',
  received_christmas_subsidy: '',
  received_social_security: '',
  received_irs: '',
  received_net_pay: '',
  notes: '',
};

const RECEIPT_FIELDS: { key: keyof ReceiptFormState; label: string }[] = [
  { key: 'received_base_salary', label: 'Vencimento Base' },
  { key: 'received_bonus', label: 'Gratificação / Prémio' },
  { key: 'received_overtime', label: 'Horas Extras' },
  { key: 'received_meal_allowance', label: 'Subsídio de Alimentação' },
  { key: 'received_holiday_subsidy', label: 'Subsídio de Férias' },
  { key: 'received_christmas_subsidy', label: 'Subsídio de Natal' },
  { key: 'received_social_security', label: 'Desconto Segurança Social' },
  { key: 'received_irs', label: 'Desconto IRS' },
  { key: 'received_net_pay', label: 'Líquido Recebido' },
];

function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formStateFromReceipt(receipt: PayslipReceipt | null): ReceiptFormState {
  if (!receipt) return EMPTY_FORM;
  return {
    received_base_salary: receipt.received_base_salary?.toString() ?? '',
    received_bonus: receipt.received_bonus?.toString() ?? '',
    received_overtime: receipt.received_overtime?.toString() ?? '',
    received_meal_allowance: receipt.received_meal_allowance?.toString() ?? '',
    received_holiday_subsidy: receipt.received_holiday_subsidy?.toString() ?? '',
    received_christmas_subsidy: receipt.received_christmas_subsidy?.toString() ?? '',
    received_social_security: receipt.received_social_security?.toString() ?? '',
    received_irs: receipt.received_irs?.toString() ?? '',
    received_net_pay: receipt.received_net_pay?.toString() ?? '',
    notes: receipt.notes ?? '',
  };
}

function sortReceipts(a: PayslipReceipt, b: PayslipReceipt) {
  if (a.reference_year !== b.reference_year) return b.reference_year - a.reference_year;
  return b.reference_month - a.reference_month;
}

function ComparisonRow({
  label,
  expectedValue,
  receivedValue,
}: {
  label: string;
  expectedValue: number;
  receivedValue: number | null;
}) {
  const diff = receivedValue !== null ? receivedValue - expectedValue : null;
  const matches = diff !== null && Math.abs(diff) < 0.02;
  return (
    <div className="grid grid-cols-4 items-center gap-2 border-b py-2 text-sm last:border-b-0">
      <span className="font-medium">{label}</span>
      <span className="text-right text-muted-foreground">{euro(expectedValue)}</span>
      <span className="text-right">{receivedValue === null ? '—' : euro(receivedValue)}</span>
      <span
        className={
          diff === null
            ? 'text-right text-xs text-muted-foreground'
            : matches
              ? 'text-right text-xs text-green-600'
              : 'text-right text-xs text-amber-600'
        }
      >
        {diff === null ? '—' : matches ? 'OK' : `${diff > 0 ? '+' : ''}${euro(diff)}`}
      </span>
    </div>
  );
}

// Formulário + comparação de um período (ano/mês) específico. Remontado
// (via key no componente pai) sempre que o período muda, para que o
// estado local arranque logo com os valores do recibo já guardado, sem
// precisar de sincronizar via useEffect.
function ReceiptForm({
  userId,
  year,
  month,
  existing,
  settings,
  brackets,
  subsidyMonths,
  onSaved,
}: {
  userId: string;
  year: number;
  month: number;
  existing: PayslipReceipt | null;
  settings: UserSettings;
  brackets: IrsTaxBracket[];
  subsidyMonths: { holiday: number; christmas: number };
  onSaved: (receipt: PayslipReceipt) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<ReceiptFormState>(() => formStateFromReceipt(existing));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = useMemo(
    () => calculatePayslip({ entries: [], settings, brackets, referenceMonth: month, subsidyMonths }),
    [settings, brackets, month, subsidyMonths],
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let filePath = existing?.file_path ?? null;
      let fileName = existing?.file_name ?? null;

      if (file) {
        const path = `${userId}/${year}-${String(month).padStart(2, '0')}-${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file, {
          contentType: 'application/pdf',
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);
        if (existing?.file_path) {
          await supabase.storage.from('receipts').remove([existing.file_path]);
        }
        filePath = path;
        fileName = file.name;
      }

      const payload = {
        user_id: userId,
        reference_year: year,
        reference_month: month,
        received_base_salary: toNumberOrNull(form.received_base_salary),
        received_bonus: toNumberOrNull(form.received_bonus),
        received_overtime: toNumberOrNull(form.received_overtime),
        received_meal_allowance: toNumberOrNull(form.received_meal_allowance),
        received_holiday_subsidy: toNumberOrNull(form.received_holiday_subsidy),
        received_christmas_subsidy: toNumberOrNull(form.received_christmas_subsidy),
        received_social_security: toNumberOrNull(form.received_social_security),
        received_irs: toNumberOrNull(form.received_irs),
        received_net_pay: toNumberOrNull(form.received_net_pay),
        notes: form.notes.trim() || null,
        file_path: filePath,
        file_name: fileName,
      };

      const { data, error: upsertError } = await supabase
        .from('payslip_receipts')
        .upsert(payload, { onConflict: 'user_id,reference_year,reference_month' })
        .select()
        .single();
      if (upsertError) throw new Error(upsertError.message);

      onSaved(data as PayslipReceipt);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar o recibo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {existing ? 'Editar Recibo' : 'Novo Recibo'} — {monthNamePt(month)} / {year}
          </CardTitle>
          <CardDescription>
            Preenche os valores que constam no recibo real desse mês. Todos os campos são opcionais — preenche só o
            que quiseres comparar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RECEIPT_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{field.label}</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className={INPUT_CLASS}
                  value={form[field.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Notas</span>
            <textarea
              className={INPUT_CLASS}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Ex.: mês com baixa médica de 2 dias"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">PDF do recibo</span>
            {existing?.file_name && !file && (
              <p className="text-xs text-muted-foreground">
                Já anexado: <span className="font-medium text-foreground">{existing.file_name}</span> (substitui
                escolhendo um novo ficheiro abaixo)
              </p>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar Recibo'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Comparação — {monthNamePt(month)} / {year}
          </CardTitle>
          <CardDescription>
            Só os valores que a app consegue determinar sem picagem desse mês (Vencimento Base, Segurança Social e
            Subsídios) têm veredicto. Subsídio de Férias esperado em {monthNamePt(subsidyMonths.holiday)}, Natal em{' '}
            {monthNamePt(subsidyMonths.christmas)} (ver Configurações).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 border-b pb-2 text-xs font-medium text-muted-foreground">
            <span>Rubrica</span>
            <span className="text-right">Esperado (app)</span>
            <span className="text-right">Recebido</span>
            <span className="text-right">Diferença</span>
          </div>
          <ComparisonRow
            label="Vencimento Base"
            expectedValue={expected.gross.baseSalary}
            receivedValue={toNumberOrNull(form.received_base_salary)}
          />
          <ComparisonRow
            label="Desconto Segurança Social"
            expectedValue={expected.deductions.socialSecurity}
            receivedValue={toNumberOrNull(form.received_social_security)}
          />
          <ComparisonRow
            label="Subsídio de Férias"
            expectedValue={expected.gross.holidaySubsidy}
            receivedValue={toNumberOrNull(form.received_holiday_subsidy)}
          />
          <ComparisonRow
            label="Subsídio de Natal"
            expectedValue={expected.gross.christmasSubsidy}
            receivedValue={toNumberOrNull(form.received_christmas_subsidy)}
          />

          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Só registo (variam mês a mês, sem veredicto de certo/errado):
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <span className="text-muted-foreground">
                Gratificação/Prémio: <span className="text-foreground">{euro(toNumberOrNull(form.received_bonus))}</span>
              </span>
              <span className="text-muted-foreground">
                Horas Extras: <span className="text-foreground">{euro(toNumberOrNull(form.received_overtime))}</span>
              </span>
              <span className="text-muted-foreground">
                Subsídio Alimentação:{' '}
                <span className="text-foreground">{euro(toNumberOrNull(form.received_meal_allowance))}</span>
              </span>
              <span className="text-muted-foreground">
                Desconto IRS: <span className="text-foreground">{euro(toNumberOrNull(form.received_irs))}</span>
              </span>
              <span className="text-muted-foreground">
                Líquido Recebido: <span className="text-foreground">{euro(toNumberOrNull(form.received_net_pay))}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export function RecibosClient({
  userId,
  settings,
  brackets,
  overrides,
  initialReceipts,
}: {
  userId: string;
  settings: UserSettings;
  brackets: IrsTaxBracket[];
  overrides: SubsidyPaymentOverride[];
  initialReceipts: PayslipReceipt[];
}) {
  const supabase = createClient();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [receipts, setReceipts] = useState<PayslipReceipt[]>([...initialReceipts].sort(sortReceipts));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const existing = useMemo(
    () => receipts.find((r) => r.reference_year === year && r.reference_month === month) ?? null,
    [receipts, year, month],
  );

  const subsidyMonths = useMemo(() => resolveSubsidyMonths(settings, overrides, year), [settings, overrides, year]);

  async function handleDelete(receipt: PayslipReceipt) {
    if (!window.confirm(`Eliminar o recibo de ${monthNamePt(receipt.reference_month)}/${receipt.reference_year}?`)) {
      return;
    }
    setBusyId(receipt.id);
    setListError(null);
    try {
      if (receipt.file_path) {
        await supabase.storage.from('receipts').remove([receipt.file_path]);
      }
      const { error: deleteError } = await supabase.from('payslip_receipts').delete().eq('id', receipt.id);
      if (deleteError) throw new Error(deleteError.message);
      setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Erro ao eliminar o recibo.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleViewPdf(receipt: PayslipReceipt) {
    if (!receipt.file_path) return;
    setBusyId(receipt.id);
    setListError(null);
    try {
      const { data, error: signError } = await supabase.storage.from('receipts').createSignedUrl(receipt.file_path, 60);
      if (signError || !data) throw new Error(signError?.message ?? 'Erro ao gerar link do PDF.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Erro ao abrir o PDF.');
    } finally {
      setBusyId(null);
    }
  }

  function selectReceipt(receipt: PayslipReceipt) {
    setYear(receipt.reference_year);
    setMonth(receipt.reference_month);
  }

  function startNew() {
    // Escolhe o primeiro mês do ano atual sem recibo guardado, para não
    // pisar um registo existente sem querer.
    const usedMonths = new Set(receipts.filter((r) => r.reference_year === year).map((r) => r.reference_month));
    const freeMonth = MONTH_OPTIONS.map((m) => m.value).find((m) => !usedMonths.has(m));
    setMonth(freeMonth ?? month);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Recibos Reais</h1>
        <p className="text-sm text-muted-foreground">
          Anexa o PDF do recibo de vencimento de cada mês e compara os valores reais com o que a app calcula que
          devias receber. Fica guardado para consultas futuras.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">Ano:</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={SELECT_CLASS}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground">Mês:</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={SELECT_CLASS}>
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={startNew}>
          Novo mês em branco
        </Button>
      </div>

      <ReceiptForm
        key={`${year}-${month}`}
        userId={userId}
        year={year}
        month={month}
        existing={existing}
        settings={settings}
        brackets={brackets}
        subsidyMonths={subsidyMonths}
        onSaved={(saved) => setReceipts((prev) => [...prev.filter((r) => r.id !== saved.id), saved].sort(sortReceipts))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recibos Guardados</CardTitle>
          <CardDescription>{receipts.length} recibo(s) guardado(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {listError && <p className="mb-2 text-sm text-red-500">{listError}</p>}
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não guardaste nenhum recibo.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {receipts.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">
                    {monthNamePt(r.reference_month)} / {r.reference_year}
                  </span>
                  <span className="text-muted-foreground">
                    Líquido: {euro(r.received_net_pay)} {r.file_name && `· ${r.file_name}`}
                  </span>
                  <div className="flex gap-2">
                    {r.file_path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewPdf(r)}
                        disabled={busyId === r.id}
                      >
                        Ver PDF
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => selectReceipt(r)}>
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(r)}
                      disabled={busyId === r.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
