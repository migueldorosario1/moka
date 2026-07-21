/**
 * Utilitários de PAGINAÇÃO de EPUB.
 *
 * EPUB não tem páginas por natureza (cada item do spine é um "capítulo"
 * contínuo) — sem isso, o texto vinha "corrido" num scroll infinito.
 * Estas funções quebram os blocos de um capítulo em páginas de
 * ~EPUB_PAGE_CHARS caracteres.
 *
 * Moram num módulo próprio (fora do Reader) porque a TRADUÇÃO INTEGRAL
 * EM VOLUMES (book-translate.ts) usa a mesma paginação pra fatiar o
 * livro em volumes de N páginas — a paginação do volume bate 1:1 com a
 * paginação que o usuário vê na tela.
 */

import type { Block } from "@igot/parser";

/**
 * Alvo de caracteres por PÁGINA de EPUB.
 * ~2200 chars ≈ uma tela confortável de leitura (300-350 palavras).
 */
export const EPUB_PAGE_CHARS = 2200;

/** Extrai o texto "falável/imprimível" de um bloco. */
export function blockText(b: Block): string {
  if (b.type === "list") return (b.items ?? []).join(", ");
  return b.text ?? "";
}

/** Junta o texto de vários blocos (pra TTS, tradução de página, resumo). */
export function blocksToText(blocks: Block[], sep: string): string {
  return blocks.map(blockText).filter(Boolean).join(sep);
}

/** "Tamanho" de um bloco pra efeito de paginação. */
export function blockLength(b: Block): number {
  if (b.type === "image") return 400; // imagem ocupa espaço visual da página
  return blockText(b).length;
}

/**
 * Fatia um texto longo em pedaços de até `max` chars, cortando de
 * preferência no fim de uma frase (". ") ou num espaço — nunca no
 * meio de uma palavra.
 */
export function splitLongText(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(". ", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Quebra os blocos de um capítulo EPUB em PÁGINAS.
 *
 * Regras:
 *   - "page-break" explícito (do livro) força página nova;
 *   - heading começa página nova (se a atual já tem conteúdo) — seção nova;
 *   - encheu ~EPUB_PAGE_CHARS → página nova (sem cortar bloco no meio);
 *   - bloco sozinho maior que uma página → fatiado em frases (splitLongText).
 */
export function paginateBlocks(blocks: Block[]): Block[][] {
  const pages: Block[][] = [];
  let current: Block[] = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      count = 0;
    }
  };
  for (const b of blocks) {
    if (b.type === "page-break") {
      flush();
      continue;
    }
    if (b.type === "heading" && count > 0) flush();
    const len = blockLength(b);
    if (len > EPUB_PAGE_CHARS && b.text) {
      const chunks = splitLongText(b.text, EPUB_PAGE_CHARS);
      chunks.forEach((chunk, i) => {
        if (count > 0 && count + chunk.length > EPUB_PAGE_CHARS) flush();
        current.push({ ...b, id: `${b.id}-s${i}`, text: chunk });
        count += chunk.length;
      });
      continue;
    }
    if (count > 0 && count + len > EPUB_PAGE_CHARS) flush();
    current.push(b);
    count += len;
  }
  flush();
  return pages.length > 0 ? pages : [[]];
}
