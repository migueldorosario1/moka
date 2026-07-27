"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook de reconhecimento de voz (Speech-to-Text).
 *
 * Usa a API nativa do navegador (window.SpeechRecognition ou webkitSpeechRecognition).
 * GRÁTIS, sem API externa. Funciona em Chrome/Edge e Safari iOS 14.5+.
 *
 * Funcionalidades:
 *   - start(): começa a ouvir (abre o microfone)
 *   - stop(): para de ouvir
 *   - transcript: texto reconhecido (atualiza em tempo real)
 *   - listening: true enquanto está captando áudio
 *   - onResult(callback): chamado quando termina uma frase
 *
 * Observação: Safari/iOS pode pedir permissão de microfone na primeira vez.
 */
interface SpeechRecognitionHook {
  supported: boolean;
  listening: boolean;
  transcript: string;
  start: (lang?: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(onFinalResult?: (text: string) => void): SpeechRecognitionHook {
  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Ref pra sinalizar parada manual (do botão stop externo).
  const stoppedManuallyRef = useRef(false);
  // Acumula o texto FINAL já reconhecido (sobrevive a reinícios do iOS).
  const accumulatedRef = useRef("");

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const callbackRef = useRef(onFinalResult);
  callbackRef.current = onFinalResult;

  const start = useCallback((lang: string = "pt-BR") => {
    if (!supported) return;
    // Se já tá ouvindo, para primeiro.
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignora */ }
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    // Timeout de segurança: 2 minutos no máximo.
    const MAX_MS = 120_000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    // Flag: se o usuário parou manualmente, não reinicia.
    stoppedManuallyRef.current = false;
    // Zera o acumulado (nova sessão de fala).
    accumulatedRef.current = "";

    const startTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        stoppedManuallyRef.current = true;
        try { recognition.stop(); } catch { /* ignora */ }
      }, MAX_MS);
    };

    recognition.onstart = () => {
      setListening(true);
      startTimeout();
    };

    recognition.onresult = (event: any) => {
      startTimeout();
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript + " ";
        } else {
          interimTranscript += res[0].transcript;
        }
      }

      const sessionText = (finalTranscript + interimTranscript).trim();
      const fullText = accumulatedRef.current
        ? (accumulatedRef.current + " " + sessionText).trim()
        : sessionText;

      setTranscript(fullText);
      callbackRef.current?.(fullText);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stoppedManuallyRef.current = true;
        if (timeoutId) clearTimeout(timeoutId);
        setListening(false);
      }
    };

    recognition.onend = () => {
      // Guarda o acumulado único da sessão anterior ao reiniciar no iOS/Safari
      if (!stoppedManuallyRef.current && recognitionRef.current === recognition) {
        setTimeout(() => {
          if (!stoppedManuallyRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              /* ignora */
            }
          }
        }, 100);
        return;
      }
      if (timeoutId) clearTimeout(timeoutId);
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [supported]);

  const stop = useCallback(() => {
    stoppedManuallyRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignora */ }
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  // CLEANUP: quando o componente desmonta (ex: fechou o painel), PARA o microfone.
  // Sem isso, o recognition continua gravando mesmo após fechar o painel.
  useEffect(() => {
    return () => {
      stoppedManuallyRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignora */ }
      }
      recognitionRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    accumulatedRef.current = "";
  }, []);

  return { supported, listening, transcript, start, stop, reset };
}
