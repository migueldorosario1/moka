/**
 * Adapter genérico para provedores compatíveis com a API da OpenAI.
 *
 * Serve para: Z.ai (GLM), OpenAI, DeepSeek, Kimi (Moonshot), Qwen (DashScope
 * em modo compatível). Todos seguem o mesmo contrato:
 *
 *   POST {baseUrl}/chat/completions
 *   Authorization: Bearer <apiKey>
 *   { model, messages: [{role, content}], temperature, max_tokens }
 *
 * As diferenças (endpoint base, modelo padrão) vêm no `OpenAICompatibleConfig`.
 * A requisição em si roteia por `transport` — no navegador, via proxy.
 */

import type {
  AIProvider,
  CompleteOptions,
  CompleteResult,
} from "../types";
import { AIProviderError } from "../types";
import type { Transport } from "../transport";

/**
 * Detecta se um modelo é de "raciocínio" (reasoning model) que NÃO aceita
 * o parâmetro `temperature` (ou só aceita temperature: 1).
 *
 * Exemplos: Kimi K3, DeepSeek-R1, DeepSeek-Reasoner, o1, o3, Qwen-QwQ.
 * Esses modelos ignoram temperature ou retornam erro 400 se enviada.
 */
export function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("kimi-k3") ||
    m.includes("deepseek-r") ||    // deepseek-reasoner, deepseek-r1
    m.includes("reasoner") ||
    m.includes("/o1") ||
    m.includes("o1-") ||
    m.includes("/o3") ||
    m.includes("o3-") ||
    m.includes("qwq") ||
    m.includes("thinking")
  );
}

/**
 * Detecta modelos OpenAI da "nova geração" (gpt-5*, o1, o3, o4*) que mudaram
 * o contrato da API:
 *   - NÃO aceitam `max_tokens` — exigem `max_completion_tokens`
 *     (erro 400: "Unsupported parameter: 'max_tokens'");
 *   - NÃO aceitam `temperature` customizada (só o default 1).
 *
 * A detecção é por NOME de modelo (não por provedor), porque este adapter
 * serve vários provedores compatíveis (Z.ai, DeepSeek...) que seguem o
 * contrato antigo e não podem receber `max_completion_tokens`.
 */
export function isNewOpenAiModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("gpt-5") ||
    m.startsWith("o1") || m.includes("/o1") || m.includes("o1-") ||
    m.startsWith("o3") || m.includes("/o3") || m.includes("o3-") ||
    m.startsWith("o4") || m.includes("/o4") || m.includes("o4-")
  );
}

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message: string; code?: string | number };
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly transport: Transport;

  constructor(config: OpenAICompatibleConfig, transport: Transport) {
    if (!config.apiKey) {
      throw new AIProviderError(
        `Chave de API ausente para o provedor "${config.name}".`,
        config.id,
      );
    }
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.transport = transport;
  }

  async complete(
    prompt: string,
    opts: CompleteOptions = {},
  ): Promise<CompleteResult> {
    const model = opts.model ?? this.defaultModel;
    const messages = this.buildMessages(prompt, opts);
    const newOpenAi = isNewOpenAiModel(model);

    const { status, body } = await this.transport.request(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          // Modelos de raciocínio (Kimi K3, DeepSeek-R1, o1...) e a família
          // GPT-5 não aceitam temperature — mandar causa erro 400. Omitimos.
          ...(!isReasoningModel(model) && !newOpenAi && {
            temperature: opts.temperature ?? 0.3,
          }),
          // GPT-5/o-series exigem max_completion_tokens (max_tokens → 400).
          ...(opts.maxTokens
            ? newOpenAi
              ? { max_completion_tokens: opts.maxTokens }
              : { max_tokens: opts.maxTokens }
            : {}),
        }),
      },
    );

    if (status >= 400) {
      const errBody = body as ChatResponse | undefined;
      const detail = errBody?.error?.message ?? "";
      throw new AIProviderError(
        `${this.name} respondeu ${status}${detail ? `: ${detail}` : ""}`,
        this.id,
        status,
      );
    }

    const data = body as ChatResponse;
    if (data.error) {
      throw new AIProviderError(
        `${this.name} retornou erro: ${data.error.message}`,
        this.id,
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;
    if (usage && opts.onUsage) {
      try {
        opts.onUsage(usage);
      } catch {
        /* telemetria nunca quebra o fluxo */
      }
    }
    return { text, usage };
  }

  /**
   * Streaming: yields do texto aos poucos (token a token).
   *
   * O provedor envia SSE (Server-Sent Events): linhas `data: {json}` terminadas
   * por `\n\n`. Cada JSON tem `choices[0].delta.content` com o pedaço do texto.
   * Última linha é `data: [DONE]`.
   */
  async *stream(
    prompt: string,
    opts: CompleteOptions = {},
  ): AsyncIterable<string> {
    if (!this.transport.stream) {
      // Sem suporte a stream no transport — cai pro complete e devolve tudo.
      const result = await this.complete(prompt, opts);
      yield result.text;
      return;
    }

    const model = opts.model ?? this.defaultModel;
    const messages = this.buildMessages(prompt, opts);
    const newOpenAi = isNewOpenAiModel(model);

    const baseBody = {
      model,
      messages,
      // Modelos de raciocínio e a família GPT-5 não aceitam temperature.
      ...(!isReasoningModel(model) && !newOpenAi && {
        temperature: opts.temperature ?? 0.3,
      }),
      // GPT-5/o-series exigem max_completion_tokens (max_tokens → 400).
      ...(opts.maxTokens
        ? newOpenAi
          ? { max_completion_tokens: opts.maxTokens }
          : { max_tokens: opts.maxTokens }
        : {}),
      stream: true, // habilita SSE
    };
    const streamInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    };

    // Confiabilidade primeiro (incidente 22/08: `stream_options` derrubou a
    // tradução em provedor que rejeita o campo): o pedido vai SEM
    // stream_options, exatamente como o formato pré-telemetria que ficou
    // provado em produção. Se o provedor ainda assim informar o consumo no
    // chunk final, o parser SSE mais abaixo captura — senão a telemetria
    // usa estimativa marcada como tal.
    const res: Response = await this.transport.stream(
      `${this.baseUrl}/chat/completions`,
      {
        ...streamInit,
        body: JSON.stringify(baseBody),
      },
    );

    if (!res.body) throw new AIProviderError("Stream sem body.", this.id);

    // Lê o stream SSE linha a linha.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Guarda o usage quando o provedor informa (chunk final).
    let streamUsage: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Processa linhas completas (terminadas por \n).
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // última linha incompleta fica no buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            emitStreamUsage();
            return;
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
              error?: { message?: string };
            };
            if (parsed.error) {
              throw new AIProviderError(
                `${this.name} erro: ${parsed.error.message}`,
                this.id,
              );
            }
            // O usage chega no chunk final (antes do [DONE]).
            if (parsed.usage) streamUsage = parsed.usage;
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) yield chunk;
          } catch (err) {
            // JSON parcial/inválido num chunk — ignora silenciosamente.
            if (err instanceof AIProviderError) throw err;
          }
        }
      }
      // Stream terminou sem [DONE] — emite o usage mesmo assim.
      emitStreamUsage();
    } finally {
      reader.releaseLock();
    }

    /** Entrega o consumo capturado à telemetria (uma única vez). */
    function emitStreamUsage() {
      if (streamUsage && opts.onUsage) {
        try {
          opts.onUsage({
            promptTokens: streamUsage.prompt_tokens,
            completionTokens: streamUsage.completion_tokens,
            totalTokens: streamUsage.total_tokens,
          });
        } catch {
          /* telemetria nunca quebra o fluxo */
        }
        streamUsage = null;
      }
    }
  }

  /** Monta as mensagens no formato chat. Contexto é anexado ao turno do usuário. */
  private buildMessages(prompt: string, opts: CompleteOptions): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    const userContent = opts.context
      ? `${prompt}\n\n---\n[CONTEXTO DE REFERÊNCIA]\n${opts.context}`
      : prompt;
    messages.push({ role: "user", content: userContent });
    return messages;
  }
}
