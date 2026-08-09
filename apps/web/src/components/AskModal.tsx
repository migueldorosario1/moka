"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ParsedBook } from "@igot/parser";
import { useI18n } from "./I18nProvider";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { askStream, type BookContext } from "@/lib/ai-client";

interface AskModalProps {
  book: ParsedBook;
  /** Fecha a janela. */
  onClose: () => void;
  /** Salva a pergunta+resposta nas anotações. */
  onSaveNote?: (entry: {
    kind: "ask";
    source: string;
    result: string;
    chapterId?: string;
  }) => void;
  /** Capítulo de origem (pra contexto da nota). */
  chapterId?: string;
}

/**
 * Janela "Pergunte qualquer coisa" (ícone microfone+caneta).
 *
 * Abre uma janelinha por cima do livro com uma introdução convidativa,
 * campo pra ESCREVER a pergunta e botão de microfone pra FALAR. A resposta
 * da IA aparece com streaming na própria janela (funciona até em fullscreen,
 * diferente do AIPanel que mora fora do elemento em tela cheia).
 *
 * Também traz um linkzinho de pesquisa web sobre o livro (abre em nova aba)
 * e chips de sugestão pra quem não sabe por onde começar.
 */
export function AskModal({ book, onClose, onSaveNote, chapterId }: AskModalProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  // Portal: renderiza no <body>, escapando de qualquer ancestral do Reader
  // com transform/backdrop-filter (containing block) que quebrava o overlay
  // fixed — o modal "quebrava o livro" (BUG reportado pelo Miguel no iPad).
  // Mesma cura do AuthModal/SettingsModal. Guarda SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Reconhecimento de voz: frase final preenche o campo (pode editar antes de enviar).
  const speech = useSpeechRecognition((text) => {
    setQuery(text);
  });

  const bookCtx: BookContext = {
    bookTitle: book.title,
    bookAuthor: book.author,
    bookLanguage: book.language,
  };

  // Linkzinho de pesquisa web sobre o livro (nova aba).
  const webSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${book.title}${book.author ? ` ${book.author}` : ""}`,
  )}`;

  // Fecha com ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rola pro fim conforme a resposta chega (streaming).
  useEffect(() => {
    if (result) {
      resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
    }
  }, [result]);

  const handleClose = () => {
    speech.stop();
    onClose();
  };

  const send = async (raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q || loading) return;
    speech.stop();
    setLoading(true);
    setResult("");
    setError(null);
    setLastQuestion(q);
    setQuery("");

    const res = await askStream(q, bookCtx, (full) => setResult(full));
    setLoading(false);
    if (res.ok && res.text) {
      setResult(res.text);
      // AUTO-SAVE: pergunta+resposta viram anotação (tipo "ask").
      onSaveNote?.({ kind: "ask", source: q, result: res.text, chapterId });
    } else {
      setResult(null);
      setError(res.error ?? "Erro.");
    }
  };

  // Chips de sugestão (preenchem E enviam — um toque só).
  const suggestions = [
    t("ask_suggestion_book"),
    t("ask_suggestion_author"),
    t("ask_suggestion_theme"),
  ];

  if (!mounted) return null;

  return createPortal(
    <div className="ask-overlay" onClick={handleClose}>
      <div className="ask-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("ask_modal_title")}>
        <header className="ask-header">
          <h2>{t("ask_modal_title")}</h2>
          <button onClick={handleClose} aria-label={t("close")} title={t("close")}>
            ✕
          </button>
        </header>

        <div className="ask-body" ref={resultRef}>
          {/* Introdução convidativa — some depois da primeira pergunta. */}
          {!result && !loading && !error && (
            <>
              <p className="ask-intro">{t("ask_intro", { title: book.title })}</p>
              <div className="ask-chips">
                {suggestions.map((s) => (
                  <button key={s} className="ask-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {lastQuestion && (
            <blockquote className="ask-question">{lastQuestion}</blockquote>
          )}

          {loading && !result && (
            <div className="ask-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}

          {error && <p className="ask-error">⚠️ {error}</p>}
          {result && <div className="ask-result">{result}</div>}
        </div>

        <footer className="ask-footer">
          {/* 🎤 Falar a pergunta */}
          {speech.supported && (
            <button
              type="button"
              className={`ask-mic ${speech.listening ? "listening" : ""}`}
              onClick={() => (speech.listening ? speech.stop() : speech.start(lang))}
              title={speech.listening ? t("ai_listening") : t("ai_speak_question")}
              aria-label={t("ai_speak_question")}
            >
              {speech.listening ? "🔴" : "🎤"}
            </button>
          )}
          <textarea
            rows={2}
            value={speech.listening ? speech.transcript : query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              speech.listening ? t("ai_listening") : t("ai_ask_placeholder", { title: truncate(book.title, 28) })
            }
            aria-label={t("ask_modal_title")}
          />
          <button
            className="ask-send"
            onClick={() => send()}
            disabled={loading || (!query.trim() && !speech.transcript)}
            aria-label={t("ask_send")}
            title={t("ask_send")}
          >
            ➤
          </button>
        </footer>

        {/* Linkzinho de pesquisa web sobre o livro */}
        <a
          className="ask-websearch"
          href={webSearchUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("ask_web_search")}
        </a>

        <style jsx>{`
          .ask-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .ask-modal {
            background: var(--bg);
            border-radius: 14px;
            width: 100%;
            max-width: 560px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          .ask-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 22px;
            border-bottom: 1px solid var(--border);
          }
          .ask-header h2 {
            margin: 0;
            font-size: 17px;
            font-weight: 700;
          }
          .ask-header button {
            border: none;
            background: var(--surface-alt);
            color: var(--text-muted);
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
          }
          .ask-body {
            padding: 18px 22px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-height: 120px;
          }
          .ask-intro {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.7;
            font-size: 14px;
          }
          .ask-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .ask-chip {
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            border-radius: 999px;
            padding: 7px 14px;
            font-size: 13px;
            cursor: pointer;
            transition: var(--transition);
          }
          .ask-chip:hover {
            border-color: var(--accent);
            background: var(--accent-soft);
            color: var(--accent);
          }
          .ask-question {
            margin: 0;
            padding: 8px 12px;
            background: var(--surface-alt);
            border-left: 3px solid var(--accent);
            border-radius: 6px;
            font-size: 13px;
            font-style: italic;
            white-space: pre-wrap;
          }
          .ask-loading {
            display: flex;
            gap: 6px;
            justify-content: center;
            padding: 12px 0;
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent);
            opacity: 0.4;
            animation: ask-bounce 1.2s infinite ease-in-out;
          }
          .dot:nth-child(2) { animation-delay: 0.15s; }
          .dot:nth-child(3) { animation-delay: 0.3s; }
          @keyframes ask-bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          .ask-error {
            margin: 0;
            padding: 12px;
            background: var(--accent-soft);
            border-radius: 8px;
            color: var(--accent);
            font-size: 14px;
          }
          .ask-result {
            font-size: 15px;
            line-height: 1.7;
            white-space: pre-wrap;
          }
          .ask-footer {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            padding: 12px 22px 6px;
            border-top: 1px solid var(--border);
          }
          .ask-footer textarea {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--surface);
            color: var(--text);
            font-size: 14px;
            font-family: inherit;
            resize: none;
            min-height: 48px;
            line-height: 1.5;
          }
          .ask-footer textarea:focus {
            outline: none;
            border-color: var(--accent);
          }
          .ask-mic {
            width: 40px;
            height: 40px;
            border: 1px solid var(--border);
            background: var(--surface-alt);
            color: var(--text);
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            flex-shrink: 0;
          }
          .ask-mic.listening {
            background: #e74c3c;
            color: white;
            border-color: #e74c3c;
            animation: ask-pulse 1.2s infinite;
          }
          @keyframes ask-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          .ask-send {
            width: 40px;
            height: 40px;
            border: none;
            background: var(--accent);
            color: white;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            flex-shrink: 0;
          }
          .ask-send:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
          .ask-websearch {
            display: block;
            text-align: center;
            padding: 8px 22px 14px;
            font-size: 12px;
            color: var(--text-muted);
            text-decoration: none;
          }
          .ask-websearch:hover {
            color: var(--accent);
            text-decoration: underline;
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
