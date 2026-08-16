import { redirect } from "next/navigation";

/**
 * /premium → /ajuda (fase gratuita, pedido do Miguel 05/08: "tira esse Moka
 * Premium — não lançamos ainda"). O conteúdo de preços/assinatura saiu do ar;
 * o 🏆 Ranking de Preços das IAs vive no /ajuda. A vitrine antiga está no
 * backup pré-pivô (tag `pre-pivot-pago-v4.3`) pra Fase 2.
 *
 * 16/08/2026: o redirect AGORA vive no next.config.mjs (308 permanente, com
 * header Location — o redirect() daqui saía como 307 sem Location e o Google
 * reportava "página com redirecionamento" sem consolidar). Esta página fica
 * só de fallback.
 */
export default function PremiumRedirect() {
  redirect("/ajuda");
}
