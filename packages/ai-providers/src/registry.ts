/**
 * Registro de provedores (catálogo + factory).
 *
 * O usuário escolhe um provedor pela UI; o `providerId` da config dele bate
 * com um `ProviderPreset.id` aqui. A factory `getProvider` instancia o
 * adapter certo, aplicando os overrides do usuário (modelo/baseUrl custom).
 */

import type { AIConfig, AIProvider, ProviderPreset } from "./types";
import { AIProviderError } from "./types";
import type { Transport } from "./transport";
import { OpenAICompatibleProvider } from "./providers/openaiCompatible";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";

/**
 * Catálogo dos provedores suportados.
 * Para adicionar um novo: basta incluir aqui (se for OpenAI-compatible)
 * ou criar um adapter dedicado (se o protocolo for diferente).
 */
export const PRESETS: ProviderPreset[] = [
  {
    id: "zai",
    name: "Z.ai (GLM)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4.6",
    adapter: "openai",
    keyUrl: "https://z.ai/",
    description: "Modelos GLM. Janela de contexto longa, multilíngue robusto.",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    adapter: "openai",
    keyUrl: "https://platform.openai.com/api-keys",
    description: "GPT-4o e família. Padrão de mercado.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    adapter: "openai",
    keyUrl: "https://platform.deepseek.com/api_keys",
    description: "Excelente custo-benefício e raciocínio.",
  },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    adapter: "openai",
    keyUrl: "https://api.together.ai/settings/api-keys",
    description: "Centena de modelos open-source (Llama, Qwen, DeepSeek). Preços baixos.",
  },
  {
    id: "kimi",
    name: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k3",
    adapter: "openai",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    description: "Kimi K3: modelo flagship 2.8T parâmetros, contexto de 1M tokens.",
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    adapter: "openai",
    keyUrl: "https://dashscope.console.aliyun.com/apiKey",
    description: "Multilíngue fortíssimo, ótimo em tradução.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5",
    adapter: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    description: "Modelos Claude (Haiku rápido, Sonnet equilibrado, Opus máximo). Forte em escrita e explicação.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    adapter: "gemini",
    keyUrl: "https://aistudio.google.com/app/apikey",
    description: "Modelos Gemini do Google. Janela de contexto enorme, multilíngue.",
  },
];

/** Retorna o preset pelo id, ou undefined. */
export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Instancia o adapter correto para a config do usuário.
 *
 * @param config  escolha do usuário (providerId + apiKey + overrides).
 * @param transport  como a requisição viaja (proxy no navegador, direto no server).
 * @throws AIProviderError se o providerId for desconhecido ou a chave ausente.
 */
export function getProvider(config: AIConfig, transport: Transport): AIProvider {
  const preset = getPreset(config.providerId);
  if (!preset) {
    throw new AIProviderError(
      `Provedor desconhecido: "${config.providerId}".`,
      config.providerId,
    );
  }

  // Override de baseUrl permite self-hosted / gateways próprios.
  const baseUrl = config.baseUrl ?? preset.baseUrl;
  const defaultModel = config.model ?? preset.defaultModel;
  const common = {
    id: preset.id,
    name: preset.name,
    baseUrl,
    apiKey: config.apiKey,
    defaultModel,
  };

  switch (preset.adapter) {
    case "openai":
      return new OpenAICompatibleProvider(common, transport);
    case "anthropic":
      return new AnthropicProvider(common, transport);
    case "gemini":
      return new GeminiProvider(common, transport);
    default:
      throw new AIProviderError(
        `Adapter não implementado: ${preset.adapter}`,
        preset.id,
      );
  }
}
