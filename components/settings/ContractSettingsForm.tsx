'use client';

// components/settings/ContractSettingsForm.tsx
// Formulário para configuração de Contrato Efetivo (Trabalho por Conta de Outrem em Portugal),
// recolha das perguntas fiscais de admissão (Art. 99º CIRS), remuneração real acordada
// e termos específicos de horas extras e subsídios.

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type {
  UserSettings,
  ContractRegime,
  IrsMaritalStatus,
  FiscalRegion,
  SubsidyMode,
  PaymentMethod,
  TransportFrequency,
} from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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

export function ContractSettingsForm({
  userId,
  initialSettings,
}: {
  userId: string;
  initialSettings: UserSettings;
}) {
  const supabase = createClient();

  // Regime
  const [contractRegime, setContractRegime] = useState<ContractRegime>(
    initialSettings.contract_regime || 'effective',
  );

  // Remuneração Efetivo
  const [baseSalary, setBaseSalary] = useState(String(initialSettings.base_salary ?? 1500));
  const [fixedBonus, setFixedBonus] = useState(String(initialSettings.fixed_bonus ?? 500));
  const [agreedTotalSalary, setAgreedTotalSalary] = useState(
    String(initialSettings.agreed_total_salary ?? 2000),
  );

  // Horas Extras e Refeições
  const [overtimeFixedRate, setOvertimeFixedRate] = useState(
    String(initialSettings.overtime_fixed_rate ?? 12),
  );
  const [extraMealValue, setExtraMealValue] = useState(
    String(initialSettings.extra_meal_value ?? 9.5),
  );

  // Perfil Fiscal (Art. 99º CIRS)
  const [maritalStatus, setMaritalStatus] = useState<IrsMaritalStatus>(
    initialSettings.irs_marital_status || 'single',
  );
  const [dependentsCount, setDependentsCount] = useState(
    String(initialSettings.irs_dependents_count ?? 0),
  );
  const [hasDisability, setHasDisability] = useState<boolean>(
    initialSettings.irs_has_disability ?? false,
  );
  const [fiscalRegion, setFiscalRegion] = useState<FiscalRegion>(
    initialSettings.fiscal_region || 'continente',
  );

  // Subsídios Férias e Natal
  const [holidayMonth, setHolidayMonth] = useState<number>(
    initialSettings.holiday_subsidy_month ?? 1,
  );
  const [christmasMonth, setChristmasMonth] = useState<number>(
    initialSettings.christmas_subsidy_month ?? 11,
  );
  const [subsidyMode, setSubsidyMode] = useState<SubsidyMode>(
    initialSettings.subsidy_mode || 'full_in_month',
  );

  // Subsídio de Alimentação Diário
  const [mealDailyValue, setMealDailyValue] = useState(
    String(initialSettings.meal_allowance_daily_value ?? 6),
  );
  const [mealPaymentMethod, setMealPaymentMethod] = useState<PaymentMethod>(
    initialSettings.meal_allowance_payment_method || 'card',
  );

  // Subsídio de Transporte
  const [transportValue, setTransportValue] = useState(
    String(initialSettings.transport_allowance_value ?? 0),
  );
  const [transportFrequency, setTransportFrequency] = useState<TransportFrequency>(
    initialSettings.transport_allowance_frequency || 'monthly',
  );

  // Ciclo de Fecho
  const [cutoffDay, setCutoffDay] = useState(String(initialSettings.payroll_cutoff_day ?? 20));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const base = Number(baseSalary.replace(',', '.')) || 0;
    const bonus = Number(fixedBonus.replace(',', '.')) || 0;
    const agreed = Number(agreedTotalSalary.replace(',', '.')) || (base + bonus);
    const otRate = Number(overtimeFixedRate.replace(',', '.')) || 0;
    const extraMeal = Number(extraMealValue.replace(',', '.')) || 0;
    const deps = parseInt(dependentsCount, 10) || 0;
    const mealVal = Number(mealDailyValue.replace(',', '.')) || 0;
    const transportVal = Number(transportValue.replace(',', '.')) || 0;
    const cutoff = parseInt(cutoffDay, 10) || 20;

    if (base <= 0) return setError('O salário base tem de ser maior que 0.');
    if (cutoff < 1 || cutoff > 28) return setError('O dia de fecho tem de estar entre 1 e 28.');

    setSaving(true);
    const { error: updateError } = await supabase
      .from('user_settings')
      .update({
        contract_regime: contractRegime,
        base_salary: base,
        fixed_bonus: bonus,
        agreed_total_salary: agreed,
        overtime_fixed_rate: otRate,
        extra_meal_value: extraMeal,
        irs_marital_status: maritalStatus,
        irs_dependents_count: deps,
        irs_has_disability: hasDisability,
        fiscal_region: fiscalRegion,
        holiday_subsidy_month: holidayMonth,
        christmas_subsidy_month: christmasMonth,
        subsidy_mode: subsidyMode,
        meal_allowance_daily_value: mealVal,
        meal_allowance_payment_method: mealPaymentMethod,
        transport_allowance_value: transportVal,
        transport_allowance_frequency: transportFrequency,
        payroll_cutoff_day: cutoff,
      })
      .eq('user_id', userId);

    setSaving(false);
    if (updateError) return setError(updateError.message);
    setSaved(true);
  }

  return (
    <Card className="w-full max-w-2xl border-primary/20 shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Regime de Contrato e Perfil de Admissão</CardTitle>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Portugal 🇵🇹
          </span>
        </div>
        <CardDescription>
          Configura os teus rendimentos oficiais, termos contratuais e perguntas fiscais de retenção na fonte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* 1. Seleção de Regime */}
          <div className="rounded-lg border bg-muted/40 p-4">
            <label className="text-sm font-semibold">Tipo de Enquadramento Contratual</label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  contractRegime === 'effective'
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-input hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="regime"
                  value="effective"
                  checked={contractRegime === 'effective'}
                  onChange={() => setContractRegime('effective')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Contrato Efetivo / Conta de Outrem</p>
                  <p className="text-xs text-muted-foreground">
                    Salário base + prémios + subsídios de férias e natal + proteção social.
                  </p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  contractRegime === 'hourly'
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-input hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="regime"
                  value="hourly"
                  checked={contractRegime === 'hourly'}
                  onChange={() => setContractRegime('hourly')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Horista / Prestação de Serviços</p>
                  <p className="text-xs text-muted-foreground">
                    Cálculo estritamente baseado no valor-hora de dias úteis e fins de semana.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 2. Estrutura Salarial Real da Tua Empresa */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Estrutura Remuneratória (Condições Acordadas)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Salário Base no Recibo (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="1500,00"
                />
                <span className="text-[11px] text-muted-foreground">Declarado na folha oficial</span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Prémio Fixo Mensal (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fixedBonus}
                  onChange={(e) => setFixedBonus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="500,00"
                />
                <span className="text-[11px] text-muted-foreground">Gratificação regular</span>
              </div>

              <div>
                <label className="text-xs font-medium text-primary">
                  Ordenado Real Acordado (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={agreedTotalSalary}
                  onChange={(e) => setAgreedTotalSalary(e.target.value)}
                  className="mt-1 w-full rounded-md border border-primary/50 bg-background px-3 py-2 text-sm font-semibold"
                  placeholder="2000,00"
                />
                <span className="text-[11px] text-muted-foreground">Base p/ auditoria de perdas</span>
              </div>
            </div>
          </div>

          {/* 3. Horas Extras e Refeições Extras */}
          <div className="rounded-lg border bg-muted/20 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Trabalho Suplementar e Refeições Extras
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Valor Pago por Hora Extra (€/h)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={overtimeFixedRate}
                  onChange={(e) => setOvertimeFixedRate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="12,00"
                />
                <span className="text-[11px] text-muted-foreground">
                  O teu patrão paga 12€ fixos (camuflados em prémio)
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Valor por Refeição Extra (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={extraMealValue}
                  onChange={(e) => setExtraMealValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="9,50"
                />
                <span className="text-[11px] text-muted-foreground">
                  Refeição extra em dias de horas extras
                </span>
              </div>
            </div>
          </div>

          {/* 4. Perguntas de Admissão / Perfil Fiscal em Portugal (Art. 99º CIRS) */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Perfil Fiscal de Retenção na Fonte (Art. 99º CIRS)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Situação Familiar</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as IrsMaritalStatus)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="single">Não casado (Solteiro / Divorciado / Viúvo)</option>
                  <option value="married_1_earner">Casado / União de Facto (Único titular)</option>
                  <option value="married_2_earners">Casado / União de Facto (Dois titulares)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Número de Dependentes a Cargo
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={dependentsCount}
                  onChange={(e) => setDependentsCount(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Região Fiscal</label>
                <select
                  value={fiscalRegion}
                  onChange={(e) => setFiscalRegion(e.target.value as FiscalRegion)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="continente">Continente</option>
                  <option value="acores">Região Autónoma dos Açores</option>
                  <option value="madeira">Região Autónoma da Madeira</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="disability"
                  checked={hasDisability}
                  onChange={(e) => setHasDisability(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="disability" className="text-xs font-medium cursor-pointer">
                  Grau de incapacidade fiscal comprovada (≥ 60%)
                </label>
              </div>
            </div>
          </div>

          {/* 5. Calendário de Subsídios de Férias e Natal */}
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Mês de Pagamento dos Subsídios (Sem Duodécimos)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mês do Subsídio de Férias
                </label>
                <select
                  value={holidayMonth}
                  onChange={(e) => setHolidayMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">No teu caso: Janeiro</span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mês do Subsídio de Natal
                </label>
                <select
                  value={christmasMonth}
                  onChange={(e) => setChristmasMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">No teu caso: Novembro</span>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Modalidade de Recebimento de Subsídios
                </label>
                <select
                  value={subsidyMode}
                  onChange={(e) => setSubsidyMode(e.target.value as SubsidyMode)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="full_in_month">Por inteiro no respetivo mês (Sem duodécimos)</option>
                  <option value="duodecimos">Em duodécimos (diluído mensalmente)</option>
                </select>
                <span className="text-[11px] text-muted-foreground">No teu contrato: Não recebes duodécimos</span>
              </div>
            </div>
          </div>

          {/* 6. Subsídio de Refeição Diário */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Subsídio de Refeição Normal (Dias de Trabalho)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Valor Diário do Subsídio (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={mealDailyValue}
                  onChange={(e) => setMealDailyValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="6,00"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Forma de Pagamento
                </label>
                <select
                  value={mealPaymentMethod}
                  onChange={(e) => setMealPaymentMethod(e.target.value as PaymentMethod)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="card">Cartão de Refeição (isento até 10,20€/dia)</option>
                  <option value="cash">Dinheiro / Na Folha (isento até 6,00€/dia)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 7. Subsídio de Transporte */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Subsídio de Transporte</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Valor do Subsídio (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={transportValue}
                  onChange={(e) => setTransportValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="0,00"
                />
                <span className="text-[11px] text-muted-foreground">Deixa 0 se não aplicável</span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Periodicidade</label>
                <select
                  value={transportFrequency}
                  onChange={(e) => setTransportFrequency(e.target.value as TransportFrequency)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="monthly">Mensal (valor fixo por mês)</option>
                  <option value="daily">Diário (× dias trabalhados no período)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dia de Fecho da Folha */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Dia de Fecho da Folha de Ponto (por defeito dia 20)
            </label>
            <input
              type="number"
              min="1"
              max="28"
              value={cutoffDay}
              onChange={(e) => setCutoffDay(e.target.value)}
              className="mt-1 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && (
            <div className="flex items-center justify-between rounded-md bg-green-500/10 p-3 text-sm text-green-600">
              <span>Configurações contratuais gravadas com sucesso!</span>
              <Link href="/perdas" className="font-semibold underline">
                Ver Auditoria de Perdas →
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'A guardar...' : 'Guardar Configurações'}
            </Button>

            <Link
              href="/perdas"
              className="inline-flex items-center text-sm font-semibold text-primary hover:underline"
            >
              Consultar Auditoria de Direitos Sonegados →
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
