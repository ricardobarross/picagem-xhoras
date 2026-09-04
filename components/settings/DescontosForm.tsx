'use client';

// components/settings/DescontosForm.tsx
// Formulário dos descontos: Segurança Social, IRS (taxa fixa ou escalões
// do governo) e se o fim de semana entra ou não na base declarada.
//
// Cada trabalhador tem um acordo diferente com a entidade patronal — por
// isso tudo aqui é editável, e nada vem "travado" com uma regra fixa.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { IrsCalculationType, IrsOfficialBracket, IrsTaxBracket, UserSettings } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type BracketRow = {
  // id só existe para escalões já gravados; linhas novas não têm.
  id?: string;
  min_income: string;
  max_income: string; // vazio = sem limite superior
  rate: string;
  deduction: string;
};

function bracketToRow(b: IrsTaxBracket): BracketRow {
  return {
    id: b.id,
    min_income: String(b.min_income),
    max_income: b.max_income === null ? '' : String(b.max_income),
    rate: String(b.rate),
    deduction: String(b.deduction),
  };
}

function emptyRow(): BracketRow {
  return { min_income: '', max_income: '', rate: '', deduction: '' };
}

export function DescontosForm({
  userId,
  initialSettings,
  initialBrackets,
}: {
  userId: string;
  initialSettings: UserSettings;
  initialBrackets: IrsTaxBracket[];
}) {
  const supabase = createClient();

  const [socialSecurityRate, setSocialSecurityRate] = useState(String(initialSettings.social_security_rate));
  const [irsType, setIrsType] = useState<IrsCalculationType>(initialSettings.irs_calculation_type);
  const [irsFixedRate, setIrsFixedRate] = useState(String(initialSettings.irs_fixed_rate));
  const [declareWeekendIncome, setDeclareWeekendIncome] = useState(initialSettings.declare_weekend_income);
  const [brackets, setBrackets] = useState<BracketRow[]>(
    initialBrackets.length > 0 ? initialBrackets.map(bracketToRow) : [emptyRow()],
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loadingOfficial, setLoadingOfficial] = useState(false);
  const [officialYearLoaded, setOfficialYearLoaded] = useState<number | null>(null);

  function updateBracket(index: number, patch: Partial<BracketRow>) {
    setBrackets((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeBracket(index: number) {
    setBrackets((rows) => rows.filter((_, i) => i !== index));
  }

  // Pré-preenche a lista de escalões com a tabela geral de IRS mais
  // recente disponível em `irs_official_brackets` (dados de referência —
  // ver comentário na migração 0004). Fica tudo editável depois de
  // carregado, e só grava de facto quando se clica em "Guardar".
  async function handleLoadOfficialBrackets() {
    setError(null);
    setSaved(false);
    setOfficialYearLoaded(null);
    setLoadingOfficial(true);

    const { data, error: fetchError } = await supabase
      .from('irs_official_brackets')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .order('min_income', { ascending: true });

    setLoadingOfficial(false);

    if (fetchError) return setError(fetchError.message);
    if (!data || data.length === 0) {
      return setError('Ainda não há escalões oficiais gravados na base de dados.');
    }

    const typedData = data as IrsOfficialBracket[];
    const latestYear = typedData[0].fiscal_year;
    const latestRows = typedData.filter((b) => b.fiscal_year === latestYear);

    setBrackets(
      latestRows.map((b) => ({
        min_income: String(b.min_income),
        max_income: b.max_income === null ? '' : String(b.max_income),
        rate: String(b.rate),
        deduction: String(b.deduction),
      })),
    );
    setOfficialYearLoaded(latestYear);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const ssRate = Number(socialSecurityRate.replace(',', '.'));
    if (!(ssRate >= 0 && ssRate <= 100)) {
      return setError('A taxa de Segurança Social tem de estar entre 0 e 100.');
    }

    const fixedRate = Number(irsFixedRate.replace(',', '.'));
    if (irsType === 'fixed_rate' && !(fixedRate >= 0 && fixedRate <= 100)) {
      return setError('A taxa fixa de IRS tem de estar entre 0 e 100.');
    }

    let parsedBrackets: { min_income: number; max_income: number | null; rate: number; deduction: number }[] = [];
    if (irsType === 'bracket') {
      const rows = brackets.filter((r) => r.min_income.trim() !== '' || r.rate.trim() !== '');
      if (rows.length === 0) {
        return setError('Adiciona pelo menos um escalão de IRS, ou muda para taxa fixa.');
      }
      for (const row of rows) {
        const min = Number(row.min_income.replace(',', '.'));
        const rate = Number(row.rate.replace(',', '.'));
        if (!(min >= 0)) return setError('Cada escalão precisa de um valor "De" válido.');
        if (!(rate >= 0 && rate <= 100)) return setError('Cada escalão precisa de uma taxa entre 0 e 100.');
        parsedBrackets.push({
          min_income: min,
          max_income: row.max_income.trim() === '' ? null : Number(row.max_income.replace(',', '.')),
          rate,
          deduction: Number((row.deduction || '0').replace(',', '.')) || 0,
        });
      }
      parsedBrackets = parsedBrackets.sort((a, b) => a.min_income - b.min_income);
    }

    setSaving(true);

    const { error: updateError } = await supabase
      .from('user_settings')
      .update({
        social_security_rate: ssRate,
        irs_calculation_type: irsType,
        irs_fixed_rate: irsType === 'fixed_rate' ? fixedRate : initialSettings.irs_fixed_rate,
        declare_weekend_income: declareWeekendIncome,
      })
      .eq('user_id', userId);

    if (updateError) {
      setSaving(false);
      return setError(updateError.message);
    }

    if (irsType === 'bracket') {
      // Substitui os escalões antigos pelos atuais numa única chamada RPC
      // (função replace_irs_tax_brackets, migração 0006): o delete+insert
      // corre dentro da mesma invocação de função no Postgres, por isso é
      // atómico — ao contrário de dois pedidos HTTP separados, uma falha
      // de rede a meio nunca deixa o utilizador sem escalões gravados.
      const { error: rpcError } = await supabase.rpc('replace_irs_tax_brackets', {
        p_user_settings_id: initialSettings.id,
        p_brackets: parsedBrackets,
      });

      if (rpcError) {
        setSaving(false);
        return setError(rpcError.message);
      }
    }

    setSaving(false);
    setSaved(true);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Descontos</CardTitle>
        <CardDescription>
          Segurança Social e IRS incidem sobre o &quot;valor declarado&quot;. Ajusta tudo consoante o teu acordo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Segurança Social (% do valor declarado)">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={socialSecurityRate}
              onChange={(e) => setSocialSecurityRate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={declareWeekendIncome}
              onChange={(e) => setDeclareWeekendIncome(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block">Fim de semana entra na base declarada</span>
              <span className="block text-xs text-muted-foreground">
                Desligado (por defeito): sábados e domingos são recebidos à parte, sem Segurança Social nem IRS.
                Ligado: sábados e domingos somam-se aos dias úteis antes de calcular os descontos.
              </span>
            </span>
          </label>

          <div className="h-px bg-border" />

          <Field label="Cálculo do IRS">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="irs_type"
                  checked={irsType === 'fixed_rate'}
                  onChange={() => setIrsType('fixed_rate')}
                />
                Taxa fixa
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="irs_type"
                  checked={irsType === 'bracket'}
                  onChange={() => setIrsType('bracket')}
                />
                Escalões do governo
              </label>
            </div>
          </Field>

          {irsType === 'fixed_rate' ? (
            <Field label="Taxa fixa de IRS (% do valor declarado)">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={irsFixedRate}
                onChange={(e) => setIrsFixedRate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                Escalões (imposto = valor declarado × taxa − dedução). Deixa &quot;Até&quot; vazio no último escalão.
              </span>

              <Button type="button" variant="outline" onClick={handleLoadOfficialBrackets} disabled={loadingOfficial}>
                {loadingOfficial ? 'A carregar…' : 'Carregar escalões oficiais'}
              </Button>
              {officialYearLoaded && (
                <p className="text-xs text-muted-foreground">
                  Escalões gerais de {officialYearLoaded} carregados (Continente). Confirma os valores no{' '}
                  <a
                    href="https://info.portaldasfinancas.gov.pt"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Portal das Finanças
                  </a>{' '}
                  antes de fechar uma folha real — continuam editáveis abaixo.
                </p>
              )}

              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_20px] gap-1 text-xs text-muted-foreground">
                <span className="truncate">De (€)</span>
                <span className="truncate">Até (€)</span>
                <span className="truncate">Taxa (%)</span>
                <span className="truncate">Dedução (€)</span>
                <span />
              </div>
              {brackets.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_1fr_20px] items-center gap-1">
                  <input
                    type="number"
                    step={0.01}
                    value={row.min_income}
                    onChange={(e) => updateBracket(index, { min_income: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step={0.01}
                    placeholder="sem limite"
                    value={row.max_income}
                    onChange={(e) => updateBracket(index, { max_income: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step={0.1}
                    value={row.rate}
                    onChange={(e) => updateBracket(index, { rate: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step={0.01}
                    value={row.deduction}
                    onChange={(e) => updateBracket(index, { deduction: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeBracket(index)}
                    className="w-5 shrink-0 text-sm text-muted-foreground hover:text-destructive"
                    aria-label="Remover escalão"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setBrackets((rows) => [...rows, emptyRow()])}>
                Adicionar escalão
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && <p className="text-sm text-green-600">Guardado.</p>}

          <Button type="submit" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
