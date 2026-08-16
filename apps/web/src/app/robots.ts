import type { MetadataRoute } from "next";

/**
 * robots.txt — gerado pelo file convention do Next (app/robots.ts).
 *
 * Criado 16/08/2026 após alerta do Search Console ("Página com
 * redirecionamento"): o site não tinha robots.txt nem sitemap, então o
 * Google descobria URLs por conta própria (variantes http/apex, /premium)
 * e indexava devagar. Aqui declaramos o sitemap e bloqueamos as áreas de
 * app logado (sem valor de busca, economiza crawl budget).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth", "/book/", "/biblioteca", "/estante", "/configuracoes"],
      },
    ],
    sitemap: "https://www.mokareader.com/sitemap.xml",
  };
}
