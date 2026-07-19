"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedBook } from "@igot/parser";
import type { SelectionAction } from "@/lib/types";
import { useI18n } from "./I18nProvider";
import { CafezinhoLogo } from "./CafezinhoLogo";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { translateStream, explainStream, ask, type BookContext } from "@/lib/ai-client";

interface AIPanelProps {
  action: SelectionAction | null;
  book: ParsedBook;
  onClose: () => void;
  /** Oculta o painel sem perder a ação (pode reabrir depois). */
  onHide?: () => void;
  /** Salvar a resposta atual como anotação. */
  onSaveNote?: (entry: { kind: "translate" | "explain" | "ask"; source: string; result: string; chapterId?: string }) => void;
}

interface PanelState {
  loading: boolean;
  result: string | null;
  error: string | null;
}

/**
 * Painel lateral da IA.
 *
 * Quando recebe uma `action` (Traduzir/Explicar), chama o ai-client (que
 * fala com o provedor escolhido pelo usuário, via proxy) e mostra o resultado.
 */
export function AIPanel({ action, book, onClose, onHide, onSaveNote }: AIPanelProps) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<PanelState>({
    loading: false,
    result: null,
    error: null,
  });
  const [query, setQuery] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  // Reconhecimento de voz: quando termina uma frase, preenche o input.
  const speech = useSpeechRecognition((text) => {
    setQuery(text);
  });

  const bookCtx: BookContext = {
    bookTitle: book.title,
    bookAuthor: book.author,
    bookLanguage: book.language,
  };

  // Quando o painel é fechado (action → null), limpa o estado interno pra
  // não mostrar resultado/erro antigo na próxima abertura.
  useEffect(() => {
    if (action === null) {
      setState({ loading: false, result: null, error: null });
      setQuery("");
    }
  }, [action]);

  // Dispara a ação (traduzir/explicar) quando ela muda — com STREAMING.
  // "ask" só abre o painel sem chamar a IA (usuário vai digitar/falar).
  useEffect(() => {
    if (!action) return;
    if (action.type === "ask") {
      // Só abre o painel, limpa estado pra pessoa fazer a pergunta.
      setState({ loading: false, result: null, error: null });
      return;
    }
    if (!action.text.trim()) return;

    let cancelled = false;
    setState({ loading: true, result: null, error: null });

    const run = async () => {
      // onChunk atualiza o resultado aos poucos (streaming) — o usuário vê
      // o texto ir aparecendo palavra por palavra.
      const onChunk = (full: string) => {
        if (cancelled) return;
        setState({ loading: false, result: full, error: null });
      };

      const res =
        action.type === "translate"
          ? await translateStream(action.text, bookCtx, onChunk)
          : await explainStream(action.text, bookCtx, onChunk);

      if (cancelled) return;
      if (res.ok && res.text) {
        setState({ loading: false, result: res.text, error: null });
        // AUTO-SAVE: toda tradução/explicação é salva automaticamente nas notas.
        onSaveNote?.({
          kind: action.type,
          source: action.text,
          result: res.text,
          chapterId: action.chapterId,
        });
      } else {
        setState({ loading: false, result: null, error: res.error ?? "Erro." });
      }
    };
    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // Rola pro fim quando o resultado chega.
  useEffect(() => {
    if (state.result) {
      resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
    }
  }, [state.result]);

  // Pergunta livre ao livro.
  const askBook = async () => {
    const q = query.trim();
    if (!q) return;

    setState({ loading: true, result: null, error: null });
    const res = await ask(q, bookCtx);
    setState(
      res.ok
        ? { loading: false, result: res.text ?? null, error: null }
        : { loading: false, result: null, error: res.error ?? "Erro." },
    );
    setQuery("");
  };

  const title =
    action?.type === "translate"
      ? t("reader_note_translate")
      : action?.type === "explain"
        ? t("reader_note_explain")
        : t("reader_note_question");

  return (
    <aside className="ai-panel">
      <header className="ai-header">
        <span className="ai-brand">
          <CafezinhoLogo size={22} opacity={0.9} />
          <span className="ai-title">{action ? title : t("ai_assistant")}</span>
        </span>
        <div className="ai-header-actions">
          {state.result && action && (
            <button
              className="ai-save"
              onClick={() =>
                onSaveNote?.({
                  kind: action.type,
                  source: action.text,
                  result: state.result ?? "",
                  chapterId: action.chapterId,
                })
              }
              title={t("ai_save_tooltip")}
            >
              {t("ai_save")}
            </button>
          )}
          {/* 🙉 Ocultar — esconde o painel sem perder a ação (pode reabrir). */}
          {onHide && (
            <button
              className="ai-hide"
              onClick={() => { speech.stop(); onHide(); }}
              aria-label={t("ai_hide")}
              title={t("ai_hide")}
            >
              🙉
            </button>
          )}
          {/* ✕ Fechar — fecha e limpa a ação. */}
          <button
            className="ai-close"
            onClick={() => { speech.stop(); onClose(); }}
            aria-label={t("close")}
            title={t("close")}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="ai-body" ref={resultRef}>
        {!action && !state.result && (
          <div className="ai-empty">
            <p>{t("ai_empty_hint")}</p>
            <p className="ai-empty-sub">{t("ai_empty_sub")}</p>
          </div>
        )}

        {state.loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <span className="ai-loading-label">
              {action?.type === "translate" ? t("reader_translating") : t("reader_explaining")}
            </span>
          </div>
        )}

        {state.error && <p className="ai-error">⚠️ {state.error}</p>}

        {state.result && <div className="ai-result">{state.result}</div>}
      </div>

      <footer className="ai-footer">
        {/* 🎤 Microfone: fala a pergunta em vez de digitar */}
        {speech.supported && (
          <button
            type="button"
            className={`ai-mic ${speech.listening ? "listening" : ""}`}
            onClick={() => speech.listening ? speech.stop() : speech.start(lang)}
            title={speech.listening ? t("ai_listening") : t("ai_speak_question")}
            aria-label={t("ai_speak_question")}
          >
            {speech.listening ? "🔴" : "🎤"}
          </button>
        )}
        <textarea
          rows={3}
          value={speech.listening ? speech.transcript : query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              askBook();
            }
          }}
          placeholder={speech.listening ? t("ai_listening") : t("ai_ask_placeholder", { title: truncate(book.title, 28) })}
        />
        <button onClick={askBook} disabled={!query.trim() && !speech.transcript}>
          ➤
        </button>
      </footer>

      <style jsx>{`
        .ai-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--surface);
        }
        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-soft);
          background: linear-gradient(180deg, var(--surface), transparent);
        }
        .ai-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .ai-title {
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ai-close {
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 20px;
          line-height: 1;
          padding: 6px;
          border-radius: 50%;
          transition: background var(--transition), color var(--transition);
        }
        .ai-close:hover {
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .ai-hide {
          border: none;
          background: transparent;
          font-size: 17px;
          line-height: 1;
          padding: 6px;
          border-radius: 50%;
          cursor: pointer;
          opacity: 0.65;
          transition: opacity var(--transition), background var(--transition);
        }
        .ai-hide:hover {
          opacity: 1;
          background: var(--accent-soft);
        }
        .ai-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ai-save {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 500;
          padding: 5px 12px;
          cursor: pointer;
          transition: border-color var(--transition), color var(--transition),
            box-shadow var(--transition);
        }
        .ai-save:hover {
          border-color: var(--gold);
          color: var(--accent-dark);
          box-shadow: var(--shadow-sm);
        }
        .ai-body {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          min-height: 0;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ai-empty {
          color: var(--text-muted);
          text-align: center;
          margin-top: 48px;
        }
        .ai-empty p {
          margin: 0 0 8px;
        }
        .ai-empty-sub {
          font-size: 13px;
          opacity: 0.8;
        }
        .ai-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          padding: 16px 0;
        }
        .ai-loading-dots {
          display: flex;
          gap: 6px;
        }
        .ai-loading-label {
          font-size: var(--text-sm);
          color: var(--text-muted);
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          opacity: 0.4;
          animation: bounce 1.2s infinite ease-in-out;
        }
        .dot:nth-child(2) {
          animation-delay: 0.15s;
        }
        .dot:nth-child(3) {
          animation-delay: 0.3s;
        }
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .ai-error {
          margin: 0;
          padding: 12px 16px;
          background: var(--accent-soft);
          border-radius: var(--radius);
          color: var(--accent-dark);
          font-size: 14px;
        }
        /* O texto é o protagonista: resposta em serifada de leitura. */
        .ai-result {
          font-family: var(--font-serif);
          font-size: 16px;
          line-height: 1.75;
          white-space: pre-wrap;
          padding: 4px 0;
        }
        .ai-result :global(strong) {
          font-weight: 600;
          color: var(--text);
        }
        .ai-result :global(em) {
          font-style: italic;
          color: var(--text-muted);
        }
        .ai-footer {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 14px 20px 18px;
          border-top: 1px solid var(--border-soft);
        }
        .ai-footer input,
        .ai-footer textarea {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          font-family: inherit;
          resize: none;
          min-height: 60px;
          line-height: 1.5;
          transition: border-color var(--transition), box-shadow var(--transition);
        }
        .ai-footer textarea:focus,
        .ai-footer input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .ai-footer button {
          width: 42px;
          height: 42px;
          border: none;
          background: linear-gradient(180deg, var(--accent), var(--accent-dark));
          color: #fff8ee;
          border-radius: 50%;
          font-size: 15px;
          flex-shrink: 0;
          box-shadow: var(--shadow-sm);
          transition: transform var(--transition), box-shadow var(--transition),
            filter var(--transition);
        }
        .ai-footer button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow);
          filter: brightness(1.06);
        }
        .ai-footer button:not(:disabled):active {
          transform: scale(0.94);
        }
        .ai-footer button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        /* Botão do microfone — diferente do botão de enviar (mais discreto). */
        .ai-mic {
          background: var(--surface-alt) !important;
          color: var(--text) !important;
          border: 1px solid var(--border) !important;
          font-size: 17px !important;
          flex-shrink: 0;
        }
        .ai-mic.listening {
          background: var(--accent-dark) !important;
          color: #fff8ee !important;
          border-color: var(--accent-dark) !important;
          animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
