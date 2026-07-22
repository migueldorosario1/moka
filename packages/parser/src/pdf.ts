/**
 * Parser de PDF.
 *
 * Aqui NÃO extraímos o texto do PDF. A exibição fiel (layout, tipografia,
 * imagens) é feita no frontend pelo componente PdfPageCanvas, que renderiza
 * a página real do PDF num <canvas> com uma camada de texto selecionável.
 *
 * O papel deste parser é só:
 *   - abrir o PDF (pdfjs)
 *   - ler numPages e metadados (título/autor embutidos)
 *   - montar um Chapter por página (blocks vazio — só pra indexar a
 *     navegação "1 / 218" e dar o título "Página N")
 *
 * Assim o parse é instantâneo (não percorremos páginas) e o número do
 * capítulo bate 1:1 com o número da página do PDF.
 */

import type { Chapter, ParsedBook } from "./types";

interface PDFParseInput {
  /** Conteúdo do arquivo .pdf. */
  data: ArrayBuffer;
  /** Nome do arquivo (fallback de título). */
  fileName?: string;
}

/**
 * Faz o parse "leve" de um PDF: só estrutura (uma página = um capítulo).
 */
export async function parsePDF(input: PDFParseInput): Promise<ParsedBook> {
  const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");

  // Worker só no navegador; em Node não usamos worker.
  const isBrowser = typeof window !== "undefined";
  if (isBrowser) {
    // Worker LOCAL (embutido no app) — o CDN cdnjs.cloudflare.com deixava a
    // primeira abertura lenta (1,4 MB externos) e, se engasgava, travava o
    // livro em "lendo" (travamento reportado pelo Miguel, 2026-07-22).
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(input.data),
    ...(isBrowser ? {} : { useWorkerFetch: false, isEvalSupported: false }),
  });

  const doc = await loadingTask.promise;

  // Um capítulo por página — SEM pular vazias (mantém alinhamento 1:1).
  const chapters: Chapter[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    chapters.push({
      id: `p${pageNum}`,
      title: `Página ${pageNum}`,
      blocks: [],
    });
  }

  // Metadados embutidos (best-effort).
  let metadata: Record<string, string> = {};
  try {
    const meta = await doc.getMetadata();
    if (meta?.info) {
      const info = meta.info as Record<string, unknown>;
      const title = info["Title"];
      const author = info["Author"];
      if (typeof title === "string" && title) metadata.title = title;
      if (typeof author === "string" && author) metadata.author = author;
    }
  } catch {
    /* metadados são best-effort */
  }

  await doc.destroy();

  return {
    title: metadata.title || input.fileName?.replace(/\.pdf$/i, "") || "Sem título",
    author: metadata.author,
    sourceFormat: "pdf",
    chapters,
    metadata,
  };
}
