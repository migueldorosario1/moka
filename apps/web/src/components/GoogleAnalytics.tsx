"use client";

/*
 * Google Analytics 4 — medição de audiência do Moka Reader.
 *
 * O ID de medição é público por design (vai embutido em toda página).
 * Guard de domínio: o GA4 só é injetado nos hosts canônicos
 * (mokareader.com / www.mokareader.com), para que espelhos, previews e
 * ambientes locais NÃO poluam a propriedade de produção (G-43CSQVKW6N).
 * Injeção via useEffect (client-only) — em hosts não permitidos o
 * componente não renderiza nada e nenhum request sai para o GTM.
 */
import { useEffect } from "react";

export const GA_MEASUREMENT_ID = "G-43CSQVKW6N";

const GA_HOSTS_CANONICOS = ["mokareader.com", "www.mokareader.com"];

export function GoogleAnalytics() {
  useEffect(() => {
    if (!GA_HOSTS_CANONICOS.includes(window.location.hostname)) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer.push(args);
    };
    w.gtag("js", new Date());
    w.gtag("config", GA_MEASUREMENT_ID);
  }, []);

  return null;
}
