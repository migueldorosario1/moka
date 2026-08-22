/**
 * Telemetria de consumo de IA (pedido do Miguel, 2026-08-22).
 *
 * Registra TODA despesa de IA do usuário: cada tradução, explicação,
 * pergunta, resumo, TTS e análise de vídeo vira uma linha num banco local
 * (IndexedDB), com tokens consumidos + custo estimado em dólar. Assim a
 * pessoa vê, na página /telemetria, quanto está gastando — por IA, por
 * modelo e por tarefa.
 *
 * Princípios:
 *   - LOCAL-FIRST: nada sai do dispositivo (igual às chaves). O banco é um
 *     IndexedDB PRÓPRIO ("moka_telemetry"), separado do banco de leitura.
 *   - NUNCA QUEBRA O APP: toda função é à prova de falha (try/catch). Se o
 *     banco falhar, a ação de IA continua normalmente — só não é anotada.
 *   - HONESTO: quando o provedor NÃO informa os tokens (alguns streams),
 *     estimamos pelo tamanho do texto e marcamos `usageEstimated: true`.
 */

import type { UsageInfo } from "@igot/ai-providers";
import { LLM_PRICES, fetchLlmPrices, type LlmPrice } from "./llm-prices";

// ─── Banco (IndexedDB próprio) ────────────────────────────────────────────

const DB_NAME = "moka_telemetry";
const DB_VERSION = 1;
const STORE = "records";

/** Uma linha do ledger de gastos. */
export interface TelemetryRecord {
  id: string;
  /** Epoch ms em que a tarefa aconteceu. */
  ts: number;
  /** Chave da tarefa (ex.: "translate", "translate-page", "ask", "tts"). */
  task: string;
  /** Qual provedor (id do preset: zai, openai, deepseek...). */
  providerId: string;
  /** Nome de exibição do provedor (ex.: "OpenAI"). */
  providerName: string;
  /** Modelo usado (ex.: "gpt-4o-mini"). Vazio = default do provedor. */
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** true quando os tokens foram ESTIMADOS (provedor não informou). */
  usageEstimated: boolean;
  /** Custo estimado em dólar (calculado pela tabela de preços). */
  costUsd: number;
  /** "ok" = tarefa concluída; "error" = falhou (ex.: sem crédito). */
  status: "ok" | "error";
  /** Nota opcional (ex.: aviso de limite ultrapassado). */
  note?: string;
}

function openTelemetryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB não disponível."));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timeout ao abrir telemetria (3s)."));
      }
    }, 3000);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_ts", "ts");
        store.createIndex("by_task", "task");
        store.createIndex("by_provider", "providerId");
      }
    };
    req.onsuccess = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      }
    };
    req.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(req.error ?? new Error("Erro ao abrir telemetria."));
      }
    };
  });
}

/** Grava um registro (silencioso em caso de erro). */
async function putRecord(record: TelemetryRecord): Promise<void> {
  try {
    const db = await openTelemetryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao gravar."));
    });
    db.close();
  } catch {
    /* telemetria nunca quebra o app */
  }
}

/** Lista todos os registros (mais recentes primeiro). */
export async function listRecords(): Promise<TelemetryRecord[]> {
  try {
    const db = await openTelemetryDB();
    const rows = await new Promise<TelemetryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as TelemetryRecord[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error("Erro ao ler."));
    });
    db.close();
    rows.sort((a, b) => b.ts - a.ts);
    return rows;
  } catch {
    return [];
  }
}

/** Apaga TUDO (botão "limpar histórico" da /telemetria). */
export async function clearRecords(): Promise<void> {
  try {
    const db = await openTelemetryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao limpar."));
    });
    db.close();
  } catch {
    /* ignora */
  }
}

// ─── Preferências do usuário ──────────────────────────────────────────────

/**
 * Como o usuário quer ser avisado do consumo:
 *   - "always" → pop-up após toda tarefa que usa IA;
 *   - "above"  → pop-up só quando passar de `popupThreshold` tokens;
 *   - "off"    → nunca (a pessoa clicou em "não quero mais ver isso").
 */
export type PopupMode = "always" | "above" | "off";

export interface TelemetryPrefs {
  popupMode: PopupMode;
  /** Limiar do modo "above" (tokens). Default 500. */
  popupThreshold: number;
  /** Trava de tokens POR TAREFA (0 = sem trava). Default 0. */
  tokenCap: number;
}

const PREFS_KEY = "moka.telemetry.prefs";
const DEFAULT_PREFS: TelemetryPrefs = {
  popupMode: "above",
  popupThreshold: 500,
  tokenCap: 0,
};

export function getPrefs(): TelemetryPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<TelemetryPrefs>;
    return {
      popupMode: p.popupMode === "always" || p.popupMode === "off" ? p.popupMode : "above",
      popupThreshold: typeof p.popupThreshold === "number" && p.popupThreshold >= 0 ? p.popupThreshold : DEFAULT_PREFS.popupThreshold,
      tokenCap: typeof p.tokenCap === "number" && p.tokenCap >= 0 ? p.tokenCap : 0,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(prefs: TelemetryPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage cheio — ignora */
  }
}

// ─── Moedas (conversão aproximada, offline-first) ────────────────────────

/** Moeda suportada na /telemetria. `rate` = quantas unidades valem US$ 1. */
export interface Currency {
  code: string;
  symbol: string;
  name: string;
  rate: number;
}

/** Taxas APROXIMADAS (nov/2026) — a telemetria é uma estimativa de gasto,
 *  não uma fatura. Funciona offline; a página avisa que é aproximado. */
export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar", rate: 1 },
  { code: "BRL", symbol: "R$", name: "Real brasileiro", rate: 5.4 },
  { code: "EUR", symbol: "€", name: "Euro", rate: 0.92 },
  { code: "GBP", symbol: "£", name: "British Pound", rate: 0.79 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", rate: 150 },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", rate: 7.2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", rate: 1.36 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", rate: 1.5 },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", rate: 0.88 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", rate: 83 },
  { code: "KRW", symbol: "₩", name: "Korean Won", rate: 1350 },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", rate: 17 },
  { code: "ARS", symbol: "AR$", name: "Argentine Peso", rate: 950 },
];

const CURRENCY_KEY = "moka.telemetry.currency";

/** Moeda escolhida pelo usuário (default: tenta detectar pelo navegador). */
export function getCurrency(): Currency {
  let code = "";
  if (typeof window !== "undefined") {
    code = window.localStorage.getItem(CURRENCY_KEY) ?? "";
  }
  if (!code) {
    // Detecta pelo idioma/região do navegador (só na primeira vez).
    const region = (typeof navigator !== "undefined" ? navigator.language : "")
      .split("-")[1] ?? "";
    const byRegion: Record<string, string> = {
      BR: "BRL", US: "USD", PT: "EUR", DE: "EUR", FR: "EUR", IT: "EUR",
      ES: "EUR", NL: "EUR", GB: "GBP", JP: "JPY", CN: "CNY", CA: "CAD",
      AU: "AUD", CH: "CHF", IN: "INR", KR: "KRW", MX: "MXN", AR: "ARS",
    };
    code = byRegion[region.toUpperCase()] ?? "USD";
  }
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function setCurrency(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENCY_KEY, code);
}

/** Converte um valor em dólar pra moeda dada (aproximado). */
export function convertFromUsd(usdValue: number, currency: Currency): number {
  return usdValue * currency.rate;
}

/** Formata um valor na moeda dada, com casas adequadas ao tamanho. */
export function fmtMoney(value: number, currency: Currency): string {
  // Valores minúsculos (frações de centavo) precisam de mais casas.
  const abs = Math.abs(value);
  const decimals = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return `${currency.symbol} ${value.toFixed(decimals)}`;
}

// ─── Estimativa de tokens + custo ────────────────────────────────────────

/**
 * Estimativa de tokens a partir do tamanho do texto (quando o provedor não
 * informa). Regra prática: ~4 caracteres por token em alfabeto latino;
 * CJK rende ~1,5 caractere por token. Conservadora (pra cima).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK
      (cp >= 0x3040 && cp <= 0x30ff) || // kana
      (cp >= 0xac00 && cp <= 0xd7af)    // hangul
    ) {
      cjk++;
    }
  }
  const latin = text.length - cjk;
  return Math.ceil(latin / 4 + cjk / 1.5);
}

/** Normaliza nome de modelo pra comparação (minúsculo, sem pontuação). */
function normModel(m: string): string {
  return m.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cache dos preços dinâmicos (fetchLlmPrices já faz cache 24h). */
let pricesCache: LlmPrice[] | null = null;

/** Carrega a tabela de preços (dinâmica com fallback). */
async function getPrices(): Promise<LlmPrice[]> {
  if (pricesCache) return pricesCache;
  try {
    const r = await fetchLlmPrices();
    pricesCache = r.prices.length > 0 ? r.prices : LLM_PRICES;
  } catch {
    pricesCache = LLM_PRICES;
  }
  return pricesCache;
}

/**
 * Encontra a linha de preço que melhor casa com (providerId, model).
 * Estratégia: dentro do provedor, procura o modelo cujo nome mais se parece;
 * se nenhum casar, usa a opção MAIS BARATA do provedor (estimativa honesta
 * "a partir de"). Retorna null se o provedor não está na tabela.
 */
export async function findPrice(
  providerId: string,
  model: string,
): Promise<{ price: LlmPrice; exact: boolean } | null> {
  const prices = await getPrices();
  const sameProvider = prices.filter((p) => p.presetId === providerId);
  if (sameProvider.length === 0) return null;

  const target = normModel(model);
  if (target) {
    // Casa por substring nos dois sentidos (ex.: "gpt-4o-mini" ⊂ "GPT-4o mini (OpenAI)").
    let best: LlmPrice | null = null;
    let bestScore = 0;
    for (const p of sameProvider) {
      const cand = normModel(p.modelo);
      let score = 0;
      if (cand && target.includes(cand)) score = cand.length;
      else if (cand && cand.includes(target)) score = target.length;
      else {
        // tokens em comum (ex.: "glm" "4" "flash")
        const a = new Set(target.match(/[a-z0-9]+/g) ?? []);
        const b = cand.match(/[a-z0-9]+/g) ?? [];
        for (const tok of b) if (a.has(tok) && tok.length > 1) score += tok.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && bestScore >= 3) return { price: best, exact: true };
  }

  // Fallback: opção mais barata do provedor (pelo custo de entrada).
  const cheapest = [...sameProvider].sort((a, b) => a.inUsd - b.inUsd)[0];
  return { price: cheapest, exact: false };
}

/** Calcula o custo em dólar de um consumo de tokens. */
export async function computeCostUsd(
  providerId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  const found = await findPrice(providerId, model);
  if (!found) return 0;
  const { price } = found;
  return (promptTokens / 1_000_000) * price.inUsd +
    (completionTokens / 1_000_000) * price.outUsd;
}

// ─── TTS (cobrado por caractere, não por token) ─────────────────────────

/** US$ por 1M de caracteres, aproximado (tabelas oficiais, ago/2026). */
const TTS_PRICES_PER_M_CHARS: Record<string, number> = {
  "tts-1": 15,
  "tts-1-hd": 30,
  "gpt-4o-mini-tts": 12,
  "grok-2-tts": 10,
  "playai-tts": 5,
};

/** Custo estimado de uma síntese de voz (TTS) em dólar. */
export function estimateTtsCostUsd(text: string, model: string): number {
  const rate = TTS_PRICES_PER_M_CHARS[model] ?? TTS_PRICES_PER_M_CHARS["tts-1"];
  return (text.length / 1_000_000) * rate;
}

// ─── Evento pro pop-up (consumo em tempo real) ───────────────────────────

/** Detalhe do evento "moka:usage" que o <UsageToast> escuta. */
export interface UsageEventDetail {
  task: string;
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageEstimated: boolean;
  costUsd: number;
  status: "ok" | "error";
  /** Aviso extra (ex.: "passou da sua trava de tokens"). */
  warning?: string;
}

export const USAGE_EVENT = "moka:usage";

function emitUsage(detail: UsageEventDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<UsageEventDetail>(USAGE_EVENT, { detail }));
  } catch {
    /* ignora */
  }
}

/**
 * Registra o consumo de uma tarefa de IA. Este é o ÚNICO ponto de entrada:
 * chamado pelo ai-client (livros), video/ai-client (vídeos) e TTS.
 *
 * - Calcula tokens (reais ou estimados) + custo;
 * - grava no ledger local;
 * - e dispara o pop-up (se as preferências permitirem).
 */
export async function recordUsage(opts: {
  task: string;
  providerId: string;
  providerName: string;
  model?: string;
  /** Usage real informado pelo provedor (quando houver). */
  usage?: UsageInfo;
  /** Texto de ENTRADA (pra estimar prompt quando o provedor não informa). */
  promptText?: string;
  /** Texto de SAÍDA (pra estimar resposta quando o provedor não informa). */
  completionText?: string;
  status?: "ok" | "error";
  note?: string;
  /** Custo em dólar já calculado (ex.: TTS, cobrado por caractere). Se
   *  ausente, calculamos pela tabela de preços de LLM. */
  costUsdOverride?: number;
  /** true = grava no ledger SEM disparar o pop-up (chamadas internas,
   *  ex.: pedaços de map-reduce — só a chamada final deve avisar). */
  silent?: boolean;
}): Promise<TelemetryRecord> {
  const model = opts.model ?? "";
  const status = opts.status ?? "ok";

  // Tokens: reais do provedor; se ausentes, estima pelos textos.
  let promptTokens = opts.usage?.promptTokens ?? 0;
  let completionTokens = opts.usage?.completionTokens ?? 0;
  let usageEstimated = false;
  if (!promptTokens && opts.promptText) {
    promptTokens = estimateTokens(opts.promptText);
    usageEstimated = true;
  }
  if (!completionTokens && opts.completionText) {
    completionTokens = estimateTokens(opts.completionText);
    usageEstimated = true;
  }
  const totalTokens =
    opts.usage?.totalTokens || promptTokens + completionTokens;

  const costUsd = opts.costUsdOverride ?? await computeCostUsd(
    opts.providerId,
    model,
    promptTokens,
    completionTokens,
  );

  const record: TelemetryRecord = {
    id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    task: opts.task,
    providerId: opts.providerId,
    providerName: opts.providerName,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    usageEstimated,
    costUsd,
    status,
    note: opts.note,
  };

  void putRecord(record);

  // Pop-up: respeita o modo escolhido pelo usuário. `silent` pula o aviso
  // (chamadas internas como map-reduce — só a final deve avisar).
  try {
    if (opts.silent) return record;
    const prefs = getPrefs();
    const capExceeded = prefs.tokenCap > 0 && totalTokens > prefs.tokenCap;
    const shouldShow =
      prefs.popupMode === "always" ||
      (prefs.popupMode === "above" && totalTokens >= prefs.popupThreshold) ||
      status === "error" || // erro (ex.: sem crédito) sempre avisa
      capExceeded;
    if (shouldShow) {
      emitUsage({
        task: record.task,
        providerName: record.providerName,
        model: record.model,
        promptTokens,
        completionTokens,
        totalTokens,
        usageEstimated,
        costUsd,
        status,
        warning: capExceeded ? "cap-exceeded" : undefined,
      });
    }
  } catch {
    /* pop-up nunca quebra o app */
  }

  return record;
}

/**
 * Estimativa PRÉVIA de tokens de uma tarefa (antes de chamar a IA).
 * Usada pela trava de consumo: se a entrada já estoura o limite, o Moka
 * AVISA em vez de gastar (mas nunca trava o app).
 */
export function estimateTaskInputTokens(
  text: string,
  systemPrompt?: string,
  context?: string,
): number {
  return (
    estimateTokens(text) +
    estimateTokens(systemPrompt ?? "") +
    estimateTokens(context ?? "")
  );
}
