/**
 * Ponto de entrada do pacote @igot/ai-providers.
 *
 * Arquitetura multi-provedor (BYOK): o usuário escolhe o provedor e fornece
 * a própria chave. Os adapters falam com os provedores via `Transport`
 * (proxy no navegador para furar CORS; direto no servidor).
 *
 * Importe SEMPRE daqui — nunca direto de um provider específico.
 */

export type {
  AIProvider,
  CompleteOptions,
  CompleteResult,
  AIConfig,
  AdapterKind,
  ProviderPreset,
} from "./types";
export { AIProviderError } from "./types";

export type { Transport, TransportRequest, TransportResponse } from "./transport";
export {
  createProxyTransport,
  createDirectTransport,
  ProxyStreamError,
} from "./transport";

export { PRESETS, getPreset, getProvider } from "./registry";
