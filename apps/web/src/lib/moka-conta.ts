/**
 * moka-conta — a conta de pontos do usuário no app (V3, doc 15).
 *
 * Guarda email+senha da compra no localStorage e fala com a API de pontos
 * (Tencent): valida saldo, consulta licença do modo avançado e chama o
 * gateway /ia/completar (a IA da casa, que debita pontos no servidor).
 */

const KEY = "moka.pontos.conta";
// A API de pontos é alcançada via rewrite da Vercel (mesma origem) —
// o cliente nunca vê o endereço do backend (pedido do Miguel, 28/07).
export const API_PONTOS = "/api/pontos";

export interface ContaPontos {
  email: string;
  senha: string;
}

export function getConta(): ContaPontos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ContaPontos) : null;
  } catch {
    return null;
  }
}

export function setConta(c: ContaPontos | null): void {
  if (typeof window === "undefined") return;
  if (c) window.localStorage.setItem(KEY, JSON.stringify(c));
  else window.localStorage.removeItem(KEY);
}

export interface SaldoInfo {
  saldo: number;
  nome: string;
}

/** Valida email+senha e devolve o saldo (erro amigável se inválido). */
export async function verificarConta(email: string, senha: string): Promise<SaldoInfo> {
  const r = await fetch(
    `${API_PONTOS}/painel/saldo?email=${encodeURIComponent(email)}&senha=${encodeURIComponent(senha)}`,
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail === "credenciais inválidas"
    ? "E-mail ou senha incorretos — confira o e-mail da sua compra."
    : (d.detail || "não foi possível entrar"));
  return { saldo: d.saldo_pontos, nome: d.nome };
}

/** Licença do modo avançado (BYOK R$50/6 meses). */
export async function licencaAtiva(email: string, senha: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${API_PONTOS}/licenca/status?email=${encodeURIComponent(email)}&senha=${encodeURIComponent(senha)}`,
    );
    const d = await r.json();
    return r.ok && d.ativa === true;
  } catch {
    return false;
  }
}

/** Erro especial: saldo insuficiente (HTTP 402 do gateway). */
export class SaldoInsuficienteError extends Error {
  constructor(public saldo: number) {
    super(`Seus pontos acabaram (saldo: ${saldo}). Compre mais em /experimente — é rapidinho.`);
    this.name = "SaldoInsuficienteError";
  }
}

/** Mapeamento ação do app → ação tarifada (tabela precos_acoes). */
export type AcaoIa = "resumo_video" | "resumo_livro" | "traducao_livro";

/** Modelos servidos pela casa (allowlist do gateway, espelho pra UI).
 *  "" = default da casa (deepseek-v4-flash — o mais econômico; pedido do
 *  Miguel 2026-08-01). Tokens/ponto calculado com 1 ponto ≈ US$ 0,0164 e
 *  preço mesclado (75% input / 25% output) do catálogo do Cérebro. */
export interface ModeloCasaInfo {
  id: string;
  rotulo: string;
  /** Texto de custo exibido na opção (ex.: "~90 mil tokens por ponto"). */
  tokensPorPonto: string;
  /** Multiplicador de pontos sobre a ação (1 = preço base). */
  mult: number;
  /** É o default/econômico da casa. */
  economico: boolean;
}
export const MODELOS_CASA: ModeloCasaInfo[] = [
  {
    id: "",
    rotulo: "DeepSeek V4 Flash",
    tokensPorPonto: "~90 mil",
    mult: 1,
    economico: true,
  },
  {
    id: "deepseek-v4-pro",
    rotulo: "DeepSeek V4 Pro",
    tokensPorPonto: "~8 mil",
    mult: 4,
    economico: false,
  },
];

export interface IaResposta {
  texto: string;
  debitado: number;
  saldo_pontos: number;
  admin?: boolean;
}

/** Chama o gateway da IA da casa (DeepSeek no servidor — debita pontos). */
export async function iaCompletar(
  conta: ContaPontos,
  acao: AcaoIa,
  sistema: string,
  prompt: string,
  contexto: string,
  maxTokens = 2000,
  modelo = "",
): Promise<IaResposta> {
  const r = await fetch(`${API_PONTOS}/ia/completar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: conta.email,
      senha: conta.senha,
      acao,
      sistema,
      prompt,
      contexto,
      max_tokens: maxTokens,
      ...(modelo ? { modelo } : {}),
    }),
  });
  const d = await r.json();
  if (r.status === 402) throw new SaldoInsuficienteError(0);
  if (!r.ok) throw new Error(d.detail || "a IA da casa falhou — tente de novo");
  return d as IaResposta;
}

// ─── Provider da IA da casa (V3): mesma interface AIProvider do BYOK ────────
// Assim o app inteiro funciona SEM chave: resolveProvider/gateway cai aqui
// quando não há BYOK configurado — e o gateway debita os pontos no servidor.
import type { AIProvider, CompleteOptions, CompleteResult } from "@igot/ai-providers";
import { getModeloCasa } from "./config";

export function gatewayProvider(acao: AcaoIa): AIProvider {
  return {
    id: "moka-casa",
    name: "Moka — IA da casa (pontos)",
    async complete(prompt: string, opts?: CompleteOptions): Promise<CompleteResult> {
      const conta = getConta();
      if (!conta) {
        throw new Error(
          "Para usar a IA: abra ⚙️ Configurações e entre com o e-mail e a senha " +
          "da sua compra — ou compre pontos em /experimente (a partir de R$ 40).",
        );
      }
      const r = await iaCompletar(
        conta, acao, opts?.systemPrompt ?? "", prompt,
        opts?.context ?? "", opts?.maxTokens ?? 2000,
        getModeloCasa(),
      );
      return { text: r.texto };
    },
  };
}
