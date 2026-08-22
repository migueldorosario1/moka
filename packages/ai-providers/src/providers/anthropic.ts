/**
 * Adapter do provedor Anthropic (Claude).
 *
 * Diferente dos OpenAI-compatible, a Anthropic usa um formato próprio:
 *
 *   POST {baseUrl}/messages
 *   x-api-key: <apiKey>
 *   anthropic-version: 2023-06-01
 *   { model, max_tokens (obrigatório), system?, messages: [{role, content}] }
 *
 * - `system` vai num campo separado (não como mensagem de role "system").
 * - `max_tokens` é OBRIGATÓRIO (usamos 1024 como default sensato).
 * - Resposta: { content: [{type:"text", text}], usage: {...} }
 */

import type {
  AIProvider,
  CompleteOptions,
  CompleteResult,
} from "../types";
import { AIProviderError } from "../types";
import type { Transport } from "../transport";

export interface AnthropicConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message: string; type?: string };
}

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly name: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly transport: Transport;

  constructor(config: AnthropicConfig, transport: Transport) {
    if (!config.apiKey) {
      throw new AIProviderError(
        "Chave de API da Anthropic ausente.",
        "anthropic",
      );
    }
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

    // Contexto é anexado ao prompt do usuário (a Anthropic não tem turno
    // de contexto; o campo system é pra instrução de papel/comportamento).
    const userContent = opts.context
      ? `${prompt}\n\n---\n[CONTEXTO DE REFERÊNCIA]\n${opts.context}`
      : prompt;

    const messages: AnthropicMessage[] = [{ role: "user", content: userContent }];

    const { status, body } = await this.transport.request(
      `${this.baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
          messages,
          temperature: opts.temperature ?? 0.3,
        }),
      },
    );

    if (status >= 400) {
      const errBody = body as AnthropicResponse | undefined;
      const detail = errBody?.error?.message ?? "";
      throw new AIProviderError(
        `Anthropic respondeu ${status}${detail ? `: ${detail}` : ""}`,
        this.id,
        status,
      );
    }

    const data = body as AnthropicResponse;
    if (data.error) {
      throw new AIProviderError(
        `Anthropic retornou erro: ${data.error.message}`,
        this.id,
      );
    }

    // Concatena todos os blocos de texto (pode haver vários).
    const text =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim() ?? "";

    return {
      text,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens:
              (data.usage.input_tokens ?? 0) +
              (data.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  /**
   * Streaming Anthropic: SSE com events `content_block_delta` (delta.text).
   * Outros event types (message_start, message_stop, etc.) são ignorados.
   */
  async *stream(
    prompt: string,
    opts: CompleteOptions = {},
  ): AsyncIterable<string> {
    if (!this.transport.stream) {
      const result = await this.complete(prompt, opts);
      yield result.text;
      return;
    }

    const model = opts.model ?? this.defaultModel;
    const userContent = opts.context
      ? `${prompt}\n\n---\n[CONTEXTO DE REFERÊNCIA]\n${opts.context}`
      : prompt;
    const messages: AnthropicMessage[] = [{ role: "user", content: userContent }];

    const res = await this.transport.stream(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
        messages,
        temperature: opts.temperature ?? 0.3,
        stream: true,
      }),
    });

    if (!res.body) throw new AIProviderError("Stream sem body.", this.id);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim()) as {
              type?: string;
              delta?: { text?: string; type?: string };
              error?: { message?: string };
            };
            if (parsed.error) {
              throw new AIProviderError(parsed.error.message ?? "erro", this.id);
            }
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (err) {
            if (err instanceof AIProviderError) throw err;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
