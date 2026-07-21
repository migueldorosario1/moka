/**
 * ESCRITOR de EPUB.
 *
 * O parser lê EPUB → ParsedBook. Este módulo faz o caminho inverso:
 * gera um EPUB 3 válido (ZIP) a partir de capítulos de texto.
 *
 * Uso principal: TRADUÇÃO INTEGRAL EM VOLUMES — cada volume traduzido
 * vira um arquivo .epub de verdade (baixável e re-importável no Moka
 * ou em qualquer leitor: Kindle, Kobo, Apple Books, Calibre).
 *
 * Estrutura gerada (mínimo viável EPUB 3):
 *   mimetype                  (sempre o 1º arquivo, sem compressão)
 *   META-INF/container.xml    (aponta pro OPF)
 *   OEBPS/content.opf         (metadata + manifest + spine)
 *   OEBPS/nav.xhtml           (sumário navegável — obrigatório no EPUB 3)
 *   OEBPS/style.css           (tipografia básica de leitura)
 *   OEBPS/chap-001.xhtml ...  (um arquivo por capítulo)
 */

import JSZip from "jszip";

/** Um capítulo de saída: título + parágrafos de texto puro. */
export interface EpubChapterInput {
  title: string;
  paragraphs: string[];
}

export interface EpubBuildInput {
  title: string;
  author?: string;
  /** Idioma do conteúdo (ex.: "pt-BR", "en"). */
  language?: string;
  /** Identificador único do livro (urn:uuid:... ou qualquer string). */
  identifier: string;
  chapters: EpubChapterInput[];
}

/** Escapa XML/HTML pra injeção segura nos documentos gerados. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Gera um EPUB e devolve os bytes (Uint8Array).
 * Roda no navegador e no Node (JSZip é isomórfico).
 */
export async function buildEpub(input: EpubBuildInput): Promise<Uint8Array> {
  const lang = input.language || "pt-BR";
  const zip = new JSZip();

  // 1. mimetype — OBRIGATORIAMENTE o primeiro arquivo e SEM compressão.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. container.xml — aponta pro OPF raiz.
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  // 3. Capítulos XHTML.
  const chapterFiles: string[] = [];
  input.chapters.forEach((ch, i) => {
    const fileName = `chap-${String(i + 1).padStart(3, "0")}.xhtml`;
    chapterFiles.push(fileName);
    const body = [
      `<h1>${escapeXml(ch.title)}</h1>`,
      ...ch.paragraphs
        .filter((p) => p.trim())
        .map((p) => `<p>${escapeXml(p.trim())}</p>`),
    ].join("\n    ");
    zip.file(
      `OEBPS/${fileName}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section>
    ${body}
  </section>
</body>
</html>`,
    );
  });

  // 4. Sumário navegável (obrigatório no EPUB 3).
  const navItems = input.chapters
    .map(
      (ch, i) =>
        `      <li><a href="${chapterFiles[i]}">${escapeXml(ch.title)}</a></li>`,
    )
    .join("\n");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(input.title)} — Sumário</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>${escapeXml(input.title)}</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`,
  );

  // 5. CSS básico de leitura.
  zip.file(
    "OEBPS/style.css",
    `body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; margin: 5%; }
h1 { font-size: 1.4em; margin-bottom: 1em; }
p { margin: 0 0 1em 0; text-align: justify; }`,
  );

  // 6. content.opf — metadata + manifest + spine.
  const manifestItems = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
    ...chapterFiles.map(
      (f, i) =>
        `    <item id="chap${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n");
  const spineItems = chapterFiles
    .map((_, i) => `    <itemref idref="chap${i + 1}"/>`)
    .join("\n");
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(input.identifier)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    ${input.author ? `<dc:creator>${escapeXml(input.author)}</dc:creator>` : ""}
    <dc:language>${escapeXml(lang)}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`,
  );

  return zip.generateAsync({
    type: "uint8array",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}
