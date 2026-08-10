/**
 * Persistência da config de IA no navegador (localStorage) — CRIPTOGRAFADA.
 *
 * MULTI-ENTRADA: o usuário pode cadastrar VÁRIAS chaves, inclusive do MESMO
 * provedor (ex: Kimi K3 + Kimi K2 Thinking). Cada entrada tem:
 *   - id único (gerado automaticamente)
 *   - providerId (qual provedor: deepseek, openai, kimi, etc)
 *   - apiKey (criptografada)
 *   - model (qual modelo usar)
 *   - label (nome customizado opcional, ex: "Kimi K3 trabalho", "DeepSeek barato")
 *
 * Um `activeId` diz qual entrada está em uso no momento.
 *
 * As chaves são criptografadas (AES-GCM) antes de ir pro localStorage —
 * "guarda como segredo da própria mulher".
 */

import type { AIConfig } from "@igot/ai-providers";
import { encrypt, decrypt } from "./crypto";

const VAULT_KEY = "igot.aiVault"; // novo formato: lista de entradas
const LEGACY_KEY = "igot.aiConfig"; // formato antigo: chave única
const LANG_KEY = "igot.targetLang";

/** Uma entrada no cofre (uma chave + modelo de um provedor). */
export interface VaultEntry {
  /** ID único desta entrada (gerado). */
  id: string;
  /** Qual provedor (deepseek, openai, kimi, etc). */
  providerId: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Nome customizado opcional pra distinguishir múltiplas do mesmo provedor. */
  label?: string;
  savedAt: number;
}

/** Versão mascarada de uma chave pra exibir na UI (sk-***...abc). */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/** Gera um ID único curto pra uma nova entrada. */
function genId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Cache em memória ───────────────────────────────────────────────────

/** Lista de entradas descriptografadas. undefined = não carregou; null = vazio. */
let cachedEntries: VaultEntry[] | null | undefined = undefined;
/** ID da entrada ativa (em uso). */
let cachedActiveId: string | null = null;

// ─── Serialização (localStorage é string) ──────────────────────────────

interface SerializedVault {
  version: 2;
  entries: Array<{
    id: string;
    providerId: string;
    apiKeyEnc: string;
    model?: string;
    baseUrl?: string;
    label?: string;
    savedAt: number;
  }>;
  activeId: string | null;
}

// ─── Carregamento ──────────────────────────────────────────────────────

/** Inicializa o cache descriptografando do localStorage (async). */
async function ensureCache(): Promise<void> {
  if (cachedEntries !== undefined) return;
  if (typeof window === "undefined") {
    cachedEntries = null;
    cachedActiveId = null;
    return;
  }
  try {
    const raw = window.localStorage.getItem(VAULT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SerializedVault;
      if (parsed.version === 2) {
        // Formato novo: lista de entradas.
        const entries: VaultEntry[] = [];
        for (const e of parsed.entries ?? []) {
          try {
            const apiKey = await decrypt(e.apiKeyEnc);
            entries.push({
              id: e.id,
              providerId: e.providerId,
              apiKey,
              model: e.model,
              baseUrl: e.baseUrl,
              label: e.label,
              savedAt: e.savedAt,
            });
          } catch {
            // chave corrompida — pula
          }
        }
        cachedEntries = entries;
        cachedActiveId = parsed.activeId;
        return;
      }
      // versão 1 (mapa por providerId) — migra
      if ((parsed as unknown as { entries: Record<string, unknown> }).entries) {
        const v1 = parsed as unknown as {
          entries: Record<string, { apiKeyEnc?: string; model?: string; baseUrl?: string; savedAt: number }>;
          activeProviderId: string | null;
        };
        const entries: VaultEntry[] = [];
        for (const [pid, e] of Object.entries(v1.entries ?? {})) {
          if (e.apiKeyEnc) {
            try {
              const apiKey = await decrypt(e.apiKeyEnc);
              entries.push({
                id: genId(),
                providerId: pid,
                apiKey,
                model: e.model,
                baseUrl: e.baseUrl,
                savedAt: e.savedAt,
              });
            } catch { /* pula */ }
          }
        }
        const firstId = entries[0]?.id ?? null;
        cachedEntries = entries;
        cachedActiveId = v1.activeProviderId
          ? entries.find((e) => e.providerId === v1.activeProviderId)?.id ?? firstId
          : firstId;
        await persist();
        return;
      }
    }

    // Migração do formato legado (chave única em igot.aiConfig).
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as {
        providerId: string;
        apiKeyEnc?: string;
        apiKey?: string;
        model?: string;
        baseUrl?: string;
      };
      let apiKey = "";
      if (parsed.apiKeyEnc) apiKey = await decrypt(parsed.apiKeyEnc);
      else if (parsed.apiKey) apiKey = parsed.apiKey;
      if (parsed.providerId && apiKey) {
        const id = genId();
        cachedEntries = [{
          id,
          providerId: parsed.providerId,
          apiKey,
          model: parsed.model,
          baseUrl: parsed.baseUrl,
          savedAt: Date.now(),
        }];
        cachedActiveId = id;
        await persist();
        window.localStorage.removeItem(LEGACY_KEY);
        return;
      }
    }
    cachedEntries = null;
    cachedActiveId = null;
  } catch {
    cachedEntries = null;
    cachedActiveId = null;
  }
}

/** Grava o cofre no localStorage (criptografando todas as chaves). */
async function persist(): Promise<void> {
  if (typeof window === "undefined" || !cachedEntries) return;
  const serialized: SerializedVault = {
    version: 2,
    entries: await Promise.all(
      cachedEntries.map(async (e) => ({
        id: e.id,
        providerId: e.providerId,
        apiKeyEnc: await encrypt(e.apiKey),
        model: e.model,
        baseUrl: e.baseUrl,
        label: e.label,
        savedAt: e.savedAt,
      })),
    ),
    activeId: cachedActiveId,
  };
  window.localStorage.setItem(VAULT_KEY, JSON.stringify(serialized));
}

// ─── API pública ────────────────────────────────────────────────────────

/**
 * Lê a config ATIVA (da entrada em uso). Retorna null se nenhuma.
 * Assíncrona (descriptografa).
 */
export async function getConfig(): Promise<AIConfig | null> {
  await ensureCache();
  if (!cachedEntries || !cachedActiveId) return null;
  const entry = cachedEntries.find((e) => e.id === cachedActiveId);
  if (!entry) return null;
  return {
    providerId: entry.providerId,
    apiKey: entry.apiKey,
    model: entry.model,
    baseUrl: entry.baseUrl,
  };
}

/** Versão SÍNCRONA — retorna o cache da config ativa. */
export function getConfigSync(): AIConfig | null {
  if (!cachedEntries || !cachedActiveId) return null;
  const entry = cachedEntries.find((e) => e.id === cachedActiveId);
  if (!entry) return null;
  return {
    providerId: entry.providerId,
    apiKey: entry.apiKey,
    model: entry.model,
    baseUrl: entry.baseUrl,
  };
}

/** Carrega o cache (chamar no boot). */
export async function loadConfigCache(): Promise<void> {
  await ensureCache();
}

/**
 * Adiciona ou atualiza uma entrada no cofre.
 * Se `entryId` for passado, atualiza aquela entrada; senão cria uma nova.
 * Se não há ativa, esta vira a ativa. NÃO troca a ativa se já existe uma.
 */
export async function setConfig(
  config: AIConfig,
  options?: { entryId?: string; label?: string },
): Promise<string> {
  await ensureCache();
  if (typeof window === "undefined") return "";
  if (!cachedEntries) cachedEntries = [];

  const id = options?.entryId ?? genId();
  const existingIdx = cachedEntries.findIndex((e) => e.id === id);

  const entry: VaultEntry = {
    id,
    providerId: config.providerId,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    label: options?.label,
    savedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    cachedEntries[existingIdx] = entry;
  } else {
    cachedEntries.push(entry);
  }
  if (!cachedActiveId) cachedActiveId = id;
  await persist();
  return id;
}

/** Define qual entrada está ativa (em uso). */
export async function setActiveEntry(entryId: string): Promise<void> {
  await ensureCache();
  if (cachedEntries && cachedEntries.some((e) => e.id === entryId)) {
    cachedActiveId = entryId;
    await persist();
  }
}

/** Remove uma entrada do cofre. */
export async function removeEntry(entryId: string): Promise<void> {
  await ensureCache();
  if (!cachedEntries) return;
  cachedEntries = cachedEntries.filter((e) => e.id !== entryId);
  if (cachedActiveId === entryId) {
    cachedActiveId = cachedEntries.length > 0 ? cachedEntries[0].id : null;
  }
  await persist();
}

/** Atualiza apenas o label de uma entrada. */
export async function updateEntryLabel(entryId: string, label: string): Promise<void> {
  await ensureCache();
  if (!cachedEntries) return;
  const entry = cachedEntries.find((e) => e.id === entryId);
  if (entry) {
    entry.label = label || undefined;
    await persist();
  }
}

/** Remove TODAS as entradas (limpa o cofre). */
export function clearConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VAULT_KEY);
  window.localStorage.removeItem(LEGACY_KEY);
  cachedEntries = null;
  cachedActiveId = null;
}

/** Lista TODAS as entradas (com info pra UI: mascarada, modelo, ativo, label). */
export async function listAllEntries(): Promise<
  Array<{
    id: string;
    providerId: string;
    maskedKey: string;
    model?: string;
    label?: string;
    active: boolean;
  }>
> {
  await ensureCache();
  if (!cachedEntries) return [];
  return cachedEntries.map((e) => ({
    id: e.id,
    providerId: e.providerId,
    maskedKey: maskKey(e.apiKey),
    model: e.model,
    label: e.label,
    active: e.id === cachedActiveId,
  }));
}

/** Versão síncrona de listAllEntries. */
export function listAllEntriesSync(): Array<{
  id: string;
  providerId: string;
  maskedKey: string;
  model?: string;
  label?: string;
  active: boolean;
}> {
  if (!cachedEntries) return [];
  return cachedEntries.map((e) => ({
    id: e.id,
    providerId: e.providerId,
    maskedKey: maskKey(e.apiKey),
    model: e.model,
    label: e.label,
    active: e.id === cachedActiveId,
  }));
}

/**
 * Pega a config COMPLETA (chave real descriptografada) de uma entry específica.
 * Usado pra testar conexão de uma entry cadastrada sem precisar re-digitar a chave.
 */
export function getConfigById(entryId: string): AIConfig | null {
  if (!cachedEntries) return null;
  const entry = cachedEntries.find((e) => e.id === entryId);
  if (!entry) return null;
  return {
    providerId: entry.providerId,
    apiKey: entry.apiKey,
    model: entry.model,
    baseUrl: entry.baseUrl,
  };
}

/** True se há pelo menos uma entrada com ativa definida. */
export function hasConfig(): boolean {
  return cachedEntries != null
    && cachedEntries !== undefined
    && cachedEntries.length > 0
    && cachedActiveId != null;
}

/** Marca que precisa recarregar o cache. */
export function invalidateConfigCache(): void {
  cachedEntries = undefined;
  cachedActiveId = null;
}

// ─── Compatibilidade: manter funções antigas funcionando ────────────────
// (código que usa setActiveProvider/removeProviderKey/listAllProviders)
// — redirecionam pras novas funções pra não quebrar nada.

/** @deprecated use setActiveEntry */
export async function setActiveProvider(providerId: string): Promise<void> {
  await ensureCache();
  if (!cachedEntries) return;
  const entry = cachedEntries.find((e) => e.providerId === providerId);
  if (entry) {
    cachedActiveId = entry.id;
    await persist();
  }
}

/** @deprecated use removeEntry */
export async function removeProviderKey(providerId: string): Promise<void> {
  await ensureCache();
  if (!cachedEntries) return;
  const entry = cachedEntries.find((e) => e.providerId === providerId);
  if (entry) await removeEntry(entry.id);
}

/** @deprecated use listAllEntriesSync */
export function listAllProvidersSync(): Array<{
  providerId: string;
  maskedKey: string;
  model?: string;
  active: boolean;
}> {
  return listAllEntriesSync().map((e) => ({
    providerId: e.providerId,
    maskedKey: e.maskedKey,
    model: e.model,
    active: e.active,
  }));
}

// ─── Idioma ─────────────────────────────────────────────────────────────

const AUDIO_LANG_KEY = "igot.audioLang";

/** Idioma-alvo das respostas da IA (default pt-BR). */
export function getTargetLang(): string {
  if (typeof window === "undefined") return "pt-BR";
  return window.localStorage.getItem(LANG_KEY) ?? "pt-BR";
}

export function setTargetLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANG_KEY, lang);
}

/**
 * Idioma da leitura em voz alta (TTS). Valor especial "original" = lê
 * na língua original do livro (auto-detectada). Senão, lê no idioma
 * escolhido (ex: "pt-BR", "en").
 */
export function getAudioLang(): string {
  if (typeof window === "undefined") return "original";
  return window.localStorage.getItem(AUDIO_LANG_KEY) ?? "original";
}

export function setAudioLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIO_LANG_KEY, lang);
}

// ─── Voz TTS (qual voz neural usar — OpenAI/Grok) ──────────────────────
const TTS_VOICE_KEY = "moka.ttsVoice";

/** Vozes disponíveis por provedor (pesquisa 09/08/2026). */
export const TTS_VOICES_OPENAI = [
  { id: "nova", label: "Nova (feminina, clara)" },
  { id: "alloy", label: "Alloy (neutra)" },
  { id: "echo", label: "Echo (masculina, quente)" },
  { id: "fable", label: "Fable (narrativa)" },
  { id: "onyx", label: "Onyx (masculina, grave)" },
  { id: "shimmer", label: "Shimmer (feminina, brilhante)" },
];

export const TTS_VOICES_GROK = [
  { id: "ara", label: "Ara (quente, conversacional)" },
  { id: "eve", label: "Eve (energética)" },
  { id: "leo", label: "Leo (autoritária)" },
  { id: "rex", label: "Rex (profissional)" },
  { id: "sal", label: "Sal (neutra)" },
];

export function getTtsVoice(): string {
  if (typeof window === "undefined") return "nova";
  return window.localStorage.getItem(TTS_VOICE_KEY) ?? "nova";
}

export function setTtsVoice(voice: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TTS_VOICE_KEY, voice);
}

// ─── Seção de VÍDEO (fusão Moka Reader + Moka Video, V 2.0) ────────────
// Funções trazidas do app Moka Video: chave Whisper, servidor próprio de
// ingestão e auto-detecção do motor local (lê vídeos pelo IP do usuário).

const WHISPER_KEY = "mokavideo.whisperKey";
const INGEST_SERVER_KEY = "mokavideo.ingestServer";
const LOCAL_INGEST = "http://localhost:3100";

/** Salva a chave OpenAI usada SÓ pra Whisper (criptografada). */
export async function setWhisperKey(key: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!key) {
    window.localStorage.removeItem(WHISPER_KEY);
    return;
  }
  window.localStorage.setItem(WHISPER_KEY, await encrypt(key));
}

/** Lê a chave Whisper (descriptografada). Null se não configurada. */
export async function getWhisperKey(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WHISPER_KEY);
  if (!raw) return null;
  const key = await decrypt(raw);
  return key || null;
}

/** Versão mascarada da chave Whisper pra UI. */
export async function getWhisperKeyMasked(): Promise<string | null> {
  const key = await getWhisperKey();
  return key ? maskKey(key) : null;
}

export function getIngestServer(): string {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem(INGEST_SERVER_KEY) ?? "").replace(/\/$/, "");
}

export function setIngestServer(url: string): void {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/$/, "");
  if (clean) window.localStorage.setItem(INGEST_SERVER_KEY, clean);
  else window.localStorage.removeItem(INGEST_SERVER_KEY);
}

// ─── Modelo da IA da casa (V4, pedido do Miguel 2026-08-01) ─────────────
// A IA da casa roda no servidor (pontos) com default deepseek-v4-flash —
// o mais econômico. O usuário pode trocar nas ⚙️ (modelos mais fortes
// custam mais pontos — o app mostra o custo junto da opção). Vazio = default.
const MODELO_CASA_KEY = "moka.modeloCasa";

/** Modelo da casa escolhido pelo usuário ("" = default deepseek-v4-flash). */
export function getModeloCasa(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(MODELO_CASA_KEY) ?? "";
}

export function setModeloCasa(modelo: string): void {
  if (typeof window === "undefined") return;
  const clean = modelo.trim();
  if (clean) window.localStorage.setItem(MODELO_CASA_KEY, clean);
  else window.localStorage.removeItem(MODELO_CASA_KEY);
}

let probedLocal: boolean | null = null;

/** Sonda o localhost:3100 (motor Moka Video local). `force` ignora o cache. */
export async function probeLocalIngest(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!force && probedLocal !== null) return probedLocal;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${LOCAL_INGEST}/api/ingest`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as { ok?: boolean; server?: string };
    probedLocal = data?.ok === true && data?.server === "moka-video";
  } catch {
    probedLocal = false;
  }
  return probedLocal;
}

/**
 * Estado da permissão "Local Network Access" do navegador (Chrome 139+).
 * Sem ela, o Chrome bloqueia a ligação site→localhost.
 */
export async function getLocalNetPermission(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return "unknown";
  }
  try {
    const p = await navigator.permissions.query({
      name: "local-network-access" as PermissionName,
    });
    return p.state as "granted" | "denied" | "prompt";
  } catch {
    return "unknown";
  }
}

/**
 * Base de ingestão efetiva: servidor configurado nas ⚙️ > motor local
 * auto-detectado > o próprio site (caminho serverless, limitado).
 */
export function ingestBaseAuto(localDetected: boolean): string {
  const custom = getIngestServer();
  if (custom) return custom;
  if (localDetected) return LOCAL_INGEST;
  return "";
}
