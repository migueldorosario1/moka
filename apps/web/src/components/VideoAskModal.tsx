"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import type { VideoMeta, TranscriptSegment, AskRecord } from "@/lib/video/db";
import { askQuestion } from "@/lib/video/ai-client";
import { hasConfig } from "@/lib/config";

interface AskModalProps {
  meta: VideoMeta;
  segments: TranscriptSegment[];
  /** Perguntas anteriores (salvas no registro do vídeo). */
  asks: AskRecord[];
  onSaveAsk: (ask: AskRecord) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

const SUGGESTIONS = [
  "Quais são os pontos mais polêmicos do vídeo?",
  "O que foi dito sobre os valores/dinheiro citados?",
  "Que provas o vídeo apresenta pra tese dele?",
  "Qual a conclusão do vídeo?",
];

/**
 * ❓ Pergunte sobre o vídeo — o AskModal do Moka Reader, agora pra vídeo.
 *
 * A pergunta vai com os trechos MAIS RELEVANTES da transcrição (busca por
 * palavras-chave, em ordem cronológica) e a resposta vem com citações de
 * tempo [mm:ss]. Cada pergunta/resposta é salva automaticamente no registro
 * do vídeo (material produzido nunca se perde — regra do Miguel).
 */
export function VideoAskModal({
  meta,
  segments,
  asks,
  onSaveAsk,
  onClose,
  onOpenSettings,
}: AskModalProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  // Chip clicado — acende em dourado pulsante enquanto a IA trabalha
  // (pedido do Miguel 23/07: feedback visual forte de "pesquisando").
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Não fecha por acidente (regra da casa). ESC só se não estiver gerando.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asking]);

  const ask = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || asking) return;
      if (!hasConfig()) {
        onClose();
        onOpenSettings();
        return;
      }
      setAsking(true);
      setError(null);
      setAnswer("");
      setQuestion("");
      try {
        const final = await askQuestion(meta, segments, question, setAnswer);
        onSaveAsk({ q: question, a: final, at: Date.now() });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setAsking(false);
        setActiveChip(null);
      }
    },
    [asking, meta, segments, onSaveAsk, onClose, onOpenSettings],
  );

  return (
    <div className="ask-overlay" role="dialog" aria-modal="true" aria-label="Pergunte sobre o vídeo">
      <div className="ask-modal">
        <header className="ask-header">
          <h2>❓ Pergunte sobre o vídeo</h2>
          <button className="ask-close" onClick={onClose} aria-label="Fechar" disabled={asking}>
            ✕
          </button>
        </header>

        <div className="ask-body">
          <p className="ask-intro">
            Pergunte qualquer coisa sobre <em>{meta.title}</em> — eu pesquiso
            na transcrição e respondo citando o tempo [mm:ss] onde foi dito.
          </p>

          <div className="ask-chips">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className={`ask-chip ${asking && activeChip === s ? "working" : ""}`}
                onClick={() => { setActiveChip(s); void ask(s); }}
                disabled={asking}
              >
                {asking && activeChip === s ? "⏳ " : ""}{s}
              </button>
            ))}
          </div>

          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Escreva sua pergunta…"
              disabled={asking}
            />
            <button type="submit" className={`ask-send ${asking ? "working" : ""}`} disabled={asking || !question.trim()}>
              {asking ? "⏳ Pesquisando…" : "Perguntar"}
            </button>
          </form>

          {error && <p className="ask-error">⚠️ {error}</p>}

          {(answer || asking) && (
            <article className="reader-text ask-answer">
              {answer ? <Markdown text={answer} /> : (
                <p className="ask-thinking">🔍 Pesquisando na transcrição…</p>
              )}
              {asking && answer && <span className="ask-cursor">▌</span>}
            </article>
          )}

          {asks.length > 0 && !answer && !asking && (
            <div className="ask-history">
              <h3>Perguntas anteriores</h3>
              {asks.slice().reverse().map((a) => (
                <details key={a.at} className="ask-history-item">
                  <summary>{a.q}</summary>
                  <div className="reader-text">
                    <Markdown text={a.a} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .ask-overlay {
          position: fixed;
          inset: 0;
          background: rgba(30, 20, 12, 0.45);
          -webkit-backdrop-filter: blur(5px);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          overflow-y: auto;
        }
        .ask-modal {
          background: var(--bg);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 640px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
        }
        .ask-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
        }
        .ask-header h2 {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 20px;
          font-weight: 600;
        }
        .ask-close {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 17px;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }
        .ask-close:hover {
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .ask-body {
          padding: 18px 22px 24px;
          overflow-y: auto;
        }
        .ask-intro {
          margin: 0 0 14px;
          font-size: 14.5px;
          color: var(--text-muted);
          line-height: 1.55;
        }
        .ask-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
        }
        .ask-chip {
          padding: 8px 14px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: var(--radius-pill);
          font-size: 13.5px;
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition);
        }
        .ask-chip:hover:not(:disabled) {
          border-color: var(--gold);
          background: var(--accent-soft);
        }
        .ask-chip:disabled {
          opacity: 0.5;
        }
        .ask-chip.working {
          opacity: 1;
          background: linear-gradient(180deg, var(--gold), #e6b800);
          border-color: var(--gold);
          color: #3a2c00;
          font-weight: 700;
          cursor: wait;
          animation: askPulse 1.2s ease-in-out infinite;
        }
        @keyframes askPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 210, 0, 0.55); }
          50% { box-shadow: 0 0 0 9px rgba(255, 210, 0, 0); }
        }
        .ask-form {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
        }
        .ask-form input {
          flex: 1;
          min-width: 0;
          padding: 13px 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          background: var(--surface);
          color: var(--text);
          font-size: 16px;
          font-family: inherit;
        }
        .ask-form input:focus {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
        .ask-send {
          padding: 13px 22px;
          border: none;
          background: linear-gradient(180deg, var(--accent), var(--accent-dark));
          color: #fff8ee;
          border-radius: var(--radius-pill);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: var(--shadow-sm);
        }
        .ask-send:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .ask-send.working {
          opacity: 1;
          animation: askPulse 1.2s ease-in-out infinite;
        }
        .ask-error {
          padding: 10px 14px;
          background: var(--accent-soft);
          border: 1px solid var(--gold);
          border-radius: var(--radius);
          color: var(--accent-dark);
          font-size: 14px;
        }
        .ask-answer {
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius);
          padding: 18px 20px;
          margin-top: 8px;
        }
        .ask-thinking {
          color: var(--text-muted);
          font-size: 14.5px;
          margin: 0;
        }
        .ask-cursor {
          color: var(--accent);
          animation: ask-blink 1s steps(1) infinite;
        }
        @keyframes ask-blink {
          50% { opacity: 0; }
        }
        .ask-history {
          margin-top: 18px;
        }
        .ask-history h3 {
          font-family: var(--font-brand);
          font-size: 16px;
          margin: 0 0 10px;
        }
        .ask-history-item {
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          background: var(--surface);
          margin-bottom: 8px;
          padding: 10px 14px;
        }
        .ask-history-item summary {
          cursor: pointer;
          font-size: 14.5px;
          font-weight: 600;
          color: var(--accent-dark);
        }
        .ask-history-item .reader-text {
          margin-top: 10px;
          font-size: 15px;
        }
      `}</style>
    </div>
  );
}
