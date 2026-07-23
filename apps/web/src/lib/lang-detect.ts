/**
 * lang-detect — identifica o idioma de um conteúdo (transcrição/livro)
 * por frequência de palavras características. Sem rede, sem custo, instantâneo.
 *
 * Pedido do Miguel (23/07): o default é AUTO-DETECTAR. Se o idioma do
 * conteúdo for diferente do idioma de resposta do usuário, o app avisa
 * ("detectamos inglês · respondendo em português") em vez de errar em silêncio.
 */

export interface LangDetectResult {
  code: string;            // "pt" | "en" | "es" | "fr" | "de" | "it"
  nome: string;            // rótulo em pt-BR p/ a UI
  confianca: "alta" | "media" | "baixa";
}

/** Palavras funcionais distintivas (JÁ sem acento — o texto é normalizado). */
const MARCAS: Record<string, string[]> = {
  pt: ["nao", "sao", "muito", "voce", "entao", "agora", "isso", "depois",
       "onde", "quando", "tambem", "porque", "ainda", "sobre", "gente", "coisa"],
  en: ["the", "and", "that", "have", "with", "this", "but", "they", "you",
       "what", "would", "there", "their", "about", "which", "when", "people"],
  es: ["pero", "muy", "ahora", "eso", "estan", "entonces", "porque", "cuando",
       "tambien", "todavia", "sobre", "gente", "cosa", "donde", "aqui", "hay"],
  fr: ["les", "des", "est", "avec", "dans", "qui", "pas", "sur", "plus",
       "mais", "nous", "vous", "cette", "sont", "comme", "tout", "pour"],
  de: ["der", "die", "und", "das", "ist", "mit", "nicht", "ein", "eine",
       "auf", "auch", "sie", "aber", "wie", "wir", "sind", "von", "ich"],
  it: ["che", "non", "una", "con", "per", "questo", "sono", "come", "era",
       "suo", "molto", "quando", "anche", "della", "siamo", "cosa", "dove"],
};

export const LANG_NOMES: Record<string, string> = {
  pt: "português",
  en: "inglês",
  es: "espanhol",
  fr: "francês",
  de: "alemão",
  it: "italiano",
};

/**
 * Detecta o idioma de `texto` (amostra de ~6k chars basta).
 * Retorna o melhor palpite mesmo com confiança baixa — a UI decide o tom do aviso.
 */
export function detectContentLang(texto: string): LangDetectResult {
  const palavras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1)
    .slice(0, 1200); // amostra rápida

  const contagem = new Map<string, number>();
  for (const w of palavras) contagem.set(w, (contagem.get(w) ?? 0) + 1);

  const placar: Array<[string, number]> = Object.entries(MARCAS).map(
    ([lang, marcas]) => {
      let pts = 0;
      for (const m of marcas) pts += contagem.get(m) ?? 0;
      return [lang, pts] as [string, number];
    },
  );
  placar.sort((a, b) => b[1] - a[1]);

  const [melhor, segundo] = [placar[0], placar[1]];
  const code = melhor[1] > 0 ? melhor[0] : "en";
  const razao = melhor[1] / (segundo[1] + 1);
  const confianca: LangDetectResult["confianca"] =
    melhor[1] >= 25 && razao >= 2 ? "alta" : melhor[1] >= 10 ? "media" : "baixa";

  return { code, nome: LANG_NOMES[code] ?? code, confianca };
}
