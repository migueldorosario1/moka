import type { Metadata, Viewport } from "next";
import { Fraunces, Literata, Figtree } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
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
  // Base p/ URLs de metadados (canonical, og) — o canônico do site é o www
  // (o apex faz 301). Sem isto o Next não resolve URLs relativas de metadata.
  metadataBase: new URL("https://www.mokareader.com"),
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
      <head>
        {/* CSS CRÍTICO — elimina o flash de layout (FOUC). Antes, as cores
            inline aqui eram do tema antigo "café" (#faf8f5/#2b2015) e não
            batiam com o tema "azul" real do globals.css, causando um flash
            visível em TODAS as páginas (mais forte em dark mode). Estas
            cores idênticas às de globals.css são aplicadas imediatamente,
            antes do resto do CSS parsear, e respeitam light/dark via media
            query — sem flash. */}
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body { background: #f0f4f9; color: #0f172a; }
            @media (prefers-color-scheme: dark) {
              html:not([data-theme]), body { background: #0b132b; color: #f1f5f9; }
            }
            html[data-theme="dark"], html[data-theme="dark"] body { background: #0a0a0c; color: #f5f5f7; }
            html[data-theme="contrast"], html[data-theme="contrast"] body { background: #000; color: #fff; }
            html[data-theme="sepia"], html[data-theme="sepia"] body { background: #f4ecd8; color: #3d2b1f; }
          `,
        }} />
        {/* Aplica tema + escala de fonte salvos ANTES do paint (evita flash
            de tema errado na primeira renderização). Acessibilidade 09/08. */}
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              var t = localStorage.getItem('moka.theme');
              if (t && t !== 'light') document.documentElement.setAttribute('data-theme', t);
              var fs = localStorage.getItem('moka.uiFontScale');
              if (fs) document.documentElement.style.setProperty('--ui-font-scale', fs);
            } catch (e) {}
          `,
        }} />
        <GoogleAnalytics />
      </head>
      <body>
        {/* 🧪 Identificador do ESPELHO — aparece em TODAS as páginas só quando
            NEXT_PUBLIC_SITE_URL aponta pro espelho (moka-espelho). No canônico
            a env aponta pra mokareader.com e o badge nunca renderiza. Pedido
            do Miguel 22/08 ("o espelho tem que ser total"): ninguém nunca mais
            confunde em qual dos dois sites está. */}
        {(process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("espelho") && (
          <div
            aria-hidden
            style={{
              position: "fixed",
              bottom: 10,
              left: 10,
              zIndex: 100000,
              background: "#7c3aed",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 999,
              opacity: 0.85,
              pointerEvents: "none",
              letterSpacing: 0.4,
            }}
          >
            🧪 ESPELHO
          </div>
        )}
        <I18nProvider>
          {children}
        </I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
