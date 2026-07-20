"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedBook } from "@igot/parser";
import { useI18n } from "./I18nProvider";
import { summarizeStream, type BookContext } from "@/lib/ai-client";

interface SummaryModalProps {
  book: ParsedBook;
  /** Texto da página que está na tela (escopo "página"). */
  pageText: string;
  /** Rótulo da página atual (ex.: "Página 3", "Capítulo 2"). */
  pageLabel: string;
  /** Total de páginas do livro (pro aviso de gasto de tokens). */
  totalPages: number;
  /** Monta a compilação de trechos do livro inteiro (escopo "livro"). */
  buildBookCompilation: () => string;
  /** Fecha a janela. */
  onClose: () => void;
  /** Salva o resumo nas anotações. */
  onSaveNote?: (entry: {
    kind: "summary";
    source: string;
    result: string;
    chapterId?: string;
  }) => void;
  /** Capítulo de origem (pra contexto da nota). */
  chapterId?: string;
}

/**
 * Janela de RESUMO (ícone 📝).
 *
 * Dois escopos, escolhidos pela pessoa antes de gastar tokens:
 *   - "Esta página": resume só o que está na tela (barato).
 *   - "O livro inteiro": resume uma compilação de trechos do livro —
 *     com AVISO claro de que mais páginas = mais tokens gastos.
 *
 * O resultado aparece com streaming na própria janela e é salvo nas
 * anotações automaticamente (tipo "summary").
 */
export function SummaryModal({
  book,
  pageText,
  pageLabel,
  totalPages,
  buildBookCompilation,
  onClose,
  onSaveNote,
  chapterId,
}: SummaryModalProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"page" | "book" | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const bookCtx: BookContext = {
    bookTitle: book.title,
    bookAuthor: book.author,
    bookLanguage: book.language,
  };

  // Fecha com ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rola pro fim conforme o resumo chega (streaming).
  useEffect(() => {
    if (result) {
      resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
    }
  }, [result]);

  const run = async (chosen: "page" | "book") => {
    if (loading) return;
    const text = chosen === "page" ? pageText : buildBookCompilation();
    if (!text.trim()) {
      setError(t("reader_no_text"));
      return;
    }
    setScope(chosen);
    setLoading(true);
    setResult("");
    setError(null);

    const res = await summarizeStream(text, chosen, bookCtx, (full) => setResult(full));
    setLoading(false);
    if (res.ok && res.text) {
      setResult(res.text);
      // AUTO-SAVE: resumo vira anotação (tipo "summary").
      const sourcePreview =
        chosen === "page"
          ? `${pageLabel} — ${text.length > 300 ? `${text.slice(0, 300)}…` : text}`
          : t("summary_source_book", { title: book.title });
      onSaveNote?.({ kind: "summary", source: sourcePreview, result: res.text, chapterId });
    } else {
      setResult(null);
      setError(res.error ?? "Erro.");
    }
  };

  const reset = () => {
    setScope(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("summary_modal_title")}>
        <header className="summary-header">
          <h2>{t("summary_modal_title")}</h2>
          <button onClick={onClose} aria-label={t("close")} title={t("close")}>
            ✕
          </button>
        </header>

        <div className="summary-body" ref={resultRef}>
          {/* Escolha de escopo — some quando um resumo está rodando/pronto. */}
          {scope === null && (
            <div className="summary-options">
              <button className="summary-option" onClick={() => run("page")}>
                <span className="summary-option-icon">📄</span>
                <span className="summary-option-label">{t("summary_scope_page")}</span>
                <span className="summary-option-sub">{pageLabel}</span>
              </button>
              <button className="summary-option" onClick={() => run("book")}>
                <span className="summary-option-icon">📚</span>
                <span className="summary-option-label">{t("summary_scope_book")}</span>
                <span className="summary-option-sub summary-warning">
                  ⚠️ {t("summary_token_warning", { n: totalPages })}
                </span>
              </button>
            </div>
          )}

          {scope !== null && (
            <div className="summary-scope-line">
              <span>
                {scope === "page" ? `📄 ${pageLabel}` : `📚 ${book.title}`}
              </span>
              {!loading && (
                <button className="summary-back" onClick={reset}>
                  ← {t("summary_change_scope")}
                </button>
              )}
            </div>
          )}

          {loading && !result && (
            <div className="summary-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="summary-loading-label">{t("summary_running")}</span>
            </div>
          )}

          {error && <p className="summary-error">⚠️ {error}</p>}
          {result && <div className="summary-result">{result}</div>}
        </div>

        <style jsx>{`
          .summary-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .summary-modal {
            background: var(--bg);
            border-radius: 14px;
            width: 100%;
            max-width: 560px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          .summary-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 22px;
            border-bottom: 1px solid var(--border);
          }
          .summary-header h2 {
            margin: 0;
            font-size: 17px;
            font-weight: 700;
          }
          .summary-header button {
            border: none;
            background: var(--surface-alt);
            color: var(--text-muted);
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
          }
          .summary-body {
            padding: 18px 22px 22px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-height: 120px;
          }
          .summary-options {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .summary-option {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            padding: 16px 18px;
            border: 1px solid var(--border);
            background: var(--surface);
            border-radius: 12px;
            cursor: pointer;
            text-align: left;
            transition: var(--transition);
            color: var(--text);
          }
          .summary-option:hover {
            border-color: var(--accent);
            background: var(--accent-soft);
          }
          .summary-option-icon {
            font-size: 22px;
          }
          .summary-option-label {
            font-weight: 600;
            font-size: 15px;
          }
          .summary-option-sub {
            font-size: 12px;
            color: var(--text-muted);
          }
          .summary-warning {
            color: var(--accent);
          }
          .summary-scope-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 13px;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border);
            padding-bottom: 10px;
          }
          .summary-back {
            border: none;
            background: transparent;
            color: var(--accent);
            font-size: 12px;
            cursor: pointer;
            padding: 4px 6px;
          }
          .summary-back:hover {
            text-decoration: underline;
          }
          .summary-loading {
            display: flex;
            align-items: center;
            gap: 6px;
            justify-content: center;
            padding: 12px 0;
          }
          .summary-loading-label {
            font-size: 13px;
            color: var(--text-muted);
            margin-left: 6px;
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent);
            opacity: 0.4;
            animation: summary-bounce 1.2s infinite ease-in-out;
          }
          .dot:nth-child(2) { animation-delay: 0.15s; }
          .dot:nth-child(3) { animation-delay: 0.3s; }
          @keyframes summary-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          .summary-error {
            margin: 0;
            padding: 12px;
            background: var(--accent-soft);
            border-radius: 8px;
            color: var(--accent);
            font-size: 14px;
          }
          .summary-result {
            font-size: 15px;
            line-height: 1.7;
            white-space: pre-wrap;
          }
        `}</style>
      </div>
    </div>
  );
}
