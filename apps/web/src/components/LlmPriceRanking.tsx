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
    <section className="lpr">
      <h2 className="lpr-title">{t("rank_title")}</h2>
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

      <style jsx>{`
        .lpr { margin: 22px 0 8px; }
        .lpr-title { font-family: var(--font-brand); font-size: 20px; font-weight: 600; margin: 0 0 6px; text-align: center; }
        .lpr-sub { color: #66605a; font-size: 13.5px; text-align: center; max-width: 540px; margin: 0 auto 14px; line-height: 1.5; }
        .lpr-updated { text-align: center; font-size: 12px; color: #0f7680; margin: 0 0 10px; }
        .lpr-scroll { overflow-x: auto; border: 1px solid #d9c8b8; border-radius: 12px; background: #fff; }
        .lpr-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 560px; }
        .lpr-table th {
          text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.06em; color: #8a7a6a; border-bottom: 1px solid #efe0cd; white-space: nowrap;
        }
        .lpr-table td { padding: 9px 12px; border-bottom: 1px solid #f6ede1; vertical-align: top; }
        .lpr-table tr:last-child td { border-bottom: none; }
        .lpr-first { background: #fdf6e3; }
        .lpr-first td { font-weight: 600; }
        .lpr-rank { white-space: nowrap; width: 34px; text-align: center; }
        .lpr-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
        .lpr-hl { color: #235c23; font-weight: 700; }
        .lpr-nota { color: #8a7a6a; font-size: 12px; font-weight: 400; }
        .lpr-foot { color: #8a7a6a; font-size: 12px; margin: 8px 2px 0; line-height: 1.5; }
        .lpr-video {
          margin-top: 14px; padding: 12px 14px; border-radius: 12px;
          background: #fdf3e3; border: 1px solid #e8c48a; font-size: 13px; line-height: 1.6;
        }
        .lpr-video p { margin: 0 0 8px; }
        .lpr-video ul { margin: 0; padding-left: 18px; }
        .lpr-cta { text-align: center; font-weight: 700; color: #0f7680; font-size: 13.5px; margin: 14px 0 0; }
      `}</style>
    </section>
  );
}
