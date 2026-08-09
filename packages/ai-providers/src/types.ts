/**
 * Tipos e interface comum para provedores de IA.
 *
 * Toda chamada de IA no igot passa por `AIProvider`. Assim nunca acoplamos
 * lógica de negócio a um provedor específico — o usuário escolhe qual usar.
 */

/** Opções enviadas a uma chamada de completion. */
export interface CompleteOptions {
  /** Instrução de sistema (papel/identidade da IA). */
  systemPrompt?: string;
  /** Contexto relevante (ex.: trechos da obra recuperados via RAG). */
  context?: string;
  /** Criatividade: 0 = determinístico, 1 = criativo. */
  temperature?: number;
  /** Máximo de tokens na resposta. */
  maxTokens?: number;
  /** Modelo específico do provedor (sobrepõe o padrão). */
  model?: string;
}

/** Resultado enriquecido de uma chamada de completion. */
export interface CompleteResult {
  text: string;
  /** Quantos tokens o prompt consumiu (quando o provedor informar). */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Interface que todo provedor de LLM deve implementar. */
export interface AIProvider {
  /** Identificador estável (ex.: "zai", "deepseek"). */
  readonly id: string;
  /** Nome de exibição (ex.: "Z.ai (GLM)"). */
  readonly name: string;

  /** Completion simples: dado um prompt, devolve texto. */
  complete(prompt: string, opts?: CompleteOptions): Promise<CompleteResult>;

  /** Streaming opcional: yielded aos poucos (para UI reativa). */
  stream?(prompt: string, opts?: CompleteOptions): AsyncIterable<string>;
}

/** Erro padronizado vindo de um provedor. */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

// ─── Multi-provedor (BYOK) ──────────────────────────────────────────────

/**
 * Configuração de IA do usuário, guardada no navegador (localStorage).
 * O usuário escolhe o provedor e cola a própria chave — BYOK local.
 */
export interface AIConfig {
  /** Qual provedor (deve bater com `ProviderPreset.id`). */
  providerId: string;
  /** Chave de API do usuário (vem do localStorage, nunca do servidor). */
  apiKey: string;
  /** Override do modelo padrão do preset. */
  model?: string;
  /** Override do baseUrl (ex.: self-hosted). */
  baseUrl?: string;
}

/** Família de protocolo do adapter. */
export type AdapterKind = "openai" | "anthropic" | "gemini";

/**
 * Catálogo estático de provedores suportados.
 * Define baseUrl, modelo padrão e onde obter a chave.
 */
export interface ProviderPreset {
  id: string;
  name: string;
  /** Endpoint base (sem a rota específica, ex.: sem /chat/completions). */
  baseUrl: string;
  /** Modelo usado se o usuário não sobrescrever. */
  defaultModel: string;
  /** Qual adapter atende este provedor. */
  adapter: AdapterKind;
  /** Onde o usuário obtém uma chave. */
  keyUrl: string;
  /** Onde o usuário acompanha o uso/gasto da sua IA (dashboard de usage). */
  usageUrl?: string;
  /** Descrição curta pra exibir na UI. */
  description?: string;
}
