"use client";

import { useState } from "react";
import { PRESETS } from "@igot/ai-providers";
import { computeCostUsd, getCurrency, convertFromUsd, fmtMoney } from "@/lib/telemetry";
import { tt } from "@/lib/telemetry-strings";
import { useI18n } from "./I18nProvider";

/**
 * 🧮 Calculadora de custo de IA — quantos tokens vou usar, quanto custa?
 * Viveu no alto da página de telemetria em lugar estranho; o Miguel
 * gostou da ideia mas mandou pra casa melhor (25/08): o MURAL DAS IAs,
 * onde a pessoa está ESCOLHENDO IA — é ali que comparar custo faz
 * sentido. Telemetria é o SEU bolso (gastos reais).
 */
export function CostCalculator() {
  const { lang } = useI18n();
  const [calcProvider, setCalcProvider] = useState("deepseek");
  const [calcModel, setCalcModel] = useState("");
  const [calcIn, setCalcIn] = useState(100000);
  const [calcOut, setCalcOut] = useState(5000);
  const [calcResult, setCalcResult] = useState<number | null>(null);

  const handleCalc = async () => {
    const cost = await computeCostUsd(
      calcProvider,
      calcModel.trim(),
      Math.max(0, calcIn || 0),
      Math.max(0, calcOut || 0),
    );
    setCalcResult(cost);
  };

  const fmt = (usd: number): string => {
    const base = `US$ ${usd >= 0.01 ? usd.toFixed(2) : usd.toFixed(4)}`;
    const cur = getCurrency();
    if (cur.code === "USD") return base;
    return `${base} (≈ ${fmtMoney(convertFromUsd(usd, cur), cur)})`;
  };

  return (
    <div className="tele-calc-box mural-calc">
      <h3 className="tele-group-title" style={{ marginTop: 0 }}>
        🧮 {tt(lang, "tele_cost")}
      </h3>
      <label>
        {tt(lang, "tele_provider")}:
        <select
          value={calcProvider}
          onChange={(e) => {
            setCalcProvider(e.target.value);
            setCalcResult(null);
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tt(lang, "tele_model")}:
        <input
          type="text"
          value={calcModel}
          onChange={(e) => {
            setCalcModel(e.target.value);
            setCalcResult(null);
          }}
          placeholder={PRESETS.find((p) => p.id === calcProvider)?.defaultModel ?? ""}
          spellCheck={false}
        />
      </label>
      <label>
        {tt(lang, "usage_in")} (tokens):
        <input
          type="number"
          min={0}
          value={calcIn}
          onChange={(e) => {
            setCalcIn(Number(e.target.value) || 0);
            setCalcResult(null);
          }}
        />
      </label>
      <label>
        {tt(lang, "usage_out")} (tokens):
        <input
          type="number"
          min={0}
          value={calcOut}
          onChange={(e) => {
            setCalcOut(Number(e.target.value) || 0);
            setCalcResult(null);
          }}
        />
      </label>
      <button type="button" className="tele-btn" onClick={() => void handleCalc()}>
        🧮 {tt(lang, "tele_cost")}
      </button>
      {calcResult !== null && (
        <div className="tele-calc-result">
          ≈ {fmt(calcResult)}{" "}
          <em className="usage-toast-est">({tt(lang, "usage_estimated")})</em>
        </div>
      )}
    </div>
  );
}
