/**
 * Tipos comuns do parser.
 *
 * Todo formato (EPUB, PDF, ...) converte para `ParsedBook`.
 * É a "moeda" que o leitor e a camada de RAG entendem.
 */

export type BlockType =
  | "paragraph"
  | "heading"
  | "quote"
  | "image"
  | "list"
  | "page-break";

/** Um bloco atômico de conteúdo (unidade de seleção/tradução). */
export interface Block {
  /** ID estável dentro do livro (ex.: "ch3-p12-b04"). */
  id: string;
  type: BlockType;
  /** Nível de cabeçalho (1–6) quando type === "heading". */
  level?: number;
  /** Texto puro (parágrafo, heading, quote, item de lista). */
  text?: string;
  /** Itens quando type === "list". */
  items?: string[];
  /** URL/data da imagem quando type === "image". */
  src?: string;
  /** Texto alternativo da imagem, se houver. */
  alt?: string;
}

/** Um capítulo/seção da obra. */
export interface Chapter {
  id: string;
  /** Título legível (pode ser vazio em PDFs sem estrutura). */
  title?: string;
  blocks: Block[];
}

/** Estrutura comum que representa um livro após o parse. */
export interface ParsedBook {
  title: string;
  author?: string;
  /** Idioma detectado/declarado (ex.: "en", "pt-BR"). */
  language?: string;
  /** Formato de origem. */
  sourceFormat: "epub" | "pdf" | "txt";
  chapters: Chapter[];
  /** Metadados brutos do arquivo original. */
  metadata: Record<string, string>;
  /** Capa do livro (data URL) — extraída do EPUB ou render do PDF (V3). */
  coverImage?: string;
}

/** Resultado da tentativa de parse. */
export interface ParseError {
  ok: false;
  error: string;
}

export interface ParseSuccess {
  ok: true;
  book: ParsedBook;
}

export type ParseResult = ParseSuccess | ParseError;
