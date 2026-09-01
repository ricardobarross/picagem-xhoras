'use client';

// components/dashboard/DashboardCharts.tsx
// Gráficos do dashboard, construídos à mão em HTML/CSS (sem biblioteca de
// gráficos) seguindo o método da skill de dataviz: forma pelo papel dos
// dados, cor fixa por categoria (nunca por valor), marcas finas com fim
// arredondado de 4px e vão de 2px entre segmentos, tooltip ao passar o
// rato/focar, e uma tabela equivalente sempre disponível por baixo (os
// cartões "Discriminação de horas" e "Simulação de recibo" do dashboard).
//
// As cores foram validadas com scripts/validate_palette.js da skill —
// ver o histórico da conversa para os resultados. Nunca trocar estas
// cores por outras "só visualmente parecidas" sem voltar a validar.

import { useState } from 'react';
import type { DayCategory } from '@/types/database.types';
import { formatDatePt, formatHours } from '@/lib/time-utils';

const CATEGORY_LABEL: Record<DayCategory, string> = {
  weekday: 'Dia útil',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const CATEGORY_VAR: Record<DayCategory, string> = {
  weekday: 'var(--series-weekday)',
  saturday: 'var(--series-saturday)',
  sunday: 'var(--series-sunday)',
};

function euro(value: number) {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

// Estilos partilhados pelos dois gráficos — cores por papel (categórica),
// com variante escura própria, tal como o resto da app já faz em globals.css.
function ChartStyles() {
  return (
    <style>{`
      .dash-charts {
        --series-weekday: #2a78d6;
        --series-saturday: #eb6834;
        --series-sunday: #1baf7a;
        --series-subsidies: #eda100;
        --series-liquido: #008300;
        --series-ss: #4a3aa7;
        --series-irs: #e34948;
        --chart-grid: #e1e0d9;
      }
      @media (prefers-color-scheme: dark) {
        .dash-charts {
          --series-weekday: #3987e5;
          --series-saturday: #d95926;
          --series-sunday: #199e70;
          --series-subsidies: #c98500;
          --series-liquido: #008300;
          --series-ss: #9085e9;
          --series-irs: #e66767;
          --chart-grid: #2c2c2a;
        }
      }
    `}</style>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------
// Gráfico 1 — horas por dia no período, coloridas por categoria do dia.
// ---------------------------------------------------------------------

export interface DailyHours {
  date: string; // "YYYY-MM-DD"
  hours: number;
  category: DayCategory;
}

export function DailyHoursChart({ days }: { days: DailyHours[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.hours));

  return (
    <div className="dash-charts flex flex-col gap-3">
      <ChartStyles />
      <div className="flex items-end gap-[2px]" style={{ height: 140 }}>
        {days.map((d, i) => {
          const heightPct = (d.hours / max) * 100;
          const isHovered = hovered === i;
          return (
            <div
              key={d.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              tabIndex={d.hours > 0 ? 0 : -1}
            >
              {isHovered && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
                >
                  <span className="font-semibold">{formatHours(d.hours)}</span>{' '}
                  <span className="text-muted-foreground">
                    · {formatDatePt(d.date)} · {CATEGORY_LABEL[d.category]}
                  </span>
                </div>
              )}
              <div
                className="w-full max-w-[16px] rounded-t-[4px] transition-opacity"
                style={{
                  height: `${Math.max(heightPct, d.hours > 0 ? 3 : 0)}%`,
                  background: CATEGORY_VAR[d.category],
                  opacity: hovered === null || isHovered ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="h-px bg-[var(--chart-grid)]" />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <LegendSwatch color="var(--series-weekday)" label="Dia útil" />
        <LegendSwatch color="var(--series-saturday)" label="Sábado" />
        <LegendSwatch color="var(--series-sunday)" label="Domingo" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Gráfico 2/3 — barra empilhada horizontal genérica (composição do bruto,
// líquido vs. descontos). Uma única "barra" = 100% de um total.
// ---------------------------------------------------------------------

export interface StackedSegment {
  label: string;
  value: number;
  color: string; // var(--series-x)
}

export function StackedBar({ segments }: { segments: StackedSegment[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);

  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">Sem valores neste período.</p>;
  }

  return (
    <div className="dash-charts flex flex-col gap-3">
      <ChartStyles />
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md bg-[var(--chart-grid)]">
        {segments
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const pct = (s.value / total) * 100;
            const showInlineLabel = pct >= 14;
            return (
              <div
                key={s.label}
                className="group relative flex h-full items-center justify-center"
                style={{ flex: `${s.value} 0 0%`, background: s.color }}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered((h) => (h === i ? null : h))}
                tabIndex={0}
              >
                {showInlineLabel && (
                  <span className="px-1 text-[11px] font-medium text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.35)]">
                    {Math.round(pct)}%
                  </span>
                )}
                {hovered === i && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
                  >
                    <span className="font-semibold">{euro(s.value)}</span>{' '}
                    <span className="text-muted-foreground">
                      · {s.label} · {Math.round(pct)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <LegendSwatch key={s.label} color={s.color} label={`${s.label} · ${euro(s.value)}`} />
        ))}
      </div>
    </div>
  );
}
