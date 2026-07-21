"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedBook } from "@igot/parser";
import { useI18n } from "./I18nProvider";
import {
  planTranslation,
  loadTransJob,
  clearTransJob,
  runTranslationJob,
  mergeTranslatedVolumes,
  type JobProgress,
  type TranslationPlan,
} from "@/lib/book-translate";

interface TranslateBookModalProps {
  book: ParsedBook;
  /** ID do usuário logado (pra sync na nuvem); null = só local. */
  userId?: string | null;
  onClose: () => void;
}

type Phase =
  | "confirm" // tela inicial: plano + aviso de tokens + começar/continuar
  | "running" // traduzindo (progresso por volume/página + cancelar)
  | "cancelled" // pausado pelo usuário (pode continuar depois)
  | "done" // todos os volumes prontos (oferece integrar)
  | "merging" // integrando volumes num livro único
  | "merged" // livro único pronto
  | "error"; // falhou (job salvo — dá pra continuar)

/**
 * Janela "Traduzir livro inteiro" (ícone 🌍).
 *
 * Fluxo:
 *   1. CONFIRMAR — mostra o plano (N páginas → V volumes de ~50) e o
 *      aviso de tokens. Se houver job salvo, oferece CONTINUAR de onde
 *      parou (volumes prontos não são refeitos) ou RECOMEÇAR.
 *   2. RODANDO — barra de progresso (volume x/y · página z), cronômetro
 *      e botão cancelar. Cada volume pronto vira EPUB (baixado) + livro
 *      na estante, automaticamente.
 *   3. PRONTO — lista os volumes e oferece o INTEGRADOR: junta tudo
 *      num livro único (EPUB baixado + estante).
 */
export function TranslateBookModal({ book, userId, onClose }: TranslateBookModalProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [plan] = useState<TranslationPlan>(() => planTranslation(book));
  const [savedJob] = useState(() => loadTransJob(book));
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const cancelledRef = useRef(false);

  // Cronômetro (roda enquanto traduz/integra).
  useEffect(() => {
    if (phase !== "running" && phase !== "merging") {
      setSecs(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  // Fecha com ESC (não fecha enquanto roda — pra não dar a impressão de
  // que cancelou; a tradução continua mesmo com a janela fechada? NÃO:
  // fechar a janela não cancela, mas o usuário pode pensar que sim.
  // Então durante "running" o ESC é ignorado — use o botão Cancelar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "running" && phase !== "merging") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  const start = async (resume: boolean) => {
    cancelledRef.current = false;
    setError(null);
    setPhase("running");
    try {
      const result = await runTranslationJob({
        book,
        userId,
        resume,
        onProgress: setProgress,
        isCancelled: () => cancelledRef.current,
      });
      if (result.cancelled) {
        setPhase("cancelled");
      } else if (result.ok) {
        setPhase("done");
      }
    } catch (err) {
      // Erro no meio (rede, rate limit...): o job ficou salvo — dá pra
      // continuar exatamente da página onde parou.
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
  };

  const merge = async () => {
    setPhase("merging");
    try {
      const r = await mergeTranslatedVolumes({ book, userId, volumesTotal: plan.volumesTotal });
      if (r.ok) setPhase("merged");
      else {
        setError(r.error ?? "Erro.");
        setPhase("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const restart = () => {
    clearTransJob(book);
    start(false);
  };

  const resumeVolume = savedJob
    ? savedJob.completedVolumes + (savedJob.partialPages.length > 0 ? 0 : 1)
    : 0;

  return (
    <div className="tb-overlay" onClick={phase === "running" || phase === "merging" ? undefined : onClose}>
      <div className="tb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("tb_title")}>
        <header className="tb-header">
          <h2>🌍 {t("tb_title")}</h2>
          {phase !== "running" && phase !== "merging" && (
            <button onClick={onClose} aria-label={t("close")} title={t("close")}>
              ✕
            </button>
          )}
        </header>

        <div className="tb-body">
          {/* ── CONFIRMAR ── */}
          {phase === "confirm" && (
            <>
              <p className="tb-book">📖 {book.title}</p>
              <div className="tb-stats">
                <span>📄 {t("tb_pages", { n: plan.totalPages })}</span>
                <span>
                  📚 {t("tb_volumes", { n: plan.volumesTotal, size: plan.volumeSize })}
                </span>
                <span>🌐 {t("tb_lang", { lang: plan.targetLang })}</span>
              </div>
              <p className="tb-info">{t("tb_auto_download")}</p>
              <p className="tb-warning">⚠️ {t("tb_token_warning")}</p>

              {savedJob && savedJob.completedVolumes < plan.volumesTotal && (
                <div className="tb-resume-box">
                  <p>
                    ⏸ {t("tb_resume_hint", { n: savedJob.completedVolumes, total: plan.volumesTotal })}
                  </p>
                  <button className="tb-btn tb-btn-primary" onClick={() => start(true)}>
                    ▶ {t("tb_resume", { n: resumeVolume || savedJob.completedVolumes + 1 })}
                  </button>
                  <button className="tb-btn tb-btn-ghost" onClick={restart}>
                    ↺ {t("tb_restart")}
                  </button>
                </div>
              )}

              {(!savedJob || savedJob.completedVolumes >= plan.volumesTotal) && (
                <button className="tb-btn tb-btn-primary" onClick={() => start(false)}>
                  🌍 {t("tb_start")}
                </button>
              )}
            </>
          )}

          {/* ── RODANDO ── */}
          {phase === "running" && (
            <div className="tb-running">
              <div className="tb-anim">
                <span className="tb-dot" />
                <span className="tb-dot" />
                <span className="tb-dot" />
              </div>
              <p className="tb-progress-label">
                {progress
                  ? t("tb_running", {
                      v: progress.volume,
                      vt: progress.volumesTotal,
                      p: progress.pageInVolume,
                      pt: progress.pagesInVolume,
                    })
                  : t("tb_starting")}
              </p>
              {progress && (
                <div className="tb-bar" aria-hidden>
                  <div
                    className="tb-bar-fill"
                    style={{
                      width: `${Math.round((progress.donePages / progress.totalPages) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <span className="tb-secs">{secs}s</span>
              <button className="tb-btn tb-btn-danger" onClick={cancel}>
                ✕ {t("cancel")}
              </button>
            </div>
          )}

          {/* ── CANCELADO ── */}
          {phase === "cancelled" && (
            <>
              <p className="tb-info">⏸ {t("tb_cancelled")}</p>
              <button className="tb-btn tb-btn-primary" onClick={() => start(true)}>
                ▶ {t("tb_continue")}
              </button>
              <button className="tb-btn tb-btn-ghost" onClick={onClose}>
                {t("close")}
              </button>
            </>
          )}

          {/* ── PRONTO ── */}
          {phase === "done" && (
            <>
              <p className="tb-done">✅ {t("tb_done", { n: plan.volumesTotal })}</p>
              {plan.volumesTotal > 1 && (
                <button className="tb-btn tb-btn-primary" onClick={merge}>
                  📕 {t("tb_merge")}
                </button>
              )}
              <button className="tb-btn tb-btn-ghost" onClick={onClose}>
                {t("close")}
              </button>
            </>
          )}

          {/* ── INTEGRANDO ── */}
          {phase === "merging" && (
            <div className="tb-running">
              <div className="tb-anim">
                <span className="tb-dot" />
                <span className="tb-dot" />
                <span className="tb-dot" />
              </div>
              <p className="tb-progress-label">{t("tb_merging")}</p>
            </div>
          )}

          {/* ── INTEGRADO ── */}
          {phase === "merged" && (
            <>
              <p className="tb-done">📕 {t("tb_merged")}</p>
              <button className="tb-btn tb-btn-ghost" onClick={onClose}>
                {t("close")}
              </button>
            </>
          )}

          {/* ── ERRO ── */}
          {phase === "error" && (
            <>
              <p className="tb-error">⚠️ {t("tb_error", { msg: error ?? "" })}</p>
              <p className="tb-info">{t("tb_error_hint")}</p>
              <button className="tb-btn tb-btn-primary" onClick={() => start(true)}>
                ▶ {t("tb_continue")}
              </button>
              <button className="tb-btn tb-btn-ghost" onClick={onClose}>
                {t("close")}
              </button>
            </>
          )}
        </div>

        <style jsx>{`
          .tb-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .tb-modal {
            background: var(--bg);
            border-radius: 14px;
            width: 100%;
            max-width: 520px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          .tb-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 22px;
            border-bottom: 1px solid var(--border);
          }
          .tb-header h2 {
            margin: 0;
            font-size: 17px;
            font-weight: 700;
          }
          .tb-header button {
            border: none;
            background: var(--surface-alt);
            color: var(--text-muted);
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
          }
          .tb-body {
            padding: 18px 22px 22px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-height: 120px;
          }
          .tb-book {
            margin: 0;
            font-weight: 600;
            font-size: 15px;
          }
          .tb-stats {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 14px;
            color: var(--text-muted);
          }
          .tb-info {
            margin: 0;
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.5;
          }
          .tb-warning {
            margin: 0;
            padding: 12px;
            background: var(--accent-soft);
            border-radius: 8px;
            color: var(--accent);
            font-size: 13px;
            line-height: 1.5;
          }
          .tb-resume-box {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
            border: 1px dashed var(--border);
            border-radius: 10px;
          }
          .tb-resume-box p {
            margin: 0;
            font-size: 13px;
            color: var(--text-muted);
          }
          .tb-btn {
            border: none;
            border-radius: 10px;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition);
          }
          .tb-btn-primary {
            background: var(--accent);
            color: #fff;
          }
          .tb-btn-primary:hover {
            filter: brightness(1.1);
          }
          .tb-btn-ghost {
            background: var(--surface-alt);
            color: var(--text);
          }
          .tb-btn-danger {
            background: var(--accent-soft);
            color: var(--accent);
          }
          .tb-running {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
          }
          .tb-anim {
            display: flex;
            gap: 6px;
          }
          .tb-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent);
            opacity: 0.4;
            animation: tb-bounce 1.2s infinite ease-in-out;
          }
          .tb-dot:nth-child(2) {
            animation-delay: 0.15s;
          }
          .tb-dot:nth-child(3) {
            animation-delay: 0.3s;
          }
          @keyframes tb-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          .tb-progress-label {
            margin: 0;
            font-size: 14px;
            text-align: center;
          }
          .tb-bar {
            width: 100%;
            height: 8px;
            background: var(--surface-alt);
            border-radius: 99px;
            overflow: hidden;
          }
          .tb-bar-fill {
            height: 100%;
            background: var(--accent);
            border-radius: 99px;
            transition: width 0.4s ease;
          }
          .tb-secs {
            font-size: 12px;
            color: var(--text-muted);
          }
          .tb-done {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            line-height: 1.5;
          }
          .tb-error {
            margin: 0;
            padding: 12px;
            background: var(--accent-soft);
            border-radius: 8px;
            color: var(--accent);
            font-size: 14px;
            line-height: 1.5;
          }
        `}</style>
      </div>
    </div>
  );
}
