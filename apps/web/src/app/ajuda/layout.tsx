import type { Metadata } from "next";

/**
 * Layout pass-through do /ajuda — existe só pra exportar metadados SEO
 * (a página é "use client" e não pode exportar metadata). 16/08/2026,
 * alerta GSC "Página com redirecionamento".
 */
export const metadata: Metadata = {
  alternates: { canonical: "/ajuda" },
};

export default function AjudaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
