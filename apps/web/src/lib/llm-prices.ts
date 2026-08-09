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
  { rank: 1, modelo: "GLM-4 Flash (Z.ai)", presetId: "zai", inUsd: 0.07, outUsd: 0.07, nota: "o mais barato de todos" },
  { rank: 2, modelo: "DeepSeek V4 Flash", presetId: "deepseek", inUsd: 0.14, outUsd: 0.28, nota: "o econômico campeão ☕" },
  { rank: 3, modelo: "Llama 3.3 70B (Groq)", presetId: "groq", inUsd: 0.59, outUsd: 0.79, nota: "ultrarrápido (LPU)" },
  { rank: 4, modelo: "GPT-4o mini (OpenAI)", presetId: "openai", inUsd: 0.15, outUsd: 0.6 },
  { rank: 5, modelo: "Gemini 2.5 Flash", presetId: "gemini", inUsd: 0.3, outUsd: 2.5 },
  { rank: 6, modelo: "Mistral Small (Mistral AI)", presetId: "mistral", inUsd: 0.2, outUsd: 0.6, nota: "europeu, eficiente" },
  { rank: 7, modelo: "GLM 4.7 (Z.ai)", presetId: "zai", inUsd: 0.42, outUsd: 1.68, nota: "tiers por saída — valor médio" },
  { rank: 8, modelo: "Llama 3.3 70B (Groq)", presetId: "groq", inUsd: 0.59, outUsd: 0.79, nota: "ultrarrápido (LPU)" },
  { rank: 9, modelo: "Llama 3.3 70B (Together)", presetId: "together", inUsd: 0.59, outUsd: 0.79, nota: "open source" },
  { rank: 10, modelo: "Qwen3 Max (Alibaba)", presetId: "qwen", inUsd: 0.78, outUsd: 3.9 },
  { rank: 11, modelo: "Kimi K2.6 (Moonshot)", presetId: "kimi", inUsd: 0.95, outUsd: 4.0 },
  { rank: 12, modelo: "Claude Haiku 4.5 (Anthropic)", presetId: "anthropic", inUsd: 1.0, outUsd: 5.0 },
  { rank: 13, modelo: "Grok 3 mini (xAI)", presetId: "grok", inUsd: 0.3, outUsd: 0.5, nota: "tem voz neural + transcrição" },
  { rank: 14, modelo: "GPT-5 (OpenAI)", presetId: "openai", inUsd: 1.25, outUsd: 10.0 },
  { rank: 15, modelo: "GLM-5.1 (Z.ai)", presetId: "zai", inUsd: 1.4, outUsd: 4.4, nota: "nova geração" },
  { rank: 16, modelo: "DeepSeek V4 Pro", presetId: "deepseek", inUsd: 1.74, outUsd: 3.48, nota: "o forte da DeepSeek" },
  { rank: 17, modelo: "Kimi K3 (Moonshot)", presetId: "kimi", inUsd: 3.0, outUsd: 15.0, nota: "pesquisa profunda" },
  { rank: 18, modelo: "Claude Sonnet 4.6 (Anthropic)", presetId: "anthropic", inUsd: 3.0, outUsd: 15.0 },
  { rank: 19, modelo: "Claude Opus 4.7 (Anthropic)", presetId: "anthropic", inUsd: 5.0, outUsd: 25.0, nota: "o premium máximo" },
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
  { servico: "OpenAI Whisper (padrão)", porHora: 0.36 },
];

/** Formata US$ com 2-3 casas significativas. */
export function usd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}
