"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import {
  LLM_PRICES,
  TRANSCRICAO_PRECOS,
  custoResumo,
  custoTraducao,
  usd,
  fetchLlmPrices,
  type LlmPrice,
} from "@/lib/llm-prices";

// Locale pra formatar data conforme o idioma da interface.
const LOCALE_BY_LANG: Record<string, string> = {
  "pt-BR": "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE",
  it: "it-IT", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR",
  ar: "ar-SA", hi: "hi-IN",
};

/** Formata US$ com sufixo "USD" explícito (pra ninguém confundir com real). */
function usdLabel(v: number): string {
  return `US$ ${v.toFixed(v >= 1 ? 2 : v >= 0.1 ? 3 : 4)}`;
}

/**
 * 🏆 Ranking de Preços das IAs (pedido do Miguel, 2026-08-05):
 * "a pessoa paga pela API dela — o que a gente pode colocar como informação
 * é o ranking de preço". Tabela simpática comparando os modelos que o Moka
 * aceita (BYOK), + o aviso de que VÍDEO é outro sistema (preço por minuto).
 *
 * Desde 09/08: preços DINÂMICOS — fetchLlmPrices() busca o JSON do agente
 * atualizador (diário) com cache 24h; se falhar, usa fallback hardcoded.
 * Mostra "atualizado em DD/MM/AAAA" quando os dados são frescos.
 */
export function LlmPriceRanking() {
  const { t, lang } = useI18n();
  const [prices, setPrices] = useState<LlmPrice[]>(LLM_PRICES);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchLlmPrices().then((r) => {
      setPrices(r.prices);
      setUpdatedAt(r.updated_at);
    });
  }, []);

  // Data formatada no idioma da interface (antes era sempre pt-BR).
  const atualizadoEm = updatedAt
    ? new Date(updatedAt).toLocaleDateString(LOCALE_BY_LANG[lang] || "en-US")
    : null;

  return (
    <section className="lpr" id="mural-das-ias">
      {/* 🏆 "Mural das IAs" (pedido Miguel, 13/08): nome da seção de IAs. */}
      <h2 className="lpr-mural">
        {lang === "en" ? "🏆 AI Wall" : lang === "es" ? "🏆 Mural de IAs" : lang === "fr" ? "🏆 Mur des IAs" : "🏆 Mural das IAs"}
      </h2>
      <h3 className="lpr-title">{t("rank_title")}</h3>
      <p className="lpr-sub">{t("rank_sub")}</p>
      {atualizadoEm && (
        <p className="lpr-updated">↻ {t("rank_updated") || "Preços atualizados em"} {atualizadoEm}</p>
      )}

      <div className="lpr-scroll">
        <table className="lpr-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("rank_col_model")}</th>
              <th>⏱️ {lang === "en" ? "/page" : lang === "es" ? "/pág." : lang === "fr" ? "/page" : "/página"}</th>
              <th>{t("rank_col_io")}</th>
              <th>{t("rank_col_book")}</th>
              <th>{t("rank_col_trans")}</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((m) => (
              <tr key={m.modelo} className={m.rank === 1 ? "lpr-first" : ""}>
                <td className="lpr-rank">
                  {m.rank === 1 ? "🥇" : m.rank === 2 ? "🥈" : m.rank === 3 ? "🥉" : m.rank}
                </td>
                <td>
                  <b>{m.modelo}</b>
                  {m.nota && <span className="lpr-nota"> · {m.nota}</span>}
                </td>
                <td className="lpr-num lpr-vel">{m.velSeg ? `≈${m.velSeg}s` : "—"}</td>
                <td className="lpr-num">{usdLabel(m.inUsd)} / {usdLabel(m.outUsd)}</td>
                <td className="lpr-num lpr-hl">{usdLabel(custoResumo(m))}</td>
                <td className="lpr-num">{usdLabel(custoTraducao(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lpr-foot">{t("rank_note")}</p>

      {/* ⚠️ Vídeo é OUTRO sistema (pedido do Miguel): não é qualquer LLM. */}
      <div className="lpr-video">
        <p>{t("rank_video_note")}</p>
        <ul>
          {TRANSCRICAO_PRECOS.map((v) => (
            <li key={v.servico}>
              {v.servico}: <b>{usdLabel(v.porHora)}</b> {t("rank_per_hour")}
            </li>
          ))}
        </ul>
        {/* Estimativa prática de transcrever 1h de vídeo (pedido Miguel). */}
        <p className="lpr-video-est">
          {t("rank_per_hour") === "per hour"
            ? "Estimate: transcribing 1h of video costs ~"
            : "Estimativa: transcrever 1h de vídeo custa ~"}<b>US$ 0,04 a US$ 0,36</b>{t("rank_per_hour") === "per hour" ? " depending on the service." : " conforme o serviço."}
        </p>
      </div>

      <p className="lpr-cta">{t("rank_cta")}</p>

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </section>
  );
}
