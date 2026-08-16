import type { MetadataRoute } from "next";

/**
 * sitemap.xml — gerado pelo file convention do Next (app/sitemap.ts).
 *
 * Criado 16/08/2026 após alerta do Search Console. Só as páginas PÚBLICAS
 * de marketing/entrada, todas na URL canônica https://www.mokareader.com
 * (o apex mokareader.com faz 301 para o www — variante http/apex NÃO entra
 * aqui). De fora de propósito: /premium (redirect 308 para /ajuda),
 * /socios (fora da navegação pública na fase 1) e as áreas logadas
 * (/estante, /biblioteca, /book, /configuracoes — bloqueadas no robots).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: "https://www.mokareader.com/", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://www.mokareader.com/sobre", lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: "https://www.mokareader.com/video", lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: "https://www.mokareader.com/ajuda", lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: "https://www.mokareader.com/experimente", lastModified, changeFrequency: "weekly", priority: 0.7 },
    { url: "https://www.mokareader.com/tutorial", lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: "https://www.mokareader.com/privacidade", lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
