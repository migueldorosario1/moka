/**
 * pdf-cover — gera a capa de um PDF (render da página 1) pra estante bonita
 * (pedido do Miguel, V3: "a estante tem que mostrar a capa dos livros").
 *
 * Roda no navegador com o pdfjs local (mesmo worker do leitor). Largura
 * ~360px, JPEG 0.8 — leve pra guardar em data URL no IndexedDB.
 */
export async function renderPdfCover(data: ArrayBuffer): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    // Cópia própria: o pdfjs "detacha" o buffer que recebe.
    const owned = data.slice(0);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(owned) }).promise;
    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 360 / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.8);
    await doc.destroy();
    return url;
  } catch {
    return null; // capa é best-effort — nunca quebra o upload
  }
}
