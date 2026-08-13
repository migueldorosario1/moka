"use client";

/**
 * Diagnóstico de erros (pedido do Miguel, 13/08/2026).
 *
 * Objetivo: quando algo falha no app (tradução, explicação, voz, erro global),
 * montar um RELATÓRIO completo pra eu (Kimi) analisar — com a ação, o livro,
 * a página, o provedor/modelo, o status HTTP e a mensagem técnica.
 *
 * SEGURANÇA: NUNCA inclui a chave de API — só o providerId e o modelo.
 *
 * Como funciona:
 *  - `setDiagContext()` é chamado pelo Reader a cada mudança de livro/página,
 *    pra o erro já sair com o contexto certo.
 *  - `captureError()` é chamado pelo ai-client (erros de IA) e pelo capturador
 *    global (erros não tratados). Guarda em memória + localStorage (sobrevive
 *    a F5 / remontagem).
 *  - `copyDiagnostics()` copia o relatório pro clipboard (com fallback pra
 *    iPad/Safari antigo).
 */

import { getEntryForText, getTargetLang } from "./config";

/** Versão do app (atualizar quando subir de versão). */
export const APP_VERSION = "6.5";

/** Contexto "onde estou" — preenchido pelo Reader conforme navega. */
export interface DiagContextInfo {
  bookTitle?: string;
  bookAuthor?: string;
  bookFormat?: string;
  /** Rótulo da página/capítulo atual (ex.: "Cap. 12 · pág. 3" ou "pág. 50"). */
  pageLabel?: string;
}

/** Um erro capturado, com todo o contexto útil pra diagnóstico. */
export interface DiagEntry extends DiagContextInfo {
  /** Que ação falhou (ex.: "translate-page", "explain-page", "tts", "global"). */
  kind: string;
  /** Mensagem técnica do erro (a original, não a traduzida pra UI). */
  message: string;
  /** Status HTTP do provedor, se houver (401, 429, 500, ...). */
  status?: number;
  /** Detalhe do provedor (texto que veio no corpo do erro). */
  providerDetail?: string;
  providerId?: string;
  model?: string;
  /** Tamanho do texto que estava sendo processado (chars). */
  textLen?: number;
  stack?: string;
  ts: number;
  userAgent: string;
  url: string;
  targetLang: string;
}

const LAST_KEY = "moka.lastDiag";
/** Erros recentes (buffer circular pequeno — pra ver sequência, não só o último). */
const LOG_KEY = "moka.diagLog";
const LOG_MAX = 20;

let lastError: DiagEntry | null = null;
let context: DiagContextInfo = {};
let installed = false;

/** Atualiza o "onde estou" (Reader chama a cada mudança de livro/página). */
export function setDiagContext(ctx: DiagContextInfo): void {
  context = { ...context, ...ctx };
}

/** Lê o buffer de erros recentes do localStorage. */
function readLog(): DiagEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Captura um erro. Anexa automaticamente: contexto atual (livro/página),
 * provedor/modelo da config (SEM a chave), idioma-alvo, URL e userAgent.
 */
export function captureError(
  e: Omit<DiagEntry, "ts" | "userAgent" | "url" | "targetLang" | keyof DiagContextInfo> &
    Partial<DiagContextInfo>,
): void {
  if (typeof window === "undefined") return;
  // Provedor/modelo: da config de TEXTO (a usada pra traduzir/explicar).
  let providerId = e.providerId;
  let model = e.model;
  if (!providerId) {
    try {
      const cfg = getEntryForText();
      providerId = cfg?.providerId;
      model = model ?? cfg?.model;
    } catch {
      /* sem config — segue sem */
    }
  }
  const entry: DiagEntry = {
    ...context, // livro/página atuais
    ...e,
    providerId,
    model,
    ts: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    targetLang: getTargetLang(),
  };
  lastError = entry;
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(entry));
    const log = readLog();
    log.push(entry);
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_MAX)));
  } catch {
    /* localStorage cheio/indisponível — segue em memória */
  }
}

/** Último erro capturado (memória → localStorage). */
export function getLastError(): DiagEntry | null {
  if (lastError) return lastError;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as DiagEntry) : null;
  } catch {
    return null;
  }
}

/** Há um erro recente (últimos N minutos)? Pra decidir se mostra o botão. */
export function hasRecentError(maxAgeMs = 15 * 60 * 1000): boolean {
  const e = getLastError();
  return !!e && Date.now() - e.ts < maxAgeMs;
}

/** Monta o relatório em texto puro (pra copiar/colar). */
export function buildReport(): string {
  const e = getLastError();
  const L: string[] = [
    "===== MOKA — DIAGNÓSTICO =====",
    `App: Moka Reader v${APP_VERSION}`,
    `Relatório gerado: ${new Date().toLocaleString("pt-BR")}`,
    `Idioma-alvo: ${getTargetLang()}`,
    `URL: ${typeof window !== "undefined" ? window.location.href : "?"}`,
    `Dispositivo: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
    "",
  ];
  if (!e) {
    L.push("(nenhum erro capturado ainda nesta sessão)");
    return L.join("\n");
  }
  L.push("--- ÚLTIMO ERRO ---", `Quando: ${new Date(e.ts).toLocaleString("pt-BR")}`);
  L.push(`Ação: ${e.kind}`);
  L.push(`Erro: ${e.message}`);
  if (e.status) L.push(`HTTP status: ${e.status}`);
  if (e.providerDetail) L.push(`Detalhe do provedor: ${e.providerDetail}`);
  if (e.providerId) L.push(`Provedor: ${e.providerId}${e.model ? ` / ${e.model}` : ""}`);
  if (e.bookTitle) L.push(`Livro: ${e.bookTitle}${e.bookAuthor ? ` — ${e.bookAuthor}` : ""}${e.bookFormat ? ` [${e.bookFormat}]` : ""}`);
  if (e.pageLabel) L.push(`Página: ${e.pageLabel}`);
  if (e.textLen != null) L.push(`Tamanho do texto: ${e.textLen} caracteres`);
  if (e.stack) L.push("", "--- STACK ---", e.stack);

  const recent = readLog().slice(-5);
  if (recent.length > 1) {
    L.push("", "--- ÚLTIMOS ERROS (sequência) ---");
    for (const r of recent) {
      L.push(`• ${new Date(r.ts).toLocaleTimeString("pt-BR")} [${r.kind}] ${r.message}${r.status ? ` (HTTP ${r.status})` : ""}`);
    }
  }
  L.push("", "===== FIM =====");
  return L.join("\n");
}

/** Copia o relatório pro clipboard. Retorna true se conseguiu. */
export async function copyDiagnostics(): Promise<boolean> {
  const report = buildReport();
  try {
    await navigator.clipboard.writeText(report);
    return true;
  } catch {
    // Fallback pra iPad/Safari antigo (sem clipboard API ou sem permissão).
    try {
      const ta = document.createElement("textarea");
      ta.value = report;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, report.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Instala o capturador de erros GLOBAIS (1x). Pega o que não passa pelo ai-client. */
export function installGlobalErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => {
    captureError({
      kind: "global-error",
      message: ev.message || "Erro de script",
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
      providerDetail: `${ev.filename ?? ""}:${ev.lineno ?? ""}`,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason as unknown;
    captureError({
      kind: "unhandled-rejection",
      message: r instanceof Error ? r.message : String(r),
      stack: r instanceof Error ? r.stack : undefined,
    });
  });
}
