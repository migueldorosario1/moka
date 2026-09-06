import type { Metadata } from "next";
import { PrivacidadeConteudo } from "@/components/PrivacidadeConteudo";

export const metadata: Metadata = {
  title: "Política de Privacidade — Moka",
  description: "Como o Moka trata seus dados.",
  alternates: { canonical: "/privacidade" },
};

/**
 * Página /privacidade — Política de Privacidade.
 *
 * Wrapper SERVER (só metadados SEO/canonical). O conteúdo mora em
 * components/PrivacidadeConteudo.tsx (client, bilíngue PT/EN, com
 * bandeirinha + Entrar no topo — ordem do Miguel, 06/09).
 */
export default function PrivacidadePage() {
  return <PrivacidadeConteudo />;
}
