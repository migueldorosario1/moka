/*
 * Google Analytics 4 — medição de audiência do Moka Reader.
 *
 * O ID de medição é público por design (vai embutido em toda página).
 * Tag única global carregada de forma assíncrona no <head> do root layout:
 * o snippet oficial do GA4 em <script> puro, no mesmo padrão dos demais
 * scripts inline do layout (theme/UI scale) — sem dependência de lib.
 * Enhanced Measurement (pageviews, scroll, cliques, busca) fica ativo na
 * própria propriedade GA4, nada extra aqui.
 */
export const GA_MEASUREMENT_ID = "G-43CSQVKW6N";

export function GoogleAnalytics() {
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `,
        }}
      />
    </>
  );
}
