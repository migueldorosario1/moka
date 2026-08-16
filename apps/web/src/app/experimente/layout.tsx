import type { Metadata } from "next";

/**
 * Layout pass-through do /experimente — existe só pra exportar metadados SEO
 * (a página é "use client" e não pode exportar metadata). 16/08/2026,
 * alerta GSC "Página com redirecionamento".
 */
export const metadata: Metadata = {
  alternates: { canonical: "/experimente" },
};

export default function ExperimenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
