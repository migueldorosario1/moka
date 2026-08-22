"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PRESETS } from "@igot/ai-providers";
import {
  listRecords,
  clearRecords,
  convertFromUsd,
  fmtMoney,
  computeCostUsd,
  CURRENCIES,
  getCurrency,
  setCurrency,
  type TelemetryRecord,
  type Currency,
} from "@/lib/telemetry";
import { tt, taskLabel } from "@/lib/telemetry-strings";
import { useI18n } from "@/components/I18nProvider";

/** Chave do marcador "mostrar também na moeda do país". */
const SHOW_LOCAL_KEY = "moka.telemetry.showLocal";

const USD: Currency = { code: "USD", symbol: "$", name: "US Dollar", rate: 1 };

/** Formata epoch ms como data curta no idioma da interface. */
function fmtDate(ts: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/** Linha agregada (por provedor / tarefa / modelo). */
interface AggRow {
  key: string;
  label: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

function aggregate(
  records: TelemetryRecord[],
  pick: (r: TelemetryRecord) => { key: string; label: string },
): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of records) {
    const { key, label } = pick(r);
    const row = map.get(key) ?? { key, label, calls: 0, tokens: 0, costUsd: 0 };
    row.calls += 1;
    row.tokens += r.totalTokens;
    row.costUsd += r.costUsd;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

/** Escapa um campo pro CSV. */
function csvField(v: string | number | boolean): string {
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * /telemetria — página de controle de gastos de IA (pedido do Miguel,
 * 2026-08-22). Reúne num banco LOCAL (IndexedDB) todas as despesas com cada
 * IA/tarefa/modelo, com custo em dólar E na moeda do país (marcador),
 * calculadora de custo, exportação CSV e limpar histórico. Nada sai do
 * dispositivo.
 */
export default function TelemetriaPage() {
  const { lang } = useI18n();
  const [records, setRecords] = useState<TelemetryRecord[] | null>(null);
  const [currency, setCurrencyState] = useState<Currency>(USD);
  const [showLocal, setShowLocal] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);

  // ── Calculadora ──
  const [calcProvider, setCalcProvider] = useState("deepseek");
  const [calcModel, setCalcModel] = useState("");
  const [calcIn, setCalcIn] = useState(100000);
  const [calcOut, setCalcOut] = useState(5000);
  const [calcResult, setCalcResult] = useState<number | null>(null);

  const load = useCallback(() => {
    void listRecords().then(setRecords);
  }, []);

  useEffect(() => {
    load();
    setCurrencyState(getCurrency());
    try {
      const saved = window.localStorage.getItem(SHOW_LOCAL_KEY);
      if (saved === "0") setShowLocal(false);
    } catch { /* sem localStorage, segue padrão */ }
  }, [load]);

  const totals = useMemo(() => {
    if (!records) return null;
    let tokens = 0;
    let costUsd = 0;
    let errors = 0;
    for (const r of records) {
      tokens += r.totalTokens;
      costUsd += r.costUsd;
      if (r.status === "error") errors += 1;
    }
    return { calls: records.length, tokens, costUsd, errors };
  }, [records]);

  const byProvider = useMemo(
    () => aggregate(records ?? [], (r) => ({ key: r.providerId, label: r.providerName || r.providerId })),
    [records],
  );
  const byTask = useMemo(
    () => aggregate(records ?? [], (r) => ({ key: r.task, label: taskLabel(lang, r.task) })),
    [records, lang],
  );
  const byModel = useMemo(
    () => aggregate(records ?? [], (r) => {
      const label = `${r.providerName || r.providerId} · ${r.model || "default"}`;
      return { key: `${r.providerId}/${r.model || "default"}`, label };
    }),
    [records],
  );

  const changeCurrency = (code: string) => {
    setCurrency(code);
    const found = CURRENCIES.find((c) => c.code === code);
    if (found) setCurrencyState(found);
  };

  const toggleShowLocal = () => {
    setShowLocal((v) => {
      try { window.localStorage.setItem(SHOW_LOCAL_KEY, v ? "0" : "1"); } catch { /* ok */ }
      return !v;
    });
  };

  /** Mostra o custo em dólar (+ moeda local, se o marcador estiver ligado). */
  const money = (usd: number) => {
    const base = fmtMoney(usd, USD);
    if (!showLocal || currency.code === "USD") return base;
    return `${base} ≈ ${fmtMoney(convertFromUsd(usd, currency), currency)}`;
  };

  const handleCalc = async () => {
    const cost = await computeCostUsd(
      calcProvider,
      calcModel.trim(),
      Math.max(0, calcIn || 0),
      Math.max(0, calcOut || 0),
    );
    setCalcResult(cost);
  };

  const handleExportCsv = () => {
    if (!records || records.length === 0) return;
    const header = [
      "date", "task", "provider_id", "provider", "model",
      "prompt_tokens", "completion_tokens", "total_tokens",
      "estimated", "cost_usd", "status", "note",
    ];
    const lines = [header.join(",")];
    for (const r of records) {
      lines.push([
        csvField(new Date(r.ts).toISOString()),
        csvField(r.task),
        csvField(r.providerId),
        csvField(r.providerName),
        csvField(r.model),
        r.promptTokens,
        r.completionTokens,
        r.totalTokens,
        r.usageEstimated,
        r.costUsd.toFixed(6),
        csvField(r.status),
        csvField(r.note ?? ""),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moka-telemetria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (!confirm(tt(lang, "tele_clear_confirm"))) return;
    await clearRecords();
    setRecords([]);
  };

  return (
    <main className="tele-page">
      <Link href="/configuracoes" className="info-back">← {tt(lang, "usage_view")}</Link>
      <div className="tele-header">
        <h1 className="tele-title">📊 {tt(lang, "tele_page_title")}</h1>
        <button
          type="button"
          className={`tele-calc-toggle ${calcOpen ? "active" : ""}`}
          onClick={() => setCalcOpen((o) => !o)}
        >
          🧮 Calculadora
        </button>
      </div>
      <p className="tele-sub">{tt(lang, "tele_intro")}</p>

      {/* Moeda + marcador "mostrar também na moeda do país" */}
      <div className="tele-currency-row">
        <label htmlFor="tele-currency">💱 {tt(lang, "tele_currency")}:</label>
        <select
          id="tele-currency"
          value={currency.code}
          onChange={(e) => changeCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <label className="tts-checkbox-row" title={tt(lang, "tele_approx")}>
          <input type="checkbox" checked={showLocal} onChange={toggleShowLocal} />
          💲 + {currency.code}
        </label>
      </div>

      {/* Calculadora de custo */}
      {calcOpen && (
        <div className="tele-calc-box">
          <label>
            {tt(lang, "tele_provider")}:
            <select value={calcProvider} onChange={(e) => { setCalcProvider(e.target.value); setCalcResult(null); }}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            {tt(lang, "tele_model")}:
            <input
              type="text"
              value={calcModel}
              onChange={(e) => { setCalcModel(e.target.value); setCalcResult(null); }}
              placeholder={PRESETS.find((p) => p.id === calcProvider)?.defaultModel ?? ""}
              spellCheck={false}
            />
          </label>
          <label>
            {tt(lang, "usage_in")} (tokens):
            <input type="number" min={0} value={calcIn} onChange={(e) => { setCalcIn(Number(e.target.value) || 0); setCalcResult(null); }} />
          </label>
          <label>
            {tt(lang, "usage_out")} (tokens):
            <input type="number" min={0} value={calcOut} onChange={(e) => { setCalcOut(Number(e.target.value) || 0); setCalcResult(null); }} />
          </label>
          <button type="button" className="tele-btn" onClick={handleCalc}>
            🧮 {tt(lang, "tele_cost")}
          </button>
          {calcResult !== null && (
            <div className="tele-calc-result">
              ≈ {money(calcResult)}{" "}
              <em className="usage-toast-est">({tt(lang, "usage_estimated")})</em>
            </div>
          )}
        </div>
      )}

      {records === null ? (
        <p className="tele-empty">⏳ …</p>
      ) : !totals || totals.calls === 0 ? (
        <p className="tele-empty">{tt(lang, "tele_empty")}</p>
      ) : (
        <>
          {/* Totais */}
          <div className="tele-totals">
            <div className="tele-total-card">
              <span className="num">{money(totals.costUsd)}</span>
              <span className="lbl">{tt(lang, "tele_total")}</span>
            </div>
            <div className="tele-total-card">
              <span className="num">{totals.tokens.toLocaleString()}</span>
              <span className="lbl">{tt(lang, "tele_tokens")}</span>
            </div>
            <div className="tele-total-card">
              <span className="num">{totals.calls.toLocaleString()}</span>
              <span className="lbl">{tt(lang, "tele_calls")}</span>
            </div>
          </div>

          {/* Por provedor */}
          <h2 className="tele-group-title">{tt(lang, "tele_by_provider")}</h2>
          <table className="tele-table">
            <thead>
              <tr>
                <th>{tt(lang, "tele_provider")}</th>
                <th className="num">{tt(lang, "tele_calls")}</th>
                <th className="num">{tt(lang, "tele_tokens")}</th>
                <th className="num">{tt(lang, "tele_cost")}</th>
              </tr>
            </thead>
            <tbody>
              {byProvider.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{row.calls}</td>
                  <td className="num">{row.tokens.toLocaleString()}</td>
                  <td className="num">{money(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Por tarefa */}
          <h2 className="tele-group-title">{tt(lang, "tele_by_task")}</h2>
          <table className="tele-table">
            <thead>
              <tr>
                <th>{tt(lang, "tele_task")}</th>
                <th className="num">{tt(lang, "tele_calls")}</th>
                <th className="num">{tt(lang, "tele_tokens")}</th>
                <th className="num">{tt(lang, "tele_cost")}</th>
              </tr>
            </thead>
            <tbody>
              {byTask.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{row.calls}</td>
                  <td className="num">{row.tokens.toLocaleString()}</td>
                  <td className="num">{money(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Por modelo */}
          <h2 className="tele-group-title">{tt(lang, "tele_by_model")}</h2>
          <table className="tele-table">
            <thead>
              <tr>
                <th>{tt(lang, "tele_model")}</th>
                <th className="num">{tt(lang, "tele_calls")}</th>
                <th className="num">{tt(lang, "tele_tokens")}</th>
                <th className="num">{tt(lang, "tele_cost")}</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{row.calls}</td>
                  <td className="num">{row.tokens.toLocaleString()}</td>
                  <td className="num">{money(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Histórico (últimos 100) */}
          <h2 className="tele-group-title">{tt(lang, "tele_history")}</h2>
          <div className="tele-records">
            {records.slice(0, 100).map((r) => (
              <div key={r.id} className="tele-record">
                <div>
                  <div>
                    {taskLabel(lang, r.task)}
                    {r.status === "error" ? ` · ⚠️ ${tt(lang, "tele_err")}` : ""}
                  </div>
                  <div className="tele-record-meta">
                    {fmtDate(r.ts, lang)} · {r.providerName || r.providerId}
                    {r.model ? ` (${r.model})` : ""} ·{" "}
                    {r.promptTokens.toLocaleString()} ↓ / {r.completionTokens.toLocaleString()} ↑
                    {r.usageEstimated ? ` · ${tt(lang, "usage_estimated")}` : ""}
                  </div>
                </div>
                <span className={`tele-record-cost ${r.status === "error" ? "err" : ""}`}>
                  {money(r.costUsd)}
                </span>
              </div>
            ))}
          </div>

          {/* Ações */}
          <div className="tele-actions">
            <button type="button" className="tele-btn" onClick={handleExportCsv}>
              ⬇️ {tt(lang, "tele_export_csv")}
            </button>
            <button type="button" className="tele-btn danger" onClick={handleClear}>
              🗑 {tt(lang, "tele_clear")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
