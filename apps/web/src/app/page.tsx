import type { Metadata } from "next";
import { Capa } from "@/components/Capa";

/**
 * CAPA — wrapper server (16/08/2026). O JSX real mora em components/Capa.tsx
 * (client). Esta camada server existe pra exportar metadados SEO — alerta do
 * Search Console ("Página com redirecionamento") mostrou que o site não tinha
 * canonical nem sitemap; aqui vai o canonical da home (as variantes
 * http/apex fazem 301 pra cá).
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  return <Capa />;
}
