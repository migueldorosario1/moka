"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { recordUsage, estimateTtsCostUsd } from "@/lib/telemetry";
import { iaTtsCasa } from "@/lib/moka-conta";

/**
 * Divide um texto longo em frases menores pra leitura mais fluida.
 * O speechSynthesis fica "sincopado" (palavra por palavra) com textos
 * muito grandes. Quebrando em frases e enfileirando, a leitura fica
 * natural e contínua — como uma pessoa lendo.
 *
 * Quebra em: pontos, ponto de interrogação, exclamação, quebras de linha.
 * Mantém pontuação pra pausas naturais.
 */
function splitIntoSentences(text: string): string[] {
  // Divide mantendo o separador no final de cada pedaço.
  // Regex lookbehind não é suportado pelo SWC do Next.js — uso split normal.
  const normalized = text.replace(/\n+/g, ". ");
  // Divide por espaços após pontuação, sem lookbehind.
  const parts = normalized
    .split(/([.!?])\s+/)  // captura o separador
    .reduce<string[]>((acc, part, i) => {
      // Junta o separador de volta na frase anterior.
      if (i % 2 === 0 && part.trim()) acc.push(part);
      else if (i % 2 === 1 && acc.length > 0) acc[acc.length - 1] += part;
      return acc;
    }, [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Se alguma frase for MUITO longa (>200 chars), quebra por vírgulas.
  const result: string[] = [];
  for (const part of parts) {
    if (part.length > 200) {
      const sub = part.split(/[,;:]\s+/).map((s) => s.trim()).filter(Boolean);
      result.push(...sub);
    } else {
      result.push(part);
    }
  }
  return result.length > 0 ? result : [text];
}

/**
 * Hook de leitura em voz alta (Text-to-Speech).
 *
 * Usa a API nativa do navegador (window.speechSynthesis) — GRÁTIS, sem
 * nenhuma API externa. Funciona em iOS Safari, Chrome, Firefox.
 *
 * Funcionalidades:
 *   - speak(text): lê o texto em voz alta (na língua do livro)
 *   - pause() / resume(): pausa/continua
 *   - stop(): para a leitura
 *   - state: "idle" | "playing" | "paused"
 *
 * Detecção de idioma: o caller passa o lang (ex: "en", "pt-BR"). Se não
 * achar uma voz exata, cai pro prefixo (ex: "en" → primeira voz "en-*").
 */
export function useTTS() {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  // Áudio neural (TTS via IA) — guardamos num <audio> element.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // CACHE: texto → URL do áudio gerado. Evita regenerar o mesmo áudio.
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  // Carrega as vozes (assíncrono em alguns navegadores).
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  /** Encontra a melhor voz pro idioma dado. */
  const pickVoice = useCallback(
    (lang: string): SpeechSynthesisVoice | null => {
      if (voices.length === 0) return null;
      // 1. Match exato (ex: "pt-BR").
      let v = voices.find((vc) => vc.lang.toLowerCase() === lang.toLowerCase());
      // 2. Match pelo prefixo (ex: "en" → "en-US", "en-GB").
      if (!v) {
        const prefix = lang.split("-")[0].toLowerCase();
        v = voices.find((vc) => vc.lang.toLowerCase().startsWith(prefix));
      }
      return v ?? null;
    },
    [voices],
  );

  /** Lê um texto em voz alta. Para qualquer leitura anterior antes. */
  const speak = useCallback(
    (text: string, lang: string = "pt-BR") => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel(); // para qualquer leitura anterior

      // Divide em frases pra leitura mais fluida (sem efeito sincopado).
      const sentences = splitIntoSentences(text);
      const voice = pickVoice(lang);

      setState("playing");

      // Enfileira cada frase como uma utterance separada.
      // O speechSynthesis toca uma após a outra automaticamente.
      sentences.forEach((sentence, idx) => {
        const utter = new SpeechSynthesisUtterance(sentence);
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        } else {
          utter.lang = lang;
        }
        utter.rate = 1;     // velocidade normal
        utter.pitch = 1;    // tom normal
        // Só marca "idle" quando a ÚLTIMA frase terminar.
        if (idx === sentences.length - 1) {
          utter.onend = () => setState("idle");
          utter.onerror = () => setState("idle");
        }
        window.speechSynthesis.speak(utter);
      });
    },
    [supported, pickVoice],
  );

  /** Para a leitura (cancela tudo — não retoma). */
  const stop = useCallback(() => {
    // Para voz nativa.
    if (supported) window.speechSynthesis.cancel();
    // Para voz neural.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState("idle");
  }, [supported]);

  /** Pausa a leitura (pode retomar de onde parou). */
  const pause = useCallback(() => {
    if (supported && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState("paused");
  }, [supported]);

  /** Continua a leitura de onde pausou. */
  const resume = useCallback(() => {
    if (supported && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    setState("playing");
  }, [supported]);

  /**
   * Leitura neural via IA (OpenAI TTS).
   * Gera áudio MP3 natural e toca. USA CACHE — se o mesmo texto já foi
   * gerado antes, toca direto sem regenerar (instantâneo).
   * Se falhar, cai pra voz nativa automaticamente E reporta o que houve
   * ({ ok: false, status }) — assim o caller mostra o aviso amigável
   * na língua do usuário (ex.: chave inválida → 401).
   */
  const speakNeural = useCallback(
    async (
      text: string,
      lang: string,
      ttsConfig: {
        baseUrl?: string;
        apiKey?: string;
        model?: string;
        voice?: string;
        /** Identidade pra telemetria de gastos (a voz usa a chave do usuário). */
        providerId?: string;
        providerName?: string;
        /** Modo casa (revisor Google, 05/09): voz neural do gateway de pontos
         *  (OpenAI tts-1 no servidor) — sem BYOK, chave da casa não vem ao cliente. */
        casa?: boolean;
      },
    ): Promise<{ ok: boolean; status?: number }> => {
      if (!text.trim()) return { ok: false };

      // Chave do cache = hash simples do texto + voz.
      const cacheKey = `${ttsConfig.casa ? "casa" : ""}${ttsConfig.voice || "nova"}:${text.slice(0, 200)}`;

      let httpStatus: number | undefined;
      try {
        // Se já tem no cache, toca direto (instantâneo, sem loading).
        const cachedUrl = audioCacheRef.current.get(cacheKey);
        if (cachedUrl) {
          const audio = new Audio(cachedUrl);
          audioRef.current = audio;
          audio.onended = () => { setState("idle"); audioRef.current = null; };
          audio.onerror = () => { setState("idle"); audioRef.current = null; };
          setState("playing");
          await audio.play();
          return { ok: true };
        }

        // Gera áudio novo.
        setState("playing");
        const controller = new AbortController();
        abortRef.current = controller;

        const sentText = ttsConfig.casa ? text.slice(0, 1500) : text.slice(0, 4000);
        const ttsModel = ttsConfig.model || "tts-1";

        // Casa: gateway de pontos (JSON com base64). BYOK: /api/tts (blob MP3).
        let blob: Blob;
        if (ttsConfig.casa) {
          try {
            const d = await iaTtsCasa(sentText, ttsConfig.voice || "alloy");
            const bytes = Uint8Array.from(atob(d.audioBase64), (c) => c.charCodeAt(0));
            blob = new Blob([bytes], { type: "audio/mpeg" });
          } catch (e) {
            httpStatus = (e as { status?: number }).status ?? 502;
            if (ttsConfig.providerId) {
              void recordUsage({
                task: "tts",
                providerId: ttsConfig.providerId,
                providerName: ttsConfig.providerName || ttsConfig.providerId,
                model: ttsModel,
                promptText: sentText,
                costUsdOverride: 0,
                status: "error",
              }).catch(() => {});
            }
            throw e;
          }
        } else {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: sentText,
              voice: ttsConfig.voice || "nova",
              model: ttsModel,
              baseUrl: ttsConfig.baseUrl,
              apiKey: ttsConfig.apiKey,
            }),
            signal: controller.signal,
          });
          if (!response.ok) {
            httpStatus = response.status;
            // Telemetria: registra a tentativa falha (ex.: sem crédito).
            if (ttsConfig.providerId) {
              void recordUsage({
                task: "tts",
                providerId: ttsConfig.providerId,
                providerName: ttsConfig.providerName || ttsConfig.providerId,
                model: ttsModel,
                promptText: sentText,
                costUsdOverride: 0, // falhou — nada foi cobrado
                status: "error",
              }).catch(() => {});
            }
            throw new Error(`TTS falhou: ${response.status}`);
          }
          blob = await response.blob();
        }

        // Telemetria: TTS é cobrado por CARACTERE (não por token) —
        // registramos os dois: tokens estimados + custo real aproximado.
        if (ttsConfig.providerId) {
          void recordUsage({
            task: "tts",
            providerId: ttsConfig.providerId,
            providerName: ttsConfig.providerName || ttsConfig.providerId,
            model: ttsModel,
            promptText: sentText,
            costUsdOverride: estimateTtsCostUsd(sentText, ttsModel),
          }).catch(() => {});
        }

        const url = URL.createObjectURL(blob);
        // Guarda no cache pra não regenerar na próxima vez.
        audioCacheRef.current.set(cacheKey, url);

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { setState("idle"); audioRef.current = null; };
        audio.onerror = () => { setState("idle"); audioRef.current = null; };
        await audio.play();
        return { ok: true };
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState("idle");
          return { ok: false };
        }
        console.warn("TTS neural falhou, usando voz nativa:", err);
        speak(text, lang);
        return { ok: false, status: httpStatus };
      }
    },
    [stop, speak],
  );

  return { state, speak, speakNeural, pause, resume, stop, supported, voices };
}
