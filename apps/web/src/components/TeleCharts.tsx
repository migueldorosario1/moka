"use client";

import { useMemo, useState, type ReactElement } from "react";
import type { TelemetryRecord } from "@/lib/telemetry";
import { tt } from "@/lib/telemetry-strings";
import { useI18n } from "./I18nProvider";

/**
 * 📈 Gráficos da telemetria (pedido do Miguel, 24/08): DOIS gráficos de
 * barras empilhadas por DIA — custo (US$) e tokens — cobrindo TODAS as
 * tarefas/idiomas cadastrados, com LEGENDA CLICÁVEL por LLM: o usuário
 * marca quais quer ver (todas ou só algumas). SVG puro, sem biblioteca —
 * o bundle continua leve e o desenho é da casa.
 */

const PALETTE = [
  "#8a5a2b", "#2563eb", "#0d9488", "#dc2626", "#7c3aed",
  "#d97706", "#0891b2", "#65a30d", "#db2777", "#475569",
];
const DAYS = 14;

/** Chave local (yyyy-mm-dd) — sem UTC, o dia é o da parede do usuário. */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface ModelAgg {
  key: string;
  color: string;
  cost: number;
  tokens: number;
}

export function TeleCharts({ records }: { records: TelemetryRecord[] }) {
  const { lang } = useI18n();
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  const { days, models, byDay } = useMemo(() => {
    const days: string[] = [];
    const now = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      days.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    }
    const modelTotals = new Map<string, { cost: number; tokens: number }>();
    const byDay = new Map<string, { cost: number; tokens: number }>();
    for (const r of records) {
      const key = r.model || r.providerName || r.providerId;
      const day = dayKey(new Date(r.ts));
      if (!days.includes(day)) continue;
      const mt = modelTotals.get(key) ?? { cost: 0, tokens: 0 };
      mt.cost += r.costUsd;
      mt.tokens += r.totalTokens;
      modelTotals.set(key, mt);
      const dk = `${day}|${key}`;
      const dv = byDay.get(dk) ?? { cost: 0, tokens: 0 };
      dv.cost += r.costUsd;
      dv.tokens += r.totalTokens;
      byDay.set(dk, dv);
    }
    const models: ModelAgg[] = [...modelTotals.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([key, v], i) => ({
        key,
        color: PALETTE[i % PALETTE.length],
        cost: v.cost,
        tokens: v.tokens,
      }));
    return { days, models, byDay };
  }, [records]);

  const active = models.filter((m) => !off.has(m.key));

  const chart = (metric: "cost" | "tokens"): ReactElement => {
    const totals = days.map((d) =>
      active.reduce((s, m) => s + (byDay.get(`${d}|${m.key}`)?.[metric] ?? 0), 0),
    );
    const max = Math.max(...totals, 0.000001);
    const W = 700, H = 190, BW = W / DAYS, PADB = 26;
    const bars: ReactElement[] = [];
    days.forEach((d, i) => {
      let y = H - PADB;
      for (const m of active) {
        const v = byDay.get(`${d}|${m.key}`)?.[metric] ?? 0;
        if (v <= 0) continue;
        const h = ((H - PADB - 14) * v) / max;
        y -= h;
        bars.push(
          <rect
            key={`${d}|${m.key}`}
            x={i * BW + BW * 0.18}
            y={y}
            width={BW * 0.64}
            height={h}
            fill={m.color}
            rx={1.5}
          />,
        );
      }
      if (i % 2 === 0) {
        bars.push(
          <text key={`t${d}`} x={i * BW + BW / 2} y={H - 8} fontSize={9} textAnchor="middle" fill="#6b5d4d">
            {d.slice(8, 10)}/{d.slice(5, 7)}
          </text>,
        );
      }
      const tot = totals[i];
      if (tot > 0) {
        bars.push(
          <text key={`v${d}`} x={i * BW + BW / 2} y={y - 3} fontSize={9} textAnchor="middle" fill="#1a1714">
            {metric === "cost"
              ? tot.toFixed(tot < 0.01 ? 3 : 2)
              : tot >= 1000
                ? `${(tot / 1000).toFixed(1)}k`
                : String(tot)}
          </text>,
        );
      }
    });
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="tele-chart-svg" role="img">
        {bars}
      </svg>
    );
  };

  if (models.length === 0) {
    return <p className="gdrive-hint">{tt(lang, "tele_charts_empty")}</p>;
  }

  return (
    <div className="tele-charts">
      {/* Legenda = seletor: clique pra ligar/desligar uma LLM. */}
      <div className="tele-legend">
        {models.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`legend-chip ${off.has(m.key) ? "off" : ""}`}
            onClick={() => {
              const next = new Set(off);
              if (next.has(m.key)) next.delete(m.key);
              else next.add(m.key);
              setOff(next);
            }}
            title={m.key}
          >
            <span className="legend-dot" style={{ background: m.color }} />
            {m.key} ·{" "}
            {m.cost >= 0.01 ? `US$ ${m.cost.toFixed(2)}` : `US$ ${m.cost.toFixed(4)}`}
          </button>
        ))}
        <button
          type="button"
          className="legend-chip all"
          onClick={() => setOff(new Set())}
        >
          {tt(lang, "tele_charts_all")}
        </button>
      </div>
      <h4 className="tele-chart-title">💵 {tt(lang, "tele_charts_cost")}</h4>
      {chart("cost")}
      <h4 className="tele-chart-title">🎫 {tt(lang, "tele_charts_tokens")}</h4>
      {chart("tokens")}
    </div>
  );
}
