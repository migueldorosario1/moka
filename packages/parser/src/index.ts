/**
 * Ponto de entrada do pacote @igot/parser.
 *
 * Use `parseBook()` para parsear qualquer formato suportado.
 * A detecção é feita pela extensão do nome do arquivo.
 */

import type { ParseResult, ParsedBook } from "./types";
import { parseEPUB } from "./epub";
import { parsePDF } from "./pdf";

export type {
  Block,
  BlockType,
  Chapter,
  ParsedBook,
  ParseResult,
} from "./types";

export { buildEpub } from "./epub-writer";
export type { EpubBuildInput, EpubChapterInput } from "./epub-writer";

export interface ParseBookInput {
  /** Conteúdo do arquivo. */
  data: ArrayBuffer;
  /** Nome do arquivo (usado pra detectar o formato e fallback de título). */
  fileName: string;
}

/**
 * Faz o parse de um e-book, detectando o formato pela extensão.
 *
 * Suporta: `.epub`, `.pdf` (e `.txt` em breve).
 * Nunca lança — devolve um `ParseResult` (ok | erro) pra UI tratar.
 */
export async function parseBook(input: ParseBookInput): Promise<ParseResult> {
  try {
    const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
    let book: ParsedBook;

    switch (ext) {
      case "epub":
        book = await parseEPUB({ data: input.data, fileName: input.fileName });
        break;
      case "pdf":
        book = await parsePDF({ data: input.data, fileName: input.fileName });
        break;
      default:
        return {
          ok: false,
          error: `Formato não suportado: ".${ext}". Use EPUB ou PDF.`,
        };
    }

    return { ok: true, book };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
