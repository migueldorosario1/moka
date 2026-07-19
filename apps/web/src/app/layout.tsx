import type { Metadata, Viewport } from "next";
import { Fraunces, Literata, Figtree } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { I18nProvider } from "@/components/I18nProvider";

/*
 * Tipografia do Moka — três vozes, um só clima:
 *  - Fraunces  → display (marca, títulos). Serifada "soft", com o calor
 *                de letreiro de cafeteria antiga. É a personalidade do app.
 *  - Literata  → leitura (corpo dos livros, respostas da IA). Desenhada
 *                especificamente pra leitura longa em tela.
 *  - Figtree   → interface (botões, labels, menus). Sans humanista,
 *                discreta — a IA e o chrome ficam invisíveis.
 */
const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const fontReading = Literata({
  subsets: ["latin"],
  variable: "--font-reading",
  display: "swap",
});
const fontUI = Figtree({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moka — Leia qualquer coisa. Entenda tudo.",
  description:
    "Leitor inteligente de livros e documentos com IA integrada: traduza e explique qualquer trecho, em qualquer língua.",
  applicationName: "Moka",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Moka",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    telephone: false,
  },
};

// Viewport separado (Next 14 exige fora de metadata). maximum-scale pra
// evitar zoom acidental ao tocar nos botões do leitor no iPad.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#a35d2f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${fontDisplay.variable} ${fontReading.variable} ${fontUI.variable}`}
    >
      <body>
        <I18nProvider>
          {children}
        </I18nProvider>
        {/* Selo LAB — difere do site oficial */}
        <div style={{
          position: "fixed", bottom: 6, right: 6, zIndex: 9999,
          background: "#3c2a1b", color: "#e9d9c3", fontSize: 10,
          fontWeight: 600, letterSpacing: "0.06em", padding: "3px 9px",
          borderRadius: 999, pointerEvents: "none", opacity: 0.75,
        }}>🧪 LAB</div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
