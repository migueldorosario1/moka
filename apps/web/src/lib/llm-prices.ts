/**
 * llm-prices — o Ranking de Preços das IAs (pedido do Miguel, 2026-08-05).
 *
 * Fonte: CEREBRO_NODE_CATALOGO_MODELOS_LLM (preços oficiais verificados em
 * jul/2026) + o registry de presets BYOK do app. A estimativa de custo por
 * tarefa usa volumes honestos: resumo de livro = 15k tokens in + 1k out;
 * tradução de livro inteiro = 120k in + 30k out.
 */

export interface LlmPrice {
  rank: number;
  modelo: string;
  presetId: string; // casa com o registry BYOK do app
  inUsd: number;    // $/1M tokens (entrada)
  outUsd: number;   // $/1M tokens (saída)
  /** ⏱️ Segundos estimados p/ traduzir 1 página de livro (≈ benchmark, 13/08). */
  velSeg?: number;
  nota?: string;
}

/** Custo estimado da tarefa em USD. */
export function custo(p: LlmPrice, kIn: number, kOut: number): number {
  return (kIn * p.inUsd + kOut * p.outUsd) / 1000;
}

/** Resumo de livro: 15k in + 1k out. */
export const custoResumo = (p: LlmPrice) => custo(p, 15, 1);
/** Tradução de livro inteiro: 120k in + 30k out. */
export const custoTraducao = (p: LlmPrice) => custo(p, 120, 30);

/** O ranking (do mais barato ao mais caro pra "resumir 1 livro").
 *  MESMO cânone do Aiatolah News (src/data/ranking.json, revalidado
 *  2026-08-05) — os dois sites mostram os mesmos preços. */
export const LLM_PRICES: LlmPrice[] = [
  { rank: 1, modelo: "GLM-4 Flash (Z.ai)", presetId: "zai", inUsd: 0.07, outUsd: 0.07, velSeg: 6, nota: "cheapest of all" },
  { rank: 2, modelo: "DeepSeek V4 Flash", presetId: "deepseek", inUsd: 0.14, outUsd: 0.28, velSeg: 10, nota: "best value ☕" },
  { rank: 3, modelo: "Llama 3.3 70B (Groq)", presetId: "groq", inUsd: 0.59, outUsd: 0.79, velSeg: 3, nota: "ultra fast (LPU)" },
  { rank: 4, modelo: "GPT-4o mini (OpenAI)", presetId: "openai", inUsd: 0.15, outUsd: 0.6, velSeg: 8 },
  { rank: 5, modelo: "Gemini 2.5 Flash", presetId: "gemini", inUsd: 0.3, outUsd: 2.5, velSeg: 7 },
  { rank: 6, modelo: "Mistral Small (Mistral AI)", presetId: "mistral", inUsd: 0.2, outUsd: 0.6, velSeg: 9, nota: "European, efficient" },
  { rank: 7, modelo: "GLM 4.7 (Z.ai)", presetId: "zai", inUsd: 0.42, outUsd: 1.68, velSeg: 12, nota: "output-tiered — mid value" },
  { rank: 8, modelo: "Llama 3.3 70B (Groq)", presetId: "groq", inUsd: 0.59, outUsd: 0.79, velSeg: 3, nota: "ultra fast (LPU)" },
  { rank: 9, modelo: "Llama 3.3 70B (Together)", presetId: "together", inUsd: 0.59, outUsd: 0.79, velSeg: 5, nota: "open source" },
  { rank: 10, modelo: "Qwen3 Max (Alibaba)", presetId: "qwen", inUsd: 0.78, outUsd: 3.9, velSeg: 15 },
  { rank: 11, modelo: "Kimi K2.6 (Moonshot)", presetId: "kimi", inUsd: 0.95, outUsd: 4.0, velSeg: 20 },
  { rank: 12, modelo: "Claude Haiku 4.5 (Anthropic)", presetId: "anthropic", inUsd: 1.0, outUsd: 5.0, velSeg: 12 },
  { rank: 13, modelo: "Grok 4.20 (xAI)", presetId: "grok", inUsd: 0.3, outUsd: 0.5, velSeg: 10, nota: "neural voice + transcription" },
  { rank: 14, modelo: "GPT-5 (OpenAI)", presetId: "openai", inUsd: 1.25, outUsd: 10.0, velSeg: 25 },
  { rank: 15, modelo: "GLM-5.1 (Z.ai)", presetId: "zai", inUsd: 1.4, outUsd: 4.4, velSeg: 15, nota: "new generation" },
  { rank: 16, modelo: "DeepSeek V4 Pro", presetId: "deepseek", inUsd: 1.74, outUsd: 3.48, velSeg: 40, nota: "DeepSeek flagship (thinking)" },
  { rank: 17, modelo: "Kimi K3 (Moonshot)", presetId: "kimi", inUsd: 3.0, outUsd: 15.0, velSeg: 60, nota: "deep research (thinking)" },
  { rank: 18, modelo: "Claude Sonnet 4.6 (Anthropic)", presetId: "anthropic", inUsd: 3.0, outUsd: 15.0, velSeg: 30 },
  { rank: 19, modelo: "Claude Opus 4.7 (Anthropic)", presetId: "anthropic", inUsd: 5.0, outUsd: 25.0, velSeg: 45, nota: "max premium" },
];

/** Vídeo é OUTRO sistema (pedido do Miguel): não é qualquer LLM —
 *  transcrição de áudio tem preço por MINUTO, não por token. */
export interface TranscricaoPreco {
  servico: string;
  porHora: number; // US$ por hora de áudio
}
export const TRANSCRICAO_PRECOS: TranscricaoPreco[] = [
  { servico: "Groq Whisper (turbo)", porHora: 0.042 },
  { servico: "Grok STT (xAI)", porHora: 0.30 },
  { servico: "OpenAI gpt-4o-mini-transcribe", porHora: 0.18 },
  { servico: "OpenAI Whisper (standard)", porHora: 0.36 },
];

/** Formata US$ com 2-3 casas significativas. */
export function usd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

// ═══ Preços DINÂMICOS (agente atualizador_precos_llm.py) ═══
//
// O ranking hardcoded (LLM_PRICES) é o FALLBACK — nunca deixa a página quebrar.
// O JSON dinâmico vem do agente (rodando diariamente na Tencent) e traz
// preços frescos. O Moka faz fetch com cache de 24h (localStorage); se a rede
// falhar ou o agente sair do ar, usa o fallback. (Pedido do Miguel, 09/08.)

/** URL do JSON canônico do agente. Servido via jsDelivr CDN (atualiza em
 *  minutos; raw.githubusercontent demora até 24h em cache). O agente commita
 *  automaticamente todo dia às 09:00 UTC (cron Tencent) no repo
 *  cafezinhomediagroup/data/. */
export const LLM_PRICES_DYNAMIC_URL =
  "https://cdn.jsdelivr.net/gh/migueldorosario1/cafezinhomediagroup@main/data/ranking_llm.json";

/** Versão dinâmica do preço (vem do JSON do agente). */
export interface LlmPriceDynamic {
  rank?: number;
  modelo: string;
  presetId: string;
  inUsd: number;
  outUsd: number;
  nota?: string;
}

/** Resultado do fetch dinâmico. */
export interface LlmPricesFetchResult {
  prices: LlmPrice[];        // sempre válido (dinâmico ou fallback)
  updated_at: string | null; // ISO date do agente, ou null se fallback
  usd_brl: number | null;
}

const CACHE_KEY = "moka.llmPricesCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Busca os preços de LLM (dinâmico com cache 24h, fallback hardcoded).
 * Chamar no client (useEffect). Nunca lança — sempre retorna algo usável.
 */
export async function fetchLlmPrices(): Promise<LlmPricesFetchResult> {
  // Sem URL configurada → só fallback (fase 1 até o Miguel publicar o endpoint).
  if (!LLM_PRICES_DYNAMIC_URL) {
    return { prices: LLM_PRICES, updated_at: null, usd_brl: null };
  }

  // Cache: se tem no localStorage e não expirou, usa.
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { at: number; data: LlmPricesFetchResult };
        if (Date.now() - cached.at < CACHE_TTL_MS) {
          return cached.data;
        }
      }
    } catch {
      // cache corrompido — ignora
    }
  }

  // Fetch do agente.
  try {
    const res = await fetch(LLM_PRICES_DYNAMIC_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Converte o formato do agente ({id, nome, preset_id, input_usd, output_usd})
    // pro formato do Moka ({modelo, presetId, inUsd, outUsd}).
    const prices: LlmPrice[] = (data.modelos || []).map((m: any, i: number) => ({
      rank: m.rank ?? i + 1,
      modelo: m.nome ?? m.id,
      presetId: m.preset_id ?? m.presetId ?? "",
      inUsd: Number(m.input_usd ?? m.inUsd ?? 0),
      outUsd: Number(m.output_usd ?? m.outUsd ?? 0),
      // ⏱️ Tempo estimado: do agente (vel_seg) ou mesclado do fallback (≈).
      velSeg: m.vel_seg ?? LLM_PRICES.find((f) => f.modelo === (m.nome ?? m.id) || f.presetId === (m.preset_id ?? m.presetId))?.velSeg,
      nota: m.tags?.join(", "),
    }));
    if (prices.length === 0) throw new Error("JSON vazio");

    // Reordena por custo de resumo (caso o agente não tenha mandado ordenado).
    prices.sort((a, b) => custoResumo(a) - custoResumo(b));
    prices.forEach((p, i) => (p.rank = i + 1));

    const result: LlmPricesFetchResult = {
      prices,
      updated_at: data.updated_at ?? null,
      usd_brl: data.usd_brl ?? null,
    };

    // Salva no cache.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: result }));
      } catch {
        // storage cheio — ignora
      }
    }
    return result;
  } catch (e) {
    // Rede falhou / JSON inválido → fallback hardcoded.
    console.warn("fetchLlmPrices: usando fallback hardcoded:", e);
    return { prices: LLM_PRICES, updated_at: null, usd_brl: null };
  }
}
