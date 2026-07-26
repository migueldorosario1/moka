/**
 * Gerador de Capas de Livros em Canvas (V3 — Moka Elegante)
 *
 * Transforma qualquer livro (EPUB ou PDF sem capa embutida) em uma
 * capa de livro elegante estilo edição de luxo (azul porcelana & dourado).
 */

export interface DynamicCoverOptions {
  title: string;
  author?: string;
  width?: number;
  height?: number;
}

export function generateDynamicBookCover(options: DynamicCoverOptions): string {
  if (typeof document === "undefined") return "";

  const width = options.width || 400;
  const height = options.height || 600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Fundo Gradiente Azul Elegante (Porcelana & Safira Escura)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0f172a");   // Azul escuro meia-noite
  grad.addColorStop(0.5, "#1e3a8a"); // Cobalto real
  grad.addColorStop(1, "#172554");   // Safira profundo
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Textura sutil de papel / couro
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  for (let i = 0; i < 80; i++) {
    const rx = Math.random() * width;
    const ry = Math.random() * height;
    const rw = Math.random() * 80 + 20;
    const rh = Math.random() * 2;
    ctx.fillRect(rx, ry, rw, rh);
  }

  // 3. Moldura Dupla Dourada Elegante (Estilo Edição Clássica)
  ctx.strokeStyle = "rgba(217, 119, 6, 0.65)"; // Dourado quente
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  ctx.strokeStyle = "rgba(217, 119, 6, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(26, 26, width - 52, height - 52);

  // Cantoneiras decorativas (quadradinhos nos cantos da moldura)
  ctx.fillStyle = "rgba(217, 119, 6, 0.7)";
  const corners = [
    [18, 18], [width - 24, 18], [18, height - 24], [width - 24, height - 24]
  ];
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx, cy, 6, 6);
  }

  // 4. Ícone / Motivo Central (Livro Elegante)
  ctx.save();
  ctx.translate(width / 2, 110);
  ctx.fillStyle = "rgba(241, 245, 249, 0.9)";
  ctx.font = "28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("☕ 📖", 0, 0);
  ctx.restore();

  // Separador dourado sob o ícone
  ctx.strokeStyle = "rgba(217, 119, 6, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 40, 140);
  ctx.lineTo(width / 2 + 40, 140);
  ctx.stroke();

  // 5. Título do Livro (Quebrado em múltiplas linhas, fonte serifada elegante)
  ctx.fillStyle = "#f8fafc"; // Porcelana branca
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const rawTitle = (options.title || "Livro sem título").trim();
  const maxW = width - 80;

  // Mede e quebra o título
  let fontSize = 26;
  if (rawTitle.length > 40) fontSize = 22;
  if (rawTitle.length > 70) fontSize = 19;

  ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;

  const words = rawTitle.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const w of words) {
    const test = currentLine ? `${currentLine} ${w}` : w;
    if (ctx.measureText(test).width > maxW && currentLine) {
      lines.push(currentLine);
      currentLine = w;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Renderiza até 5 linhas do título
  const titleY = 170;
  const lineHeight = fontSize * 1.35;
  const visibleLines = lines.slice(0, 5);

  visibleLines.forEach((line, idx) => {
    ctx.fillText(line, width / 2, titleY + idx * lineHeight);
  });

  // 6. Autor do Livro (no rodapé da capa)
  if (options.author) {
    const authorY = height - 90;

    // Linha separadora do autor
    ctx.strokeStyle = "rgba(217, 119, 6, 0.4)";
    ctx.beginPath();
    ctx.moveTo(width / 2 - 30, authorY - 16);
    ctx.lineTo(width / 2 + 30, authorY - 16);
    ctx.stroke();

    ctx.font = "italic 16px Georgia, serif";
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.fillText(options.author.slice(0, 45), width / 2, authorY);
  }

  // 7. Selo de Edição no rodapé
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
  ctx.fillText("MOKA EDITORIAL", width / 2, height - 36);

  // Lombada sutil na esquerda (sombra 3D)
  const spineGrad = ctx.createLinearGradient(0, 0, 18, 0);
  spineGrad.addColorStop(0, "rgba(0, 0, 0, 0.4)");
  spineGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  spineGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spineGrad;
  ctx.fillRect(0, 0, 18, height);

  return canvas.toDataURL("image/jpeg", 0.85);
}
