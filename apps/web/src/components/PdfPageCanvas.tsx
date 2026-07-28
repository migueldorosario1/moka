"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renderiza UMA página real de PDF, fiel ao original (layout, tipografia,
 * imagens), com uma camada de texto selecionável por cima — de forma que o
 * fluxo Traduzir/Explicar do Reader continue funcionando.
 *
 * Arquitetura:
 *   <canvas>  → desenho da página (fiel ao PDF)
 *   <div text-layer> → <span>s transparentes com o texto, alinhados por cima
 *
 * O window.getSelection() do Reader enxerga os <span>s da text-layer como
 * texto normal, então o menu flutuante aparece no lugar certo.
 *
 * VISIBILIDADE: o canvas e a text-layer ficam INVISÍVEIS (opacity:0) até o
 * render completar 100%, evitando o "flash" feio de conteúdo desalinhado
 * aparecendo no canto antes de estar pronto. O spinner cobre tudo enquanto
 * isso.
 */

interface PdfPageCanvasProps {
  /** Buffer do PDF original (preservado em page.tsx). */
  data: ArrayBuffer;
  /** Número da página (1-based). */
  pageNum: number;
  /** Multiplicador de zoom (1 = ajustado à tela, 2 = dobro, etc.). */
  zoom?: number;
  /** Tradução da página (já pronta); null = ainda não traduzida. */
  translationOverlay?: string | null;
  /** True = mostra a tradução; False = mostra o original (toggle). */
  showTranslation?: boolean;
  /** Recebe o texto extraído da página atual (pra "Traduzir página"). */
  onPageText?: (text: string) => void;
  /** Entrega o canvas renderizado ao pai (pra snapshot/foto da página). */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  /** Entrega o número TOTAL de páginas do documento ao pai (pra nav bar). */
  onNumPages?: (n: number) => void;
}

type Status = "loading" | "ready" | "error";

/**
 * Calcula a escala pra a página caber INTEIRA na área visível do leitor.
 * Considera tanto largura quanto altura — essencial pra telas paisagem
 * (notebook deitado, iPad em modo horizontal) onde a página é mais alta
 * que a área visível.
 *
 * @param baseViewport viewport do PDF na escala 1 (page.getViewport({scale:1}))
 * @param availW largura útil em CSS px
 * @param availH altura útil em CSS px
 */
function fitScale(
  baseWidth: number,
  baseHeight: number,
  availW: number,
  availH: number,
): number {
  const byWidth = availW / baseWidth;
  const byHeight = availH / baseHeight;
  // O menor dos dois garante que a página inteira caiba sem cortar.
  return Math.min(byWidth, byHeight);
}

/**
 * Hook: tamanho do container (ResizeObserver em vez de window.resize).
 * Filtros anti-jitter do iOS Safari (sugestões ChatGPT + Claude):
 * - Só atualiza se mudou mais de 4px (threshold)
 * - Ignora mudança só de altura <150px (barra do Safari encolhendo/aparecendo)
 *   → era isso que reconstruía a text layer no meio da seleção
 */
function useViewportSize() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setSize((prev) => {
        // Só re-renderiza se a LARGURA mudou (rotação/janela) OU se a altura
        // mudou MUITO (>150px). Ignora a barra do Safari encolhendo (Claude).
        if (prev.w === w && Math.abs(prev.h - h) < 150) return prev;
        // Threshold extra de 4px (ChatGPT).
        if (Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4) return prev;
        return { w, h };
      });
    };
    update();
    // ResizeObserver no body (mais preciso que window.resize).
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(document.body);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

export function PdfPageCanvas({
  data,
  pageNum,
  zoom = 1,
  translationOverlay = null,
  showTranslation = false,
  onPageText,
  onCanvasReady,
  onNumPages,
}: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  // Re-render quando a janela muda de tamanho (redimensionar, girar tablet).
  const vpSize = useViewportSize();

  // ANTI-PULO (endOfContent): cobre os vazios entre linhas do text layer
  // durante a seleção. Sem isso, o hit-test cai no container e a seleção
  // "explode" pra cima/baixo.
  // VERSÃO CORRETA (não bloqueia seleção no iPad):
  // - Só ativa com selectionchange (depois que seleção JÁ EXISTE)
  // - NÃO usa pointerdown/mousedown (que bloqueava o início da seleção)
  // - z-index: 0 no endOfContent, z-index: 1 nos spans (já no globals.css)
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!layer) return;

    const checkSelection = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        layer.classList.remove("selecting");
        return;
      }
      try {
        const inside = sel.getRangeAt(0).intersectsNode(layer);
        layer.classList.toggle("selecting", !!inside);
      } catch { /* range transitório do Safari */ }
    };

    const stop = () => layer.classList.remove("selecting");

    // SÓ selectionchange — sem pointerdown/mousedown (que bloqueava touch).
    document.addEventListener("selectionchange", checkSelection);
    document.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);

    return () => {
      document.removeEventListener("selectionchange", checkSelection);
      document.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);

  // Handles transitórios (pra cancelar em re-renders).
  const docRef = useRef<Awaited<ReturnType<typeof loadDoc>> | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerHandleRef = useRef<{ cancel: () => void } | null>(null);

  // `pageReady` controla a opacidade do canvas/text-layer. Só vira true DEPOIS
  // que o render do canvas E da text-layer terminam — evita o flash feio.
  const [docReady, setDocReady] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [error, setError] = useState<string>("");
  // Watchdog de render (Miguel, 28/07): re-tenta 1× por página se travar.
  const [retryTick, setRetryTick] = useState(0);
  const lastRetryPage = useRef<number | null>(null);

  // Carrega o documento UMA vez quando o `data` muda.
  useEffect(() => {
    let cancelled = false;
    setDocReady(false);
    setPageReady(false);

    // WATCHDOG (pedido do Miguel, 2026-07-22): se o pdfjs travar (worker do
    // CDN lento/bloqueado, PDF gigante ou corrompido), o spinner rodava PRA
    // SEMPRE. Agora: 30s sem carregar → erro amigável em vez de espera infinita.
    const watchdog = setTimeout(() => {
      if (!cancelled && !docRef.current) {
        setError(
          "o PDF demorou demais pra abrir (rede lenta ou arquivo muito grande). Tente de novo, ou abra outro livro e volte depois.",
        );
      }
    }, 30_000);

    loadDoc(data)
      .then((doc) => {
        clearTimeout(watchdog);
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setDocReady(true);
        // Entrega o número total de páginas ao pai (pra nav bar não depender de chapters).
        if (onNumPages && (doc as any).numPages) {
          onNumPages((doc as any).numPages);
        }
      })
      .catch((err) => {
        clearTimeout(watchdog);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      renderTaskRef.current?.cancel();
      textLayerHandleRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [data]);

  // Renderiza a página quando muda `pageNum` (requer doc pronto).
  useEffect(() => {
    if (!docReady) return;

    const doc = docRef.current;
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!doc || !canvas || !textLayerDiv) return;

    let cancelled = false;
    let localRenderTask: { cancel: () => void } | null = null;
    let localTextLayer: { cancel: () => void } | null = null;

    // Esconde a página antiga imediatamente (mostra spinner).
    setPageReady(false);
    setError("");

    // WATCHDOG de render (Miguel, 28/07): se a página travar no meio do
    // render (worker engasga numa página pesada), o spinner rodava PRA
    // SEMPRE até o usuário voltar e avançar. Agora: 20s → re-tenta 1×
    // (uma única vez por página, sem loop); se travar de novo → erro
    // com orientação, nunca espera infinita.
    let concluiu = false;
    const watchdog = setTimeout(() => {
      if (!cancelled && !concluiu) {
        if (lastRetryPage.current !== pageNum) {
          lastRetryPage.current = pageNum;
          setRetryTick((t) => t + 1);
        } else {
          setError(
            "esta página travou ao carregar. Volte uma página e avance — se persistir, recarregue o livro.",
          );
        }
      }
    }, 20_000);

    (async () => {
      try {
        const page = await doc.getPage(pageNum);

        const baseViewport = page.getViewport({ scale: 1 });

        // Mede a área do PAI do PAI (o .reader-scroll) — não do container
        // direto, porque esse cresce com o canvas e cria feedback loop.
        // Usar o avô (.reader-scroll) dá dimensões estáveis que não mudam
        // ao fazer zoom (ele tem altura fixa pelo flex/grid).
        const scrollParent = containerRef.current?.parentElement?.parentElement;
        const availW = (scrollParent?.clientWidth ?? window.innerWidth) - 32;
        const availH = (scrollParent?.clientHeight ?? window.innerHeight) - 120;
        // fitScale ajusta à tela; zoom multiplica pra permitir +/− manual.
        const fit = fitScale(baseViewport.width, baseViewport.height, availW, availH);
        const scale = Math.max(0.2, fit * zoom);
        const viewport = page.getViewport({ scale });

        // Alta nitidez em telas Retina/iPad.
        // Abordagem oficial do pdfjs: dimensionar o canvas internamente
        // pelo devicePixelRatio, mas usar o viewport LÓGICO no render.
        const outputScale = window.devicePixelRatio || 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        // Limpa o canvas antes de renderizar (evita artefatos e garante
        // que o fundo/imagens da capa sejam pintados do zero).
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Fundo branco — alguns PDFs (capas, slides) têm fundo transparente
        // e ficariam "invisíveis" sem isso.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // pdfjs 4.x exige --scale-factor na text-layer p/ alinhar os spans.
        textLayerDiv.style.setProperty("--scale-factor", String(scale));
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        // Limpa text-layer de render anterior.
        textLayerDiv.innerHTML = "";

        // Render do canvas (fiel ao PDF). Usamos transform de escala pra
        // alta nitidez — mesma fórmula dos exemplos oficiais do pdfjs.
        const task = page.render({
          canvasContext: ctx,
          viewport,
          transform:
            outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        localRenderTask = task;
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;

        // Camada de texto selecionável (a peça que mantém a IA funcionando).
        const TextLayerClass = await getTextLayerClass();
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const textLayer = new TextLayerClass({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        localTextLayer = textLayer;
        textLayerHandleRef.current = textLayer;
        await textLayer.render();

        // ANTI-PULO: endOfContent (mecanismo do pdf.js oficial).
        // Div atrás dos spans que cobre os vazios entre linhas durante seleção.
        // Funciona em iPad porque: não usa pointerdown, só selectionchange.
        const end = document.createElement("div");
        end.className = "endOfContent";
        textLayerDiv.appendChild(end);

        if (cancelled) return;

        // Entrega ao pai o texto concatenado da página (pra "Traduzir página").
        // Heurística simples: junta os str dos items, quebrando linha quando
        // um item tem hasEOL.
        const pageText = textContent.items
          .map((it) => {
            const item = it as { str?: string; hasEOL?: boolean };
            return item.hasEOL ? `${item.str ?? ""}\n` : (item.str ?? "");
          })
          .join("")
          .trim();
        onPageText?.(pageText);

        // PRONTO: só agora revelamos a página, já 100% alinhada.
        concluiu = true;
        clearTimeout(watchdog);
        setPageReady(true);
        // Entrega o canvas ao pai (pra snapshot/foto da página).
        if (canvas) onCanvasReady?.(canvas);
      } catch (err) {
        if (cancelled) return;
        concluiu = true;
        clearTimeout(watchdog);
        // RenderingCancelledException é esperada em re-renders; ignora.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/cancelled/i.test(msg)) {
          setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      localRenderTask?.cancel();
      localTextLayer?.cancel();
    };
    // vpSize dispara re-render ao redimensionar/girar a tela. zoom ao mudar o zoom.
  }, [pageNum, docReady, vpSize, zoom, onPageText, retryTick]);

  const showSpinner = !pageReady && !error;
  const showError = error !== "";

  return (
    <div className="pdf-page-container" ref={containerRef}>
      <div
        className="pdf-page-wrapper"
        style={{
          visibility: pageReady ? "visible" : "hidden",
        }}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="pdf-text-layer" />
        {showTranslation && translationOverlay && (
          <div className="pdf-translation-overlay">
            <div className="pdf-translation-page">
              {splitParagraphs(translationOverlay).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {showSpinner && (
        <div className="pdf-loading">
          <div className="pdf-spinner" />
          <span>Carregando página…</span>
        </div>
      )}

      {showError && (
        <div className="pdf-error">
          ⚠️ Não foi possível renderizar a página: {error}
        </div>
      )}
    </div>
  );
}

// ─── Helpers (lazy import + cache) ───────────────────────────────────────

/**
 * Divide a tradução em parágrafos. O prompt do translatePage pede pra separar
 * parágrafos por linha em branco; aqui quebramos isso num array de strings,
 * cada uma virando um <p> na página traduzida. Linhas vazias/só whitespace
 * são descartadas (são os separadores).
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/) // blocos separados por linha em branco
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/**
 * Importa o pdfjs, configura o worker e devolve um wrapper do documento.
 *
 * Importante: o pdfjs "detacha" o ArrayBuffer que recebe (ele é transferido
 * ao Worker via postMessage e não pode ser reusado). Por isso criamos uma
 * cópia AQUI, antes de criar a Uint8Array — o ArrayBuffer original que vem
 * das props permanece intacto pra eventuais re-renderizações.
 */
async function loadDoc(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  // Worker LOCAL (embutido no app, /pdf.worker.min.mjs) — antes vinha do
  // CDN cdnjs.cloudflare.com: se o CDN engasgava ou estava fora/bloqueado,
  // o livro travava em "lendo" pra sempre (travamento reportado pelo Miguel).
  // O arquivo é copiado de node_modules/pdfjs-dist/build — se atualizar o
  // pacote, re-copiar pra manter a versão casada.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const owned = data.slice(0);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(owned) });
  const doc = await loadingTask.promise;
  return {
    getPage: (n: number) => doc.getPage(n),
    destroy: () => doc.destroy(),
    numPages: doc.numPages,
  };
}

/** Importa a classe TextLayer (pdfjs 4.x). */
async function getTextLayerClass() {
  const pdfjs = await import("pdfjs-dist");
  return pdfjs.TextLayer;
}
