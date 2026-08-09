"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  // Portal: escapa de ancestral com containing block do Reader (mesma cura
  // do AuthModal/SettingsModal/AskModal — BUG "menu cortado/quebra livro").
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  return createPortal(
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

        {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
      </div>
    </div>,
    document.body,
  );
}
