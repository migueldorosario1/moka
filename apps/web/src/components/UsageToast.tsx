"use client";

/**
 * UsageToast — o pequeno informe de consumo (pedido do Miguel, 2026-08-22).
 *
 * Toda tarefa de IA que passa do limiar escolhido dispara um evento
 * "moka:usage" (da lib telemetry); este componente escuta e mostra um
 * pop-up discreto com tokens + custo estimado. Tem:
 *   - botão "OK" (fecha);
 *   - "Não quero mais ver isso" (desliga os pop-ups de vez);
 *   - link pra página /telemetria.
 *
 * Nunca trava o app: é 100% passivo (só escuta evento e renderiza).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "./I18nProvider";
import {
  USAGE_EVENT,
  getPrefs,
  setPrefs,
  getCurrency,
  convertFromUsd,
  fmtMoney,
  type UsageEventDetail,
} from "@/lib/telemetry";
import { tt, taskLabel } from "@/lib/telemetry-strings";

export function UsageToast() {
  const { lang } = useI18n();
  const [detail, setDetail] = useState<UsageEventDetail | null>(null);
  const [copied, setCopied] = useState(false);

  // AUTO-CLOSE REMOVIDO (Miguel, 26/08): o pop-up some rápido demais —
  // "tem que ficar FIXO e só fechar manualmente (✕ ou Ok)".
  const dismiss = useCallback(() => {
    setDetail(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    const onUsage = (ev: Event) => {
      const d = (ev as CustomEvent<UsageEventDetail>).detail;
      if (!d) return;
      setDetail(d);
      setCopied(false);
    };
    window.addEventListener(USAGE_EVENT, onUsage);
    return () => window.removeEventListener(USAGE_EVENT, onUsage);
  }, []);

  if (!detail) return null;

  const currency = getCurrency();
  const localValue = convertFromUsd(detail.costUsd, currency);
  const isErr = detail.status === "error";
  const capWarning = detail.warning === "cap-exceeded";

  const handleDontShow = () => {
    // "Não quero mais ver isso": desliga os pop-ups (ledger continua gravando).
    const prefs = getPrefs();
    setPrefs({ ...prefs, popupMode: "off" });
    dismiss();
  };

  // Botão COPIAR (Miguel, 26/08): resume o gasto numa linha pro clipboard.
  const handleCopy = () => {
    const cur = getCurrency();
    const linha =
      `${taskLabel(lang, detail.task)} — ${detail.providerName ?? detail.task}` +
      (detail.model ? ` (${detail.model})` : "") +
      ` · in ${detail.promptTokens.toLocaleString()} / out ${detail.completionTokens.toLocaleString()} tokens` +
      ` · US$ ${detail.costUsd >= 0.01 ? detail.costUsd.toFixed(4) : detail.costUsd.toFixed(5)}` +
      (cur.code !== "USD" ? ` (≈ ${fmtMoney(localValue, cur)})` : "") +
      (detail.usageEstimated ? ` (${tt(lang, "usage_estimated")})` : "");
    void navigator.clipboard
      .writeText(linha)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="usage-toast" role="status" aria-live="polite">
      <div className="usage-toast-head">
        <span className="usage-toast-title">
          {isErr ? "⚠️" : "💸"} {tt(lang, "usage_title")}
        </span>
        <button
          type="button"
          className="usage-toast-x"
          onClick={dismiss}
          aria-label="OK"
        >
          ✕
        </button>
      </div>

      <div className="usage-toast-task">
        {taskLabel(lang, detail.task)}
        {detail.providerName ? (
          <span className="usage-toast-provider">
            {" "}
            · {detail.providerName}
            {detail.model ? ` (${detail.model})` : ""}
          </span>
        ) : null}
      </div>

      {isErr ? (
        <p className="usage-toast-note usage-toast-note-err">
          {tt(lang, "usage_error_note")}
        </p>
      ) : (
        <div className="usage-toast-nums">
          <span>
            {tt(lang, "usage_in")}: {detail.promptTokens.toLocaleString()}
          </span>
          <span>
            {tt(lang, "usage_out")}: {detail.completionTokens.toLocaleString()}
          </span>
          <span className="usage-toast-cost">
            {tt(lang, "usage_cost")}: {fmtMoney(detail.costUsd, { code: "USD", symbol: "$", name: "", rate: 1 })}
            {currency.code !== "USD"
              ? ` ≈ ${fmtMoney(localValue, currency)}`
              : ""}
            {detail.usageEstimated ? (
              <em className="usage-toast-est"> ({tt(lang, "usage_estimated")})</em>
            ) : null}
          </span>
        </div>
      )}

      {capWarning && (
        <p className="usage-toast-note usage-toast-note-warn">
          {tt(lang, "usage_cap_warning")}
        </p>
      )}

      {/* Recado novo (Miguel, 26/08): os gastos vão pra telemetria. */}
      <p className="usage-toast-note usage-toast-note-tele">
        📊 {tt(lang, "usage_telemetry_note")}
      </p>

      <div className="usage-toast-actions">
        <button
          type="button"
          className="usage-toast-copy"
          onClick={handleCopy}
        >
          {copied ? tt(lang, "usage_copied") : `📋 ${tt(lang, "usage_copy")}`}
        </button>
        <Link href="/telemetria" className="usage-toast-link" onClick={dismiss}>
          📊 {tt(lang, "usage_view")}
        </Link>
        <button
          type="button"
          className="usage-toast-dontshow"
          onClick={handleDontShow}
        >
          {tt(lang, "usage_dontshow")}
        </button>
        <button
          type="button"
          className="usage-toast-ok"
          onClick={dismiss}
        >
          {tt(lang, "usage_ok")}
        </button>
      </div>
    </div>
  );
}
