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

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </div>
  );
}
