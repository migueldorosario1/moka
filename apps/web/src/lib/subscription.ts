/**
 * Sistema de assinatura do Moka.
 *
 * TRÊS planos com nomes de café (identidade do produto):
 *
 *   ☕ FREE      — BYOK (traga sua própria chave). Funciona tudo, mas
 *                  o usuário configura a própria IA.
 *
 *   🥛 CAPPUCCINO — IA inclusa (modelo bom), voz neural natural,
 *                  traduzir livro inteiro diagramado, biblioteca na nuvem.
 *                  O plano principal — custo-benefício.
 *
 *   ☕ ESPRESSO  — Tudo do Cappuccino + IA top + Dante (agente educacional
 *                  que lê o livro em vídeo, explica e conversa com o leitor).
 *                  Focado em educação: escolas, pais, crianças.
 *
 * Quando integrarmos Stripe / RevenueCat, as funções de ativação
 * disparam o fluxo de pagamento real.
 */

const PLAN_KEY = "moka.plan";

export type PlanTier = "free" | "cappuccino" | "espresso";

export interface PlanInfo {
  tier: PlanTier;
  activatedAt?: number;
  expiresAt?: number | null;
}

/** Lê o plano atual do localStorage. */
export function getPlan(): PlanInfo {
  if (typeof window === "undefined") return { tier: "free" };
  try {
    const raw = window.localStorage.getItem(PLAN_KEY);
    if (!raw) return { tier: "free" };
    const parsed = JSON.parse(raw) as PlanInfo;
    // Migração: quem tinha "premium" vira "cappuccino".
    if ((parsed as unknown as { tier: string }).tier === "premium") {
      return { tier: "cappuccino" };
    }
    if (parsed.tier !== "free" && parsed.expiresAt && parsed.expiresAt < Date.now()) {
      return { tier: "free" };
    }
    return parsed;
  } catch {
    return { tier: "free" };
  }
}

/** Verifica se é premium (Cappuccino ou Espresso). */
export function isPremium(): boolean {
  return getPlan().tier !== "free";
}

/** Verifica se é Espresso (top). */
export function isEspresso(): boolean {
  return getPlan().tier === "espresso";
}

/** Ativa um plano (simulado — depois integra com Stripe/RevenueCat). */
export function activatePlan(tier: PlanTier, durationDays?: number): void {
  if (typeof window === "undefined") return;
  const info: PlanInfo = {
    tier,
    activatedAt: Date.now(),
    expiresAt: durationDays ? Date.now() + durationDays * 86400000 : null,
  };
  window.localStorage.setItem(PLAN_KEY, JSON.stringify(info));
}

/** Cancela (volta pra Free). */
export function deactivatePlan(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAN_KEY);
}

/**
 * Preços dos planos, por moeda (regra do Miguel, 2026-07-23):
 * nunca só "$" — interface em português mostra R$, em inglês mostra US$.
 * USD alinha com Google Play / App Store; BRL arredondado p/ loja brasileira.
 * Cappuccino = mais acessível (plano principal).
 * Espresso = premium completo (com Dante).
 */
export interface PlanPrice {
  usd: string;
  brl: string;
  periodPt: string;
  periodEn: string;
}

export const PLAN_PRICES: Record<
  "cappuccino" | "espresso",
  Record<"monthly" | "quarterly" | "yearly", PlanPrice>
> = {
  cappuccino: {
    monthly: { usd: "US$ 3.99", brl: "R$ 19,90", periodPt: "/mês", periodEn: "/month" },
    quarterly: { usd: "US$ 9.99", brl: "R$ 49,90", periodPt: "/trimestre", periodEn: "/quarter" },
    yearly: { usd: "US$ 29.99", brl: "R$ 149,90", periodPt: "/ano", periodEn: "/year" },
  },
  espresso: {
    monthly: { usd: "US$ 9.99", brl: "R$ 49,90", periodPt: "/mês", periodEn: "/month" },
    quarterly: { usd: "US$ 24.99", brl: "R$ 124,90", periodPt: "/trimestre", periodEn: "/quarter" },
    yearly: { usd: "US$ 79.99", brl: "R$ 399,90", periodPt: "/ano", periodEn: "/year" },
  },
};

/**
 * Formata o preço conforme o idioma da interface:
 * pt-* → "R$ 19,90/mês" · demais → "US$ 3.99/month".
 */
export function formatPlanPrice(
  entry: PlanPrice,
  lang: string,
): { price: string; period: string } {
  const isPt = lang.toLowerCase().startsWith("pt");
  return {
    price: isPt ? entry.brl : entry.usd,
    period: isPt ? entry.periodPt : entry.periodEn,
  };
}

/**
 * Recursos de cada plano — pra mostrar na página /premium.
 */
export const PLAN_DETAILS: Record<PlanTier, {
  name: string;
  emoji: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}> = {
  free: {
    name: "Free",
    emoji: "☕",
    tagline: "Traga sua própria chave de IA",
    features: [
      "Traga sua própria chave de API (BYOK)",
      "8 provedores de IA (DeepSeek, OpenAI, Kimi, etc)",
      "Traduzir e explicar trechos",
      "Voz do dispositivo (leitura em voz alta)",
      "12 idiomas de interface",
      "Múltiplas chaves salvas (criptografadas)",
      "Marcadores e anotações",
    ],
  },
  cappuccino: {
    name: "Cappuccino",
    emoji: "🥛",
    tagline: "IA inclusa + voz neural + nuvem",
    highlight: true,
    features: [
      "Tudo do plano Free",
      "🤖 IA inclusa — sem precisar de chave",
      "🔊 Voz neural natural (OpenAI TTS)",
      "📖 Traduzir livro inteiro diagramado",
      "☁️ Biblioteca na nuvem (qualquer dispositivo)",
      "EPUB ilimitado + PDF até 50 MB",
      "Sem anúncios",
    ],
  },
  espresso: {
    name: "Espresso",
    emoji: "☕",
    tagline: "Tudo + Dante, o tutor de leitura",
    features: [
      "Tudo do Cappuccino",
      "🧠 IA mais avançada (modelo top)",
      "🎭 Dante — agente que lê o livro em vídeo",
      "💬 Conversa com Dante sobre o livro",
      "📚 Ideal para educação e crianças",
      "Traduções comparadas",
      "Suporte prioritário",
    ],
  },
};
