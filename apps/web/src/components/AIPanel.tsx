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
  const [panelSize, setPanelSize] = useState<"small" | "half" | "full">("small");
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
    <aside className={`ai-panel ai-size-${panelSize}`}>
      <header className="ai-header">
        <span className="ai-brand">
          <CafezinhoLogo size={22} opacity={0.9} />
          <span className="ai-title">{action ? title : t("ai_assistant")}</span>
        </span>
        <div className="ai-header-actions">
          {/* Botões de tamanho do painel: ▫ menor, ▫ meio, ⛶ tela cheia */}
          <div className="ai-size-btns">
            <button
              className={`ai-size-btn ${panelSize === "small" ? "active" : ""}`}
              onClick={() => setPanelSize("small")}
              title={t("ai_size_small")}
              aria-label={t("ai_size_small")}
            >▫</button>
            <button
              className={`ai-size-btn ${panelSize === "half" ? "active" : ""}`}
              onClick={() => setPanelSize("half")}
              title={t("ai_size_half")}
              aria-label={t("ai_size_half")}
            >▭</button>
            <button
              className={`ai-size-btn ${panelSize === "full" ? "active" : ""}`}
              onClick={() => setPanelSize("full")}
              title={t("ai_size_full")}
              aria-label={t("ai_size_full")}
            >⛶</button>
          </div>
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

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
