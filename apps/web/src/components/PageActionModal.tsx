"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedBook } from "@igot/parser";
import { useI18n } from "./I18nProvider";
import {
  summarizeStream,
  explainPageStream,
  type BookContext,
} from "@/lib/ai-client";

interface PageActionModalProps {
  book: ParsedBook;
  /** Texto da página que está na tela. */
  pageText: string;
  /** Rótulo da página atual (ex.: "Página 3", "Capítulo 2"). */
  pageLabel: string;
  /** Total de páginas do livro (pro aviso de gasto de tokens). */
  totalPages: number;
  /** Monta a compilação de trechos do livro inteiro (escopo "livro"). */
  buildBookCompilation: () => string;
  /** Fecha a janela. */
  onClose: () => void;
  /** Salva o resultado nas anotações. */
  onSaveNote?: (entry: {
    kind: "summary" | "explain";
    source: string;
    result: string;
    chapterId?: string;
  }) => void;
  /** Capítulo de origem (pra contexto da nota). */
  chapterId?: string;
}

type Fn = "summary" | "explain";
type Scope = "page" | "book";

/** Limites da barra deslizante (% das palavras da página) por função.
 *  Pedido do Miguel (2026-08-01): cada função tem mínimo e máximo;
 *  o resumo nunca passa de ~metade do texto da página. */
const FN_LIMITS: Record<Fn, { min: number; max: number; def: number }> = {
  summary: { min: 5, max: 50, def: 20 },
  explain: { min: 30, max: 100, def: 60 },
};

/**
 * Janela ANOTAR (📝) — Resumir ou Explicar a página inteira.
 *
 * Um ícone só na barra (antes eram dois: 📝 resumo + 🧠 explicação —
 * redundância cortada a pedido do Miguel). A pessoa escolhe a função,
 * ajusta o TAMANHO na barra deslizante (mais curto ⟷ mais longo) e
 * o resultado chega com streaming, salvo nas anotações automaticamente.
 * O resumo também cobre o livro inteiro (com aviso de tokens).
 */
export function PageActionModal({
  book,
  pageText,
  pageLabel,
  totalPages,
  buildBookCompilation,
  onClose,
  onSaveNote,
  chapterId,
}: PageActionModalProps) {
  const { t } = useI18n();
  const [fn, setFn] = useState<Fn>("summary");
  const [scope, setScope] = useState<Scope>("page");
  const [pct, setPct] = useState<number>(FN_LIMITS.summary.def);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Janela minimizada (pilula flutuante) — o livro fica 100% visível
   *  enquanto a IA trabalha ou enquanto a pessoa lê o resultado. */
  const [minimized, setMinimized] = useState(false);
  /** Posição quando arrastada (null = encaixe padrão na ESQUERDA —
   *  nunca tapa o zoom, que mora no canto superior DIREITO). Pedido do
   *  Miguel (02/08): a janela tem que ser flexível — arrasta pelo título
   *  e redimensiona pelo canto (desktop). */
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const finePointer =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: fine)").matches ?? false);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!finePointer) return; // celular: folha inferior fixa
    if ((e.target as HTMLElement).closest("button")) return; // ➖/✕ não arrastam
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = modalRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 430;
    const x = Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - w - 8);
    const y = Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - 60);
    setPos({ x, y, w });
  };
  const onHeaderPointerUp = () => {
    dragRef.current = null;
  };

  const bookCtx: BookContext = {
    bookTitle: book.title,
    bookAuthor: book.author,
    bookLanguage: book.language,
  };

  const pageWords = useMemo(
    () => pageText.split(/\s+/).filter(Boolean).length,
    [pageText],
  );
  const limits = FN_LIMITS[fn];
  const targetWords = Math.max(15, Math.round((pageWords * pct) / 100));

  /** Troca de função: slider volta pro padrão daquela função. */
  const pickFn = (next: Fn) => {
    setFn(next);
    setPct(FN_LIMITS[next].def);
    if (next === "explain") setScope("page"); // explicação é sempre da página
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

  // Rola pro fim conforme o resultado chega (streaming).
  useEffect(() => {
    if (result) {
      resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
    }
  }, [result]);

  const run = async () => {
    if (loading) return;
    const text = fn === "explain" || scope === "page" ? pageText : buildBookCompilation();
    if (!text.trim()) {
      setError(t("reader_no_text"));
      return;
    }
    setStarted(true);
    setLoading(true);
    setResult("");
    setError(null);

    const res =
      fn === "explain"
        ? await explainPageStream(text, bookCtx, (full) => setResult(full), targetWords)
        : await summarizeStream(
            text,
            scope,
            bookCtx,
            (full) => setResult(full),
            scope === "page" ? targetWords : undefined,
          );
    setLoading(false);
    if (res.ok && res.text) {
      setResult(res.text);
      // AUTO-SAVE: vira anotação (tipo "summary" ou "explain").
      const sourcePreview =
        fn === "explain" || scope === "page"
          ? `${pageLabel} — ${text.length > 300 ? `${text.slice(0, 300)}…` : text}`
          : t("summary_source_book", { title: book.title });
      onSaveNote?.({ kind: fn, source: sourcePreview, result: res.text, chapterId });
    } else {
      setResult(null);
      setError(res.error ?? "Erro.");
    }
  };

  const reset = () => {
    setStarted(false);
    setResult(null);
    setError(null);
  };

  return (
    <div className="summary-overlay" aria-hidden={minimized}>
      {/* Minimizada: vira uma pilula no canto — livro 100% livre. */}
      {minimized ? (
        <button
          className="pa-pill"
          onClick={() => setMinimized(false)}
          title={t("pa_title")}
        >
          {loading ? "⏳" : "📝"} {t("pa_title")} ▲
        </button>
      ) : (
      <div
        className={`summary-modal${finePointer ? " pa-movable" : ""}${pos ? " pa-dragged" : ""}`}
        ref={modalRef}
        style={
          pos
            ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", width: pos.w }
            : undefined
        }
        role="dialog"
        aria-label={t("pa_title")}
      >
        <header
          className="summary-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          title={finePointer ? "arraste pra mover a janela" : undefined}
        >
          <h2>{t("pa_title")}</h2>
          <div className="pa-header-btns">
            <button onClick={() => setMinimized(true)} aria-label="minimizar" title="minimizar — o livro fica inteiro visível">
              ➖
            </button>
            <button onClick={onClose} aria-label={t("close")} title={t("close")}>
              ✕
            </button>
          </div>
        </header>

        <div className="summary-body" ref={resultRef}>
          {!started && (
            <>
              {/* Escolha da função: Resumir ou Explicar */}
              <div className="pa-fn-row" role="tablist">
                <button
                  className={`pa-fn ${fn === "summary" ? "active" : ""}`}
                  onClick={() => pickFn("summary")}
                  role="tab"
                  aria-selected={fn === "summary"}
                >
                  📖 {t("pa_summary")}
                </button>
                <button
                  className={`pa-fn ${fn === "explain" ? "active" : ""}`}
                  onClick={() => pickFn("explain")}
                  role="tab"
                  aria-selected={fn === "explain"}
                >
                  🧠 {t("pa_explain")}
                </button>
              </div>

              {/* Escopo (só resumo): página ou livro inteiro */}
              {fn === "summary" && (
                <div className="pa-fn-row">
                  <button
                    className={`pa-fn small ${scope === "page" ? "active" : ""}`}
                    onClick={() => setScope("page")}
                  >
                    📄 {t("summary_scope_page")}
                  </button>
                  <button
                    className={`pa-fn small ${scope === "book" ? "active" : ""}`}
                    onClick={() => setScope("book")}
                  >
                    📚 {t("summary_scope_book")}
                  </button>
                </div>
              )}
              {fn === "summary" && scope === "book" && (
                <p className="pa-warning">⚠️ {t("summary_token_warning", { n: totalPages })}</p>
              )}

              {/* Barra deslizante de tamanho (só escopo página) */}
              {(fn === "explain" || scope === "page") && (
                <div className="pa-slider-block">
                  <div className="pa-slider-head">
                    <span>{t("pa_length")}</span>
                    <strong>{t("pa_words", { n: targetWords })}</strong>
                  </div>
                  <input
                    type="range"
                    min={limits.min}
                    max={limits.max}
                    step={1}
                    value={pct}
                    onChange={(e) => setPct(Number(e.target.value))}
                    aria-label={t("pa_length")}
                  />
                  <div className="pa-slider-caps">
                    <span>🤏 {t("pa_shorter")}</span>
                    <span>{t("pa_longer")} 🐘</span>
                  </div>
                  {fn === "summary" && (
                    <p className="pa-cap-note">{t("pa_max_half")}</p>
                  )}
                </div>
              )}

              <button className="pa-go" onClick={run} disabled={loading}>
                {fn === "summary" ? `☕ ${t("pa_go_summary")}` : `☕ ${t("pa_go_explain")}`}
              </button>
            </>
          )}

          {started && (
            <div className="summary-scope-line">
              <span>
                {fn === "explain" ? "🧠" : "📖"} {fn === "explain" || scope === "page" ? pageLabel : `📚 ${book.title}`}
                {(fn === "explain" || scope === "page") && ` · ~${targetWords} ${t("pa_words_unit")}`}
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
          /* POPUP FLUTUANTE (pedido do Miguel, 2026-08-02): SEM fundo escuro
             e SEM cobrir a tela — a página do livro continua INTEIRA e
             brilhante atrás. Encaixe padrão na lateral ESQUERDA (o controle
             de zoom mora no canto superior DIREITO — nunca pode ser tapado).
             Desktop: arrastável pelo título + redimensionável pelo canto. */
          .summary-overlay {
            position: fixed;
            inset: 0;
            z-index: 1000;
            pointer-events: none; /* os cliques passam direto pro livro */
            background: transparent;
          }
          .summary-modal {
            pointer-events: auto;
            position: fixed;
            top: 72px;
            left: 16px;
            bottom: 16px;
            width: min(430px, calc(100vw - 32px));
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 14px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          }
          .summary-modal.pa-dragged {
            bottom: auto;
          }
          @media (min-width: 701px) {
            .summary-modal.pa-movable {
              resize: both;
              overflow: hidden;
              min-width: 300px;
              min-height: 220px;
              max-width: calc(100vw - 32px);
              max-height: calc(100vh - 32px);
            }
            .summary-modal.pa-movable .summary-header {
              cursor: grab;
              user-select: none;
              touch-action: none;
            }
            .summary-modal.pa-movable .summary-header:active {
              cursor: grabbing;
            }
          }
          @media (max-width: 700px) {
            .summary-modal {
              top: auto;
              left: 0;
              right: 0;
              bottom: 0;
              width: 100%;
              max-height: 58vh;
              border-radius: 14px 14px 0 0;
            }
          }
          .pa-pill {
            pointer-events: auto;
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 1000;
            padding: 10px 16px;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: var(--bg);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            cursor: pointer;
          }
          .summary-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            border-bottom: 1px solid var(--border);
          }
          .summary-header h2 {
            margin: 0;
            font-size: 16px;
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
          .pa-header-btns {
            display: flex;
            gap: 6px;
          }
          .summary-body {
            padding: 16px 18px 18px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-height: 120px;
          }
          .pa-fn-row {
            display: flex;
            gap: 10px;
          }
          .pa-fn {
            flex: 1;
            padding: 13px 10px;
            border: 1px solid var(--border);
            background: var(--surface);
            border-radius: 12px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            color: var(--text);
            transition: var(--transition);
          }
          .pa-fn.small {
            padding: 9px 10px;
            font-size: 13px;
            font-weight: 500;
          }
          .pa-fn:hover {
            border-color: var(--accent);
          }
          .pa-fn.active {
            border-color: var(--accent);
            background: var(--accent-soft);
            color: var(--accent);
          }
          .pa-warning {
            margin: 0;
            font-size: 12px;
            color: var(--accent);
          }
          .pa-slider-block {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--surface);
          }
          .pa-slider-head {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: var(--text-muted);
          }
          .pa-slider-head strong {
            color: var(--text);
          }
          .pa-slider-block input[type="range"] {
            width: 100%;
            accent-color: var(--accent);
            height: 28px;
          }
          .pa-slider-caps {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-muted);
          }
          .pa-cap-note {
            margin: 2px 0 0;
            font-size: 11px;
            color: var(--text-muted);
          }
          .pa-go {
            padding: 14px;
            border: none;
            border-radius: 12px;
            background: var(--accent);
            color: var(--accent-contrast, #fff);
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: var(--transition);
          }
          .pa-go:disabled {
            opacity: 0.6;
            cursor: wait;
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
      )}
    </div>
  );
}
