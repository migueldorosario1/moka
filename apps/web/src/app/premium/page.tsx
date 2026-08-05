import { redirect } from "next/navigation";

/**
 * /premium → /ajuda (fase gratuita, pedido do Miguel 05/08: "tira esse Moka
 * Premium — não lançamos ainda"). O conteúdo de preços/assinatura saiu do ar;
 * o 🏆 Ranking de Preços das IAs vive no /ajuda. A vitrine antiga está no
 * backup pré-pivô (tag `pre-pivot-pago-v4.3`) pra Fase 2.
 */
export default function PremiumRedirect() {
  redirect("/ajuda");
}
