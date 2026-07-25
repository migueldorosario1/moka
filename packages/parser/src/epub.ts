/**
 * Parser de EPUB.
 *
 * EPUB é essencialmente um ZIP com arquivos (X)HTML por capítulo.
 * O fluxo:
 *   1. Descompacta o buffer (JSZip no navegador / Node)
 *   2. Lê o OPF (metadata + spine = ordem de leitura)
 *   3. Para cada item do spine, extrai texto dos (X)HTML
 *   4. Monta `ParsedBook`
 *
 * Esta implementação roda no navegador (JSZip + DOMParser nativo),
 * mas é facilmente portável pra Node com unzipper/cheerio.
 */

import JSZip from "jszip";
import type { Block, Chapter, ParsedBook } from "./types";

interface EPUBParseInput {
  /** Conteúdo do arquivo .epub. */
  data: ArrayBuffer;
  /** Nome do arquivo (só pra fallback de título). */
  fileName?: string;
}

/**
 * Faz o parse de um EPUB.
 * Dependências: "jszip" e o DOMParser nativo do navegador.
 */
export async function parseEPUB(input: EPUBParseInput): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(input.data);

  // --- 1. Localizar o container.xml para achar o OPF raiz ---
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) {
    throw new Error("EPUB inválido: container.xml ausente.");
  }
  const opfPath = extractOPFPath(containerXml);
  if (!opfPath) {
    throw new Error("EPUB inválido: rootfile OPF não encontrado.");
  }

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) {
    throw new Error(`EPUB inválido: OPF "${opfPath}" não encontrado.`);
  }
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  // --- 2. Parse do OPF (com DOMParser) ---
  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opfXml, "application/xhtml+xml");

  const metadata = extractOPFMetadata(opfDoc);
  const { manifest, manifestByHref } = buildManifest(opfDoc, opfDir);

  // Capa (V3 — pedido do Miguel: a estante mostra capas bonitas).
  // Duas formas comuns no EPUB: <meta name="cover" content="ID"> ou
  // item do manifest com properties="cover-image".
  let coverImage: string | undefined;
  try {
    let coverHref: string | undefined;
    const metas = Array.from(opfDoc.getElementsByTagNameNS("*", "meta"));
    const metaCover = metas.find((m) => m.getAttribute("name") === "cover");
    const coverId = metaCover?.getAttribute("content");
    if (coverId && manifest[coverId]) coverHref = manifest[coverId].zipPath;
    if (!coverHref) {
      const items = Array.from(opfDoc.getElementsByTagNameNS("*", "item"));
      const item = items.find(
        (i) => (i.getAttribute("properties") ?? "").includes("cover-image"),
      );
      const href = item?.getAttribute("href");
      if (href) coverHref = decodeURIComponent(resolveRelative(opfDir, href));
    }
    if (coverHref) {
      const file = zip.file(coverHref) ?? zip.file(decodeURIComponent(coverHref));
      if (file) {
        const b64 = await file.async("base64");
        const ext = coverHref.split(".").pop()?.toLowerCase() ?? "jpeg";
        const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
        coverImage = `data:${mime};base64,${b64}`;
      }
    }
  } catch { /* capa é best-effort */ }
  const spineItemrefs = Array.from(opfDoc.getElementsByTagNameNS("*", "itemref"));

  // --- 3. Para cada item do spine, extrair blocos ---
  const chapters: Chapter[] = [];
  let chapIdx = 0;
  for (const itemref of spineItemrefs) {
    const idref = itemref.getAttribute("idref");
    if (!idref || !manifest[idref]) continue;

    const item = manifest[idref];
    if (!item.mediaType.includes("html") && !item.href.endsWith(".html") && !item.href.endsWith(".xhtml")) {
      continue;
    }

    const html = await zip.file(item.zipPath)?.async("string");
    if (!html) continue;

    const doc = parser.parseFromString(html, "application/xhtml+xml");
    const blocks = await extractBlocks(
      doc,
      `ch${chapIdx}`,
      // Resolvedor de imagens: lê do ZIP e devolve data URL embutida.
      // Assim a capa/ilustrações aparecem sem depender de servidor.
      async (src) => resolveImage(zip, item.zipPath, src),
    );

    // Pula capítulos "triviais": sem conteúdo real (copyright, keywords,
    // sumário navegável, capa de créditos). Heurística baseada em texto
    // total do capítulo + parágrafo mais longo: um capítulo legítimo tem
    // parágrafos longos; páginas de metadata têm muitos blocos curtos.
    const textBlocks = blocks.filter(
      (b) => b.type === "paragraph" || b.type === "heading" || b.type === "quote",
    );
    const totalText = textBlocks.reduce((acc, b) => acc + (b.text?.length ?? 0), 0);
    const longestPara = Math.max(
      0,
      ...textBlocks.map((b) => b.text?.length ?? 0),
    );
    const hasImage = blocks.some((b) => b.type === "image");
    // Critério: OU tem imagem, OU tem ≥200 chars totais E um parágrafo ≥80.
    // Isso descarta keywords (muitos blocos curtos) mantendo capítulos reais.
    const isRealContent = hasImage || (totalText >= 200 && longestPara >= 80);
    if (!isRealContent) {
      continue;
    }

    // Título do capítulo: heading > <title> > "Capítulo N".
    const firstHeading = blocks.find((b) => b.type === "heading");
    const docTitle = doc.querySelector("title")?.textContent?.trim();
    const title =
      firstHeading?.text || docTitle || (chapIdx === 0 ? "Início" : `Capítulo ${chapIdx + 1}`);

    chapters.push({
      id: `ch${chapIdx}`,
      title,
      blocks,
    });
    chapIdx++;
  }

  // DEBUG temporário: mostra no console do navegador a estrutura extraída.
  if (typeof console !== "undefined") {
    console.log(
      `[igot/epub] ${chapters.length} capítulos:`,
      chapters.map((c) => ({
        id: c.id,
        title: c.title,
        blocks: c.blocks.length,
        preview:
          c.blocks.find((b) => b.text)?.text?.slice(0, 60) ?? "(sem texto)",
      })),
    );
  }

  return {
    title: metadata.title || input.fileName?.replace(/\.epub$/i, "") || "Sem título",
    author: metadata.author,
    language: metadata.language,
    sourceFormat: "epub",
    chapters,
    metadata,
    coverImage,
  };
}

// ----------------------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------------------

function extractOPFPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : null;
}

function extractOPFMetadata(opfDoc: Document): Record<string, string> {
  const get = (tag: string): string | undefined => {
    const el = opfDoc.getElementsByTagNameNS("*", tag)[0];
    return el?.textContent?.trim() || undefined;
  };
  const meta: Record<string, string> = {};
  const title = get("title");
  const creator = get("creator");
  const language = get("language");
  if (title) meta.title = title;
  if (creator) meta.author = creator;
  if (language) meta.language = language;
  return meta;
}

interface ManifestItem {
  id: string;
  href: string;
  /** Caminho dentro do ZIP (relativo à raiz do ZIP). */
  zipPath: string;
  mediaType: string;
}

function buildManifest(
  opfDoc: Document,
  opfDir: string,
): { manifest: Record<string, ManifestItem>; manifestByHref: Record<string, ManifestItem> } {
  const manifest: Record<string, ManifestItem> = {};
  const manifestByHref: Record<string, ManifestItem> = {};
  const items = Array.from(opfDoc.getElementsByTagNameNS("*", "item"));
  for (const item of items) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") ?? "";
    if (!id || !href) continue;
    const zipPath = decodeURIComponent(resolveRelative(opfDir, href));
    const entry: ManifestItem = { id, href, zipPath, mediaType };
    manifest[id] = entry;
    manifestByHref[href] = entry;
  }
  return { manifest, manifestByHref };
}

function resolveRelative(base: string, rel: string): string {
  if (!base) return rel;
  try {
    return new URL(rel, `http://x/${base}`).pathname.slice(1);
  } catch {
    return rel;
  }
}

/** Função que resolve um `src` de imagem (relativo ao XHTML) num data URL. */
type ImageResolver = (src: string) => Promise<string | undefined>;

/**
 * Percorre o body do (X)HTML e extrai blocos de conteúdo.
 * Heurística simples: cada <p>, <h1-6>, <blockquote>, <ul/ol>, <img>
 * vira um Block. Outras tags viram parágrafos com texto agregado.
 *
 * O `resolveImage` é chamado pra cada <img> encontrado, permitindo ler
 * a imagem do ZIP do EPUB e embuti-la como data URL.
 */
async function extractBlocks(
  doc: Document,
  chapId: string,
  resolveImage: ImageResolver,
): Promise<Block[]> {
  const blocks: Block[] = [];
  const body = doc.getElementsByTagName("body")[0] ?? doc.documentElement;
  let counter = 0;

  for (const node of Array.from(body.childNodes)) {
    await walk(node, blocks, chapId, () => counter++, resolveImage);
  }
  return blocks;
}

async function walk(
  node: ChildNode,
  blocks: Block[],
  chapId: string,
  nextId: () => number,
  resolveImage: ImageResolver,
): Promise<void> {
  if (node.nodeType !== 1) return; // só elementos
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  const id = `${chapId}-b${nextId()}`;

  if (/^h[1-6]$/.test(tag)) {
    const text = el.textContent?.trim();
    if (text) blocks.push({ id, type: "heading", level: Number(tag[1]), text });
    return;
  }
  if (tag === "p") {
    const text = el.textContent?.trim();
    if (text) blocks.push({ id, type: "paragraph", text });
    return;
  }
  if (tag === "blockquote") {
    const text = el.textContent?.trim();
    if (text) blocks.push({ id, type: "quote", text });
    return;
  }
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.getElementsByTagName("li"))
      .map((li) => li.textContent?.trim() ?? "")
      .filter(Boolean);
    if (items.length) blocks.push({ id, type: "list", items });
    return;
  }
  if (tag === "img") {
    const rawSrc = el.getAttribute("src") ?? el.getAttribute("xlink:href") ?? undefined;
    const alt = el.getAttribute("alt") ?? undefined;
    if (rawSrc) {
      // Resolve o src relativo ao XHTML lendo do ZIP → data URL embutida.
      const src = (await resolveImage(rawSrc)) ?? rawSrc;
      blocks.push({ id, type: "image", src, alt });
    }
    return;
  }
  // Também cobre <image> (SVG, comum em capas EPUB) com xlink:href.
  if (tag === "image") {
    const rawSrc =
      el.getAttribute("xlink:href") ?? el.getAttribute("href") ?? undefined;
    if (rawSrc) {
      const src = (await resolveImage(rawSrc)) ?? rawSrc;
      blocks.push({ id, type: "image", src });
    }
    return;
  }

  // Recursão: div, section, article, etc.
  for (const child of Array.from(el.childNodes)) {
    await walk(child, blocks, chapId, nextId, resolveImage);
  }
}

/**
 * Resolve um `src` de imagem relativo ao XHTML que a referencia.
 *
 * Estratégia:
 *   - Ignora data URLs e URLs http(s) absolutas (já válidas como estão).
 *   - Resolve o caminho relativo ao arquivo XHTML (não ao OPF).
 *   - Lê o arquivo do ZIP, determina o MIME pela extensão e devolve
 *     um data URL (`data:image/...;base64,...`).
 *   - Se não encontrar, devolve undefined (o caller preserva o src bruto).
 */
async function resolveImage(
  zip: JSZip,
  htmlZipPath: string,
  src: string,
): Promise<string | undefined> {
  // data: e http(s): já são válidos como estão.
  if (/^(data:|https?:|blob:)/i.test(src)) return undefined;

  // Caminho do diretório do XHTML no ZIP.
  const htmlDir = htmlZipPath.includes("/")
    ? htmlZipPath.slice(0, htmlZipPath.lastIndexOf("/") + 1)
    : "";

  // Resolve o src relativo ao diretório do XHTML.
  let imgPath: string;
  try {
    imgPath = decodeURIComponent(new URL(src, `http://x/${htmlDir}`).pathname.slice(1));
  } catch {
    imgPath = src;
  }

  const file = zip.file(imgPath);
  if (!file) return undefined;

  const mime = mimeFromExt(imgPath);
  const blob = await file.async("base64");
  return `data:${mime};base64,${blob}`;
}

/** Devolve o MIME type pela extensão do arquivo de imagem. */
function mimeFromExt(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
