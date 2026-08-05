"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Block, ParsedBook } from "@igot/parser";
import type { SelectionAction } from "@/lib/types";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { CafezinhoLogo } from "./CafezinhoLogo";
import { AuthGate } from "./AuthGate";
import { useI18n } from "./I18nProvider";
import { CloseAppButton } from "./CloseAppButton";
import { LangSwitcher } from "./LangSwitcher";
import { useTTS } from "@/hooks/useTTS";
import { getTargetLang, getAudioLang, getConfigSync } from "@/lib/config";
import { SettingsModal } from "./SettingsModal";
import { AskModal } from "./AskModal";
import { PageActionModal } from "./PageActionModal";
import { TranslateBookModal } from "./TranslateBookModal";
import { translatePageStream, explainPageStream, translateStream, explainStream, translateForSpeech } from "@/lib/ai-client";
import { blocksToText, paginateBlocks } from "@/lib/paginate";

interface ReaderProps {
  book: ParsedBook;
  /** Buffer PDF original (só pra sourceFormat === "pdf"). */
  pdfSource?: ArrayBuffer | null;
  onSelection: (action: SelectionAction) => void;
  /** Capítulo/página inicial (hidratado do IndexedDB). */
  initialChapterIdx?: number;
  /** Zoom inicial (hidratado do IndexedDB). */
  initialZoom?: number;
  /** Avisa o pai quando muda de capítulo/página (pra persistir). */
  onChapterChange?: (n: number) => void;
  /** Avisa o pai quando muda o zoom (pra persistir). */
  onZoomChange?: (z: number) => void;
  /** Fecha o livro atual (volta pro uploader). */
  onCloseBook?: () => void;
  /** Abre as configurações de IA (pra acessar em fullscreen). */
  onOpenSettings?: () => void;
  /** Settings aberto? (controla renderização do modal DENTRO do Reader). */
  settingsOpen?: boolean;
  /** Fecha o modal de settings. */
  onCloseSettings?: () => void;
  /** Callback quando salva config (pra atualizar indicador). */
  onSettingsSaved?: () => void;
  /** True se já tem configuração de IA salva (mostra indicador se falso). */
  configReady?: boolean;
  /** Traduções já prontas (chave = pageKey: "N" no PDF, "cap.pag" no EPUB). */
  translations?: Record<string, string>;
  /** Persiste a tradução de uma página (chaveada por pageKey). */
  onPageTranslation?: (pageKey: string, text: string) => void;
  /** Anotações salvas (pra abrir o modal de Notas). */
  notes?: Array<{ id: string; kind: string; source: string; result: string; savedAt: number }>;
  /** Remove uma anotação. */
  onRemoveNote?: (id: string) => void;
  /** Salva uma nota (auto-save de tradução/explicação em fullscreen). */
  onSaveNote?: (entry: { kind: "translate" | "explain" | "ask" | "summary"; source: string; result: string; chapterId?: string }) => void;
  /** Marcadores salvos (chapterIdx + timestamp). */
  bookmarks?: Array<{ chapterIdx: number; savedAt: number }>;
  /** Adiciona/remove um marcador da página atual. */
  onToggleBookmark?: (chapterIdx: number) => void;
  /** Volta pra estante (home). */
  onGoToShelf?: () => void;
  /** Painel da IA visível? (pra botão de toggle). */
  panelVisible?: boolean;
  /** Mostra/oculta o painel da IA (sem perder a ação). */
  onTogglePanel?: () => void;
  /** Auth (login Google) — pra mostrar o botão no header. */
  auth?: ReturnType<typeof import("@/lib/auth").useAuth>;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.2;

/** Limites do controle de tamanho da fonte de leitura (A−/A+). */
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 1.8;
const FONT_SCALE_STEP = 0.1;
const FONT_SCALE_KEY = "moka.fontScale";

/**
 * Painel de leitura.
 *
 * Renderiza os capítulos do livro. Quando o leitor seleciona um trecho,
 * mostra um menu flutuante (Traduzir / Explicar) que dispara `onSelection`.
 * Pra PDF: zoom + botão "Traduzir página" (overlay traduzido).
 *
 * `chapterIdx` e `zoom` são inicializados dos props `initial*` (hidratados
 * do IndexedDB no boot) e notificam o pai via `onChapterChange/onZoomChange`
 * pra persistência. Internamente continuam useState.
 */
export function Reader({
  book,
  pdfSource,
  onSelection,
  initialChapterIdx = 0,
  initialZoom = 1,
  onChapterChange,
  onZoomChange,
  onCloseBook,
  onOpenSettings,
  settingsOpen = false,
  onCloseSettings,
  onSettingsSaved,
  configReady = true,
  translations = {},
  onPageTranslation,
  notes = [],
  onRemoveNote,
  onSaveNote,
  bookmarks = [],
  onToggleBookmark,
  onGoToShelf,
  panelVisible = false,
  onTogglePanel,
  auth,
}: ReaderProps) {
  const { t, lang } = useI18n();
  const tts = useTTS();

  /** Lê a página atual em voz alta (na língua do livro). */
  const [ttsLoading, setTtsLoading] = useState(false);
  /**
   * Etapa da PREPARAÇÃO do áudio (mostrada no balão central):
   * "translate" = traduzindo o trecho pro idioma da fala;
   * "voice" = gerando a voz (TTS neural).
   */
  const [ttsPrep, setTtsPrep] = useState<null | "translate" | "voice">(null);
  /** Cronômetro da preparação (noção de quanto tá demorando). */
  const [ttsPrepSecs, setTtsPrepSecs] = useState(0);
  /** Geração da preparação: se mudar, o processo em andamento foi cancelado. */
  const ttsPrepGen = useRef(0);

  // Cronômetro do balão de preparação (roda enquanto ttsPrep != null).
  useEffect(() => {
    if (!ttsPrep) {
      setTtsPrepSecs(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(
      () => setTtsPrepSecs(Math.floor((Date.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [ttsPrep]);

  /** Cancela a preparação do áudio (balão some, nada toca). */
  const cancelTtsPrep = () => {
    ttsPrepGen.current++;
    setTtsPrep(null);
    setTtsLoading(false);
    tts.stop();
  };

  /**
   * Prepara o texto pra FALA conforme o idioma do áudio (⚙️ Config):
   *   - "original" (ou igual ao idioma do texto) → fala como está;
   *   - idioma diferente → TRADUZ PRIMEIRO na nuvem da IA e fala a
   *     tradução (ex.: livro em inglês, fala em português).
   * Devolve null se cancelado ou se a tradução falhou.
   */
  const prepareSpeech = async (
    text: string,
    textLang: string,
  ): Promise<{ text: string; lang: string } | null> => {
    const audioLang = getAudioLang();
    if (audioLang === "original" || audioLang === textLang) {
      return { text, lang: audioLang === "original" ? textLang : audioLang };
    }
    const gen = ttsPrepGen.current;
    setTtsPrep("translate");
    setTtsLoading(true);
    const res = await translateForSpeech(text, audioLang, {
      bookTitle: book.title,
      bookAuthor: book.author,
      bookLanguage: book.language,
    });
    if (gen !== ttsPrepGen.current) return null; // cancelado durante a tradução
    if (!res.ok || !res.text) {
      setTtsPrep(null);
      setTtsLoading(false);
      alert(`⚠️ ${res.error ?? "Erro."}`);
      return null;
    }
    // AUTO-SAVE: a tradução gerada pra fala também vira nota.
    onSaveNote?.({
      kind: "translate",
      source: text.length > 500 ? `${text.slice(0, 500)}…` : text,
      result: res.text,
      chapterId: chapter?.id,
    });
    return { text: res.text, lang: audioLang };
  };

  const readPageAloud = async () => {
    // Se tá pausado, CONTINUA de onde parou.
    if (tts.state === "paused") {
      tts.resume();
      return;
    }
    // Se tá tocando, PAUSA (não para — pode continuar).
    if (tts.state === "playing") {
      tts.pause();
      return;
    }
    if (ttsLoading) {
      cancelTtsPrep();
      return;
    }

    // Determina o texto a ler e o IDIOMA DELE (original do livro ou a
    // tradução visível na tela — cada um tem sua língua).
    let rawText = "";
    let textLang = "";

    if (showTranslation && pageTranslation && overlayMode === "translate") {
      rawText = pageTranslation;
      textLang = getTargetLang();
    } else {
      if (book.sourceFormat === "pdf") {
        rawText = currentPageText || chapter?.blocks.map((b) => b.text ?? "").join(" ") || "";
      } else {
        // EPUB: lê só a PÁGINA visível (não o capítulo corrido inteiro).
        rawText = blocksToText(currentBlocks, ". ");
      }
      textLang = book.language || "en";
    }

    if (!rawText.trim()) {
      alert(t("reader_no_text"));
      return;
    }

    // Se o idioma da FALA (⚙️) é diferente do idioma do texto, TRADUZ
    // PRIMEIRO na nuvem da IA — aí fala a tradução (ex.: livro em inglês,
    // fala em português). Com "original", fala no idioma do texto mesmo.
    const prepared = await prepareSpeech(rawText, textLang);
    if (!prepared) return;

    // Tenta voz NEURAL primeiro (se o provedor ativo for OpenAI — tem TTS).
    const config = getConfigSync();
    if (config && config.providerId === "openai") {
      const gen = ttsPrepGen.current;
      setTtsPrep("voice");
      setTtsLoading(true);
      await tts.speakNeural(prepared.text, prepared.lang, {
        baseUrl: "https://api.openai.com/v1",
        apiKey: config.apiKey,
        model: "tts-1",
        voice: "nova",
      });
      if (gen === ttsPrepGen.current) {
        setTtsLoading(false);
        setTtsPrep(null);
      }
      return;
    }

    // Aviso: voz neural só com OpenAI. Avisa UMA VEZ (não enche toda hora).
    const warned = typeof window !== "undefined" && sessionStorage.getItem("moka.ttsWarned") === "1";
    if (!warned) {
      sessionStorage.setItem("moka.ttsWarned", "1");
      alert(
        "🔊 Para a voz mais natural (qualidade de pessoa lendo), " +
        "configure a OpenAI como provedor nas Configurações (⚙️).\n\n" +
        "Por enquanto, será usada a voz do seu dispositivo."
      );
    }

    // Senão, usa voz NATIVA do dispositivo.
    setTtsPrep(null);
    setTtsLoading(false);
    tts.speak(prepared.text, prepared.lang);
  };
  const [chapterIdx, setChapterIdxState] = useState(initialChapterIdx);
  /** Página LOCAL dentro do capítulo (só EPUB — PDF tem 1 página por índice). */
  const [pageIdx, setPageIdx] = useState(0);
  /** Pulo pendente: ao trocar de capítulo, abre nesta página local (ex.: última ao voltar). */
  const pendingPage = useRef<number | null>(null);
  /** Janelas "Pergunte qualquer coisa" e "Resumo". */
  const [askOpen, setAskOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [transBookOpen, setTransBookOpen] = useState(false);
  /** Escala da fonte de leitura (A−/A+) — persistida no localStorage. */
  const [fontScale, setFontScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(window.localStorage.getItem(FONT_SCALE_KEY));
    return saved >= FONT_SCALE_MIN && saved <= FONT_SCALE_MAX ? saved : 1;
  });
  // Dica inicial (só 1x por livro, guardado no localStorage por título)
  const [showTip, setShowTip] = useState(false);
  const [tipStep, setTipStep] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tipKey = `moka.tipShown.${book.title}`;
    if (!window.localStorage.getItem(tipKey)) {
      // Mostra a primeira dica após 1.5s (deixa a página carregar primeiro).
      const timer = setTimeout(() => { setShowTip(true); setTipStep(0); }, 1500);
      return () => clearTimeout(timer);
    }
  }, [book.title]);
  const nextTip = () => {
    if (tipStep < 2) {
      setTipStep(tipStep + 1);
    } else {
      setShowTip(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`moka.tipShown.${book.title}`, "1");
      }
    }
  };
  const dismissTip = () => {
    setShowTip(false);
    setTipStep(0);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`moka.tipShown.${book.title}`, "1");
    }
  };
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    text: string;
    /** "above" = menu acima da seleção (padrão); "below" = quando não cabe em cima. */
    placement: "above" | "below";
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Canvas do PDF renderizado (pra snapshot/foto da página).
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Input de arquivo escondido (pra abrir novo livro direto do Reader).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(true);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  /** Entra/sai do modo tela cheia (só a página do livro visível). */
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
        setMenuVisible(false);
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
        setMenuVisible(true);
      }).catch(() => {});
    }
  };

  // Atualiza estado se sair do fullscreen via ESC ou mudar a tela.
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        setMenuVisible(true);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Garante que o menu superior fique SEMPRE visível ao abrir configurações ou ao carregar a obra.
  useEffect(() => {
    setMenuVisible(true);
  }, [book, settingsOpen]);

  /** Esta página já está marcada? (lookup rápido no array de bookmarks). */
  const isBookmarked = bookmarks.some((b) => b.chapterIdx === chapterIdx);

  /** Marca/desmarca a página atual. */
  const toggleBookmark = () => onToggleBookmark?.(chapterIdx);

  /**
   * Marcador invisível: clica no canto superior direito da página do livro
   * pra marcar/desmarcar. Zona de 60×60px discreta. Não interfere no texto.
   */
  const handleInvisibleMark = (e: React.MouseEvent) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    // Canto superior direito (60×60px).
    const inCorner =
      e.clientX > rect.right - 60 && e.clientY < rect.top + 60;
    if (inCorner) {
      e.preventDefault();
      toggleBookmark();
    }
  };

  /**
   * Print da página atual: abre um iframe escondido com o texto do capítulo
   * e dispara o diálogo de impressão do navegador. Funciona em PDF (texto
   * extraído) e EPUB (conteúdo renderizado).
   */
  const printPage = () => {
    const titleText = `${book.title} — ${
      book.sourceFormat === "pdf"
        ? t("reader_page_n", { n: chapterIdx + 1 })
        : chapter?.title || t("reader_chapter_n", { n: chapterIdx + 1 })
    }`;
    // Coleta o texto: do currentPageText (PDF extraído) ou dos blocos da
    // página visível (EPUB paginado).
    const textContent =
      book.sourceFormat === "pdf"
        ? currentPageText ||
          chapter?.blocks.map((b) => b.text ?? b.items?.join(" ") ?? "").join("\n\n") ||
          ""
        : currentBlocks
            .map((b) => {
              if (b.type === "heading") return `${"#".repeat(b.level || 1)} ${b.text}`;
              if (b.type === "list") return (b.items ?? []).map((i) => `• ${i}`).join("\n");
              if (b.type === "quote") return `> ${b.text}`;
              if (b.type === "page-break") return "---";
              return b.text ?? "";
            })
            .join("\n\n");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titleText}</title>
      <style>
        body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.7;color:#222}
        h1{font-size:18px;margin:0 0 4px}h2,h3,h4{margin:18px 0 6px}
        blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555;font-style:italic}
        @media print{body{margin:0}}
      </style></head><body><h1>${titleText}</h1>${
        book.author ? `<p style="color:#888;font-size:13px">${book.author}</p>` : ""
      }<hr><div style="white-space:pre-wrap">${escapeHtml(textContent)}</div></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    }
  };

  /**
   * Salva a página atual como imagem PNG no dispositivo do usuário.
   *
   * PDF: reaproveita o canvas em alta resolução já renderizado pelo pdfjs
   *      (inclui Retina/devicePixelRatio — fica nítido).
   * EPUB: desenha um canvas novo com a tipografia serifada do livro, fundo
   *       branco, título do capítulo e blocos de texto — uma "foto da página".
   *
   * O download usa um <a download> temporário (funciona em iOS Safari 14.5+
   * e Android Chrome). Em iOS mais antigo, abre num blob URL pra o usuário
   * segurar e salvar.
   */
  const savePageAsImage = () => {
    const safeTitle = (book.title || "livro").replace(/[^\w\u00C0-\u017F\s-]/g, "").trim().replace(/\s+/g, "_");
    const pageLabel = book.sourceFormat === "pdf" ? `pag${chapterIdx + 1}` : `cap${chapterIdx + 1}`;
    const fileName = `moka-${safeTitle}-${pageLabel}.png`;

    let canvas: HTMLCanvasElement | null = null;

    if (book.sourceFormat === "pdf" && pdfCanvasRef.current) {
      // PDF: usa o canvas já renderizado (inclui alta resolução Retina).
      canvas = pdfCanvasRef.current;
    } else {
      // EPUB: desenha a página num canvas novo.
      canvas = renderEpubToCanvas();
    }

    if (!canvas) return;

    try {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        // Dica visual antes de baixar (iOS mostra nome do arquivo).
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 2000);
      }, "image/png");
    } catch {
      // Fallback: alguns navegadores bloqueiam toBlob em canvas grande.
      alert(t("reader_photo_error"));
    }
  };

  /**
   * Desenha o conteúdo do capítulo EPUB num canvas (uma "foto da página").
   * Usa tipografia serifada, fundo branco, quebra de linha por palavra.
   * Mede o texto primeiro pra dimensionar o canvas na altura certa.
   */
  const renderEpubToCanvas = (): HTMLCanvasElement | null => {
    const ch = chapter;
    if (!ch) return null;
    // A "foto" é da PÁGINA visível (EPUB paginado), não do capítulo inteiro.
    const pageBlocks = currentBlocks;

    // Configurações tipográficas (espelham o .reader-text).
    const PAGE_W = 1000; // largura fixa em px (depois escala no CSS)
    const MARGIN = 64;
    const FONT = "20px Georgia, 'Times New Roman', serif";
    const LINE_H = 32;
    const H1_SIZE = "bold 30px Georgia, serif";
    const H1_LINE_H = 40;
    const COLOR = "#1a1a1a";
    const MUTED = "#777";

    // Mede largura do texto pra quebrar linhas.
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;
    measure.font = FONT;

    const wrapText = (text: string, maxWidth: number): string[] => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (measure!.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const maxW = PAGE_W - MARGIN * 2;
    // Constrói lista de blocos renderizáveis (tipo + linhas quebradas).
    type Block = { type: string; lines: string[] };
    const blocks: Block[] = [];
    let totalLines = 0;

    for (const b of pageBlocks) {
      let lines: string[] = [];
      let type = "p";
      if (b.type === "heading") {
        type = `h${b.level || 1}`;
        lines = wrapText(b.text ?? "", maxW);
        totalLines += lines.length + 1; // +1 espaçamento
      } else if (b.type === "list") {
        type = "li";
        for (const it of b.items ?? []) {
          const wrapped = wrapText(`• ${it}`, maxW);
          lines.push(...wrapped);
          totalLines += wrapped.length;
        }
        totalLines += 1;
      } else if (b.type === "quote") {
        type = "quote";
        lines = wrapText(b.text ?? "", maxW);
        totalLines += lines.length + 1;
      } else if (b.type === "page-break") {
        continue;
      } else {
        lines = wrapText(b.text ?? "", maxW);
        totalLines += lines.length + 1;
      }
      blocks.push({ type, lines });
    }

    // Altura do canvas = linhas * altura da linha + margens + título.
    const HEADER_H = 100; // título do livro + capítulo
    const canvasH = Math.max(800, HEADER_H + totalLines * LINE_H + MARGIN * 2);

    const canvas = document.createElement("canvas");
    const SCALE = 2; // alta nitidez (x2)
    canvas.width = PAGE_W * SCALE;
    canvas.height = canvasH * SCALE;
    canvas.style.width = `${PAGE_W}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(SCALE, SCALE);

    // Fundo branco.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, canvasH);

    // Cabeçalho: título do livro (pequeno, cinza) + capítulo (maior).
    let y = MARGIN;
    ctx.fillStyle = MUTED;
    ctx.font = "italic 14px Georgia, serif";
    ctx.fillText(book.title.slice(0, 80), MARGIN, y);
    y += 22;
    ctx.fillStyle = COLOR;
    ctx.font = H1_SIZE;
    const chTitle = ch.title || t("reader_chapter_n", { n: chapterIdx + 1 });
    ctx.fillText(chTitle.slice(0, 90), MARGIN, y);
    y += H1_LINE_H;
    // Linha separadora.
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 32;

    // Blocos de texto.
    for (const blk of blocks) {
      if (blk.type.startsWith("h")) {
        ctx.fillStyle = COLOR;
        ctx.font = blk.type === "h1" ? "bold 26px Georgia, serif" : "bold 22px Georgia, serif";
        for (const ln of blk.lines) {
          ctx.fillText(ln, MARGIN, y);
          y += LINE_H;
        }
      } else if (blk.type === "quote") {
        ctx.fillStyle = MUTED;
        ctx.font = `italic ${FONT}`;
        // Indentação pra quote.
        for (const ln of blk.lines) {
          ctx.fillText(ln, MARGIN + 20, y);
          y += LINE_H;
        }
        ctx.fillStyle = COLOR;
        ctx.font = FONT;
      } else if (blk.type === "li") {
        ctx.fillStyle = COLOR;
        ctx.font = FONT;
        for (const ln of blk.lines) {
          ctx.fillText(ln, MARGIN + 16, y);
          y += LINE_H;
        }
      } else {
        ctx.fillStyle = COLOR;
        ctx.font = FONT;
        for (const ln of blk.lines) {
          ctx.fillText(ln, MARGIN, y);
          y += LINE_H;
        }
      }
      y += 12; // espaçamento entre blocos.
    }

    // Rodapé discreto com marca.
    ctx.fillStyle = "#bbb";
    ctx.font = "12px Georgia, serif";
    ctx.fillText("Moka · Cafezinho Media Group", MARGIN, canvasH - 24);

    return canvas;
  };

  const [notesOpen, setNotesOpen] = useState(false);
  // Aba ativa no modal unificado: "notes" | "bookmarks" | "audio"
  const [notesTab, setNotesTab] = useState<"notes" | "bookmarks" | "audio">("notes");

  // --- Resultado de trecho em fullscreen (painel flutuante) ---
  const [fsResult, setFsResult] = useState<string | null>(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsAction, setFsAction] = useState<"translate" | "explain" | null>(null);

  /** Em fullscreen, processa seleção de trecho internamente (sem ir pro AIPanel externo). */
  const handleFsSelectionAction = async (
    action: "translate" | "explain",
    text: string,
  ) => {
    setFsAction(action);
    setFsLoading(true);
    setFsResult("");
    const ctx = { bookTitle: book.title, bookAuthor: book.author, bookLanguage: book.language };
    const onChunk = (full: string) => setFsResult(full);
    const res =
      action === "translate"
        ? await translateStream(text, ctx, onChunk)
        : await explainStream(text, ctx, onChunk);
    setFsLoading(false);
    if (res.ok && res.text) {
      setFsResult(res.text);
      // AUTO-SAVE: salva a tradução/explicação nas notas automaticamente.
      onSaveNote?.({
        kind: action,
        source: text,
        result: res.text,
        chapterId: chapter?.id,
      });
    } else {
      setFsResult(`⚠️ ${res.error ?? "Erro."}`);
    }
  };

  // --- Swipe horizontal: passar página passando o dedo ---
  // Threshold GENEROSO pra evitar trocas acidentais durante scroll/seleção.
  // Só vira "passar página" se o gesto for longo E claramente horizontal.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // BUG-20260723-IPAD-PAN: guarda o scrollLeft no início do gesto — se o
  // contêiner rolou na horizontal, o gesto era PAN do PDF (zoom), não
  // intenção de virar página.
  const panStartX = useRef<number | null>(null);
  const SWIPE_MIN = 80;         // mínimo de 80px pra contar como swipe
  const SWIPE_MAX_VERTICAL = 50; // se scrollou >50px na vertical, ignora (era scroll)
  // Em tela pequena (celular), só conta swipe se começou no centro da tela
  // (longe da borda esquerda/direita) pra não conflitar com o gesture de
  // "voltar" do navegador (swipe da borda).
  const EDGE_MARGIN = 30; // pixels de margem das bordas laterais

  // --- Pinch-to-zoom: pinça com 2 dedos pra aumentar/diminuir o zoom do PDF ---
  // Funciona em iPad/iPhone e Android. Mede a distância entre os 2 dedos
  // e ajusta o zoom proporcionalmente (igual Maps, Fotos, etc).
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);

  const handleTouchStart = (e: React.TouchEvent) => {
    // PINCH: se tem 2 dedos na tela, captura a distância inicial.
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchStartDist.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartZoom.current = zoom;
      touchStart.current = null; // cancela swipe enquanto faz pinch
      return;
    }
    // SWIPE (1 dedo): só registra se não tava fazendo pinch.
    if (pinchStartDist.current !== null) return;
    const t = e.touches[0];
    // Não registra swipe se começou muito na borda (gesture de voltar do sistema).
    if (t.clientX < EDGE_MARGIN || t.clientX > window.innerWidth - EDGE_MARGIN) {
      return;
    }
    // Registra SEMPRE (mesmo sobre o texto). A decisão swipe-vs-seleção
    // acontece no touchend: se há texto selecionado, era seleção; senão,
    // gesto claramente horizontal = virar página. Com a página paginada,
    // a tela é quase toda texto — travar o swipe aqui matava o gesto.
    touchStart.current = { x: t.clientX, y: t.clientY };
    panStartX.current = scrollRef.current ? scrollRef.current.scrollLeft : null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // PINCH em andamento: ajusta o zoom conforme os dedos se aproximam/afastam.
    if (pinchStartDist.current === null || e.touches.length !== 2) return;
    // Previne o pinch-to-zoom do navegador (não queremos que ele faça zoom da página,
    // e sim do nosso PDF interno).
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    // Razão entre a distância atual e a inicial = quanto cresceu/encolheu.
    const ratio = dist / pinchStartDist.current;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(pinchStartZoom.current * ratio).toFixed(2)));
    setZoom(newZoom);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Se tava fazendo pinch e soltou um dedo, termina o pinch.
    if (pinchStartDist.current !== null && e.touches.length < 2) {
      pinchStartDist.current = null;
      return;
    }
    // SWIPE (1 dedo).
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // Descarta se: gesto curto, OU scrollou muito na vertical, OU não é
    // claramente horizontal (dx precisa ser pelo menos 2x o dy).
    if (absDx < SWIPE_MIN) return;
    if (absDy > SWIPE_MAX_VERTICAL) return;
    if (absDx < absDy * 2) return;
    // Se o contêiner ROLou na horizontal durante o gesto, era PAN do PDF
    // com zoom — não vira página (BUG-20260723-IPAD-PAN). Se já estava
    // colado na borda, o scrollLeft não muda e o swipe vira página normal.
    const scrollEl = scrollRef.current;
    if (scrollEl && panStartX.current !== null &&
        Math.abs(scrollEl.scrollLeft - panStartX.current) > 5) {
      panStartX.current = null;
      return;
    }
    panStartX.current = null;
    // Se o gesto SELECIONOU texto, era seleção — não vira página.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
    if (dx > 0) goPrev(); // dedo da esquerda pra direita = anterior
    else goNext(); // dedo da direita pra esquerda = próxima
  };

  // iOS/Safari marca onTouchMove como "passive" por padrão, o que impede
  // e.preventDefault() (necessário pro pinch não disparar o zoom do navegador).
  // Este useEffect registra um listener NON-PASSIVE direto no DOM.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const preventPinch = (e: TouchEvent) => {
      // Só previne quando tem 2+ dedos (pinch). Com 1 dedo, deixa o scroll rolar.
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener("touchmove", preventPinch, { passive: false });
    return () => el.removeEventListener("touchmove", preventPinch);
  }, []);

  // Zoom e tradução de página (só fazem sentido pra PDF).
  const [zoom, setZoomState] = useState(initialZoom);
  const [pageTranslation, setPageTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"translate" | "explain" | null>(null);
  const [translatingPage, setTranslatingPage] = useState(false);
  const [currentPageText, setCurrentPageText] = useState("");

  const chapter = book.chapters[chapterIdx];
  const [pdfNumPages, setPdfNumPages] = useState(0);
  // Nav bar usa o MAIOR entre chapters.length e pdfNumPages (do PdfPageCanvas).
  // Isso garante que a barra nunca some, mesmo se chapters estiver vazio na nuvem.
  const totalChapters = Math.max(
    Array.isArray(book.chapters) ? book.chapters.length : 0,
    pdfNumPages,
  );

  // ── Paginação do EPUB ─────────────────────────────────────────────
  // PDF já é paginado por natureza (1 chapterIdx = 1 página). EPUB vinha
  // "correndo" (capítulo inteiro num scroll só) — aqui quebramos os blocos
  // de cada capítulo em páginas de ~EPUB_PAGE_CHARS caracteres.
  const isEpub = book.sourceFormat !== "pdf";
  const chapterPages = useMemo(
    () => (isEpub ? book.chapters.map((ch) => paginateBlocks(ch.blocks)) : null),
    [book, isEpub],
  );
  const pages = chapterPages ? chapterPages[chapterIdx] ?? [[]] : null;
  const safePageIdx = pages ? Math.min(pageIdx, pages.length - 1) : 0;
  /** Blocos da PÁGINA visível (EPUB: fatia do capítulo; PDF: capítulo todo). */
  const currentBlocks = pages ? pages[safePageIdx] ?? [] : chapter?.blocks ?? [];
  // Índice GLOBAL de página (soma das páginas de todos os capítulos) —
  // usado no slider, no contador e na barra de progresso.
  const pageOffsets = useMemo(() => {
    if (!chapterPages) return null;
    const offsets: number[] = [];
    let acc = 0;
    for (const p of chapterPages) {
      offsets.push(acc);
      acc += p.length;
    }
    return { offsets, total: acc };
  }, [chapterPages]);
  const totalPages = pageOffsets?.total ?? totalChapters;
  const globalPageIdx = pageOffsets ? pageOffsets.offsets[chapterIdx] + safePageIdx : chapterIdx;
  /** Chave da página pra mapa de traduções: "3" (PDF) ou "2.4" (EPUB cap.pag). */
  const pageKey = isEpub ? `${chapterIdx + 1}.${safePageIdx + 1}` : String(chapterIdx + 1);
  /** Rótulo amigável da página (pra modais de resumo/foto). */
  const pageLabel =
    book.sourceFormat === "pdf"
      ? t("reader_page_n", { n: chapterIdx + 1 })
      : `${chapter?.title || t("reader_chapter_n", { n: chapterIdx + 1 })} · ${t("reader_page_n", { n: safePageIdx + 1 })}`;

  /**
   * Compilação de trechos do livro inteiro (pro resumo 📚): título de cada
   * capítulo + o começo do seu texto, limitado a ~12k chars totais pra não
   * explodir o gasto de tokens. O prompt avisa que é uma amostra.
   */
  const buildBookCompilation = (): string => {
    const MAX_TOTAL = 12000;
    const PER_CHAPTER = 900;
    const parts: string[] = [];
    let size = 0;
    for (const ch of book.chapters) {
      const text = blocksToText(ch.blocks, " ").trim();
      if (!text) continue;
      const part = `### ${ch.title}\n${text.slice(0, PER_CHAPTER)}`;
      if (size + part.length > MAX_TOTAL) break;
      parts.push(part);
      size += part.length;
    }
    return parts.join("\n\n");
  };

  // Wrappers que atualizam o estado E avisam o pai (pra persistir).
  const setChapterIdx = (n: number | ((prev: number) => number)) => {
    setChapterIdxState((prev) => {
      const next = typeof n === "function" ? n(prev) : n;
      onChapterChange?.(next);
      return next;
    });
  };
  const setZoom = (n: number | ((prev: number) => number)) => {
    setZoomState((prev) => {
      const next = typeof n === "function" ? n(prev) : n;
      onZoomChange?.(next);
      return next;
    });
  };

  // Navegação por PÁGINA: no EPUB anda primeiro pelas páginas locais do
  // capítulo; na fronteira, troca de capítulo (indo pro fim/início dele).
  const goPrev = () => {
    if (pages && safePageIdx > 0) {
      setPageIdx((p) => p - 1);
      return;
    }
    if (chapterIdx > 0) {
      if (pages && chapterPages) {
        pendingPage.current = chapterPages[chapterIdx - 1].length - 1;
      }
      setChapterIdx((i) => Math.max(0, i - 1));
    }
  };
  const goNext = () => {
    if (pages && safePageIdx < pages.length - 1) {
      setPageIdx((p) => p + 1);
      return;
    }
    setChapterIdx((i) => Math.min(totalChapters - 1, i + 1));
  };

  /** Slider global: converte o índice global de página em (capítulo, página local). */
  const goToGlobalPage = (g: number) => {
    if (!chapterPages || !pageOffsets) {
      setChapterIdx(g);
      return;
    }
    let target = chapterPages.length - 1;
    for (let i = 0; i < chapterPages.length; i++) {
      if (g < pageOffsets.offsets[i] + chapterPages[i].length) {
        target = i;
        break;
      }
    }
    const local = g - pageOffsets.offsets[target];
    if (target === chapterIdx) {
      setPageIdx(local);
    } else {
      pendingPage.current = local;
      setChapterIdx(target);
    }
  };

  // Ao trocar de CAPÍTULO: abre na página local pendente (navegação entre
  // capítulos) ou recomeça da primeira.
  useEffect(() => {
    setPageIdx(pendingPage.current ?? 0);
    pendingPage.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdx]);

  // Ao trocar de PÁGINA (capítulo ou página local): RESTAURA do mapa de
  // traduções se houver tradução salva pra essa página (não re-traduz).
  // No EPUB, também define o "texto da página" = só o que está na tela
  // (alimenta traduzir/explicar página, TTS e resumo) e rola pro topo.
  useEffect(() => {
    const saved = translations[pageKey];
    if (saved) {
      setPageTranslation(saved);
      setShowTranslation(false);
    } else {
      setPageTranslation(null);
      setShowTranslation(false);
    }
    setOverlayMode(null);
    if (isEpub) {
      setCurrentPageText(blocksToText(currentBlocks, "\n\n"));
      scrollRef.current?.scrollTo({ top: 0 });
    } else {
      setCurrentPageText("");
    }
    setMenu(null);
    clearCustomHighlight(); // limpa highlight ao trocar de página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdx, safePageIdx]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  /** A−/A+ da FONTE (EPUB): a "chave de zoom" do canto superior direito. */
  const bumpFont = (dir: 1 | -1) => {
    const next = +Math.min(
      FONT_SCALE_MAX,
      Math.max(FONT_SCALE_MIN, fontScale + dir * FONT_SCALE_STEP),
    ).toFixed(2);
    setFontScale(next);
    window.localStorage.setItem(FONT_SCALE_KEY, String(next));
  };

  // Traduz OU explica a página inteira. Estados SEPARADOS — um botão não
  // ativa o outro. overlayMode rastreia qual ação está sendo mostrada.
  const handlePageAction = async (action: "translate" | "explain") => {
    // Se já estamos mostrando ESTA ação, toggle (esconde).
    if (overlayMode === action && showTranslation) {
      setShowTranslation(false);
      return;
    }
    // Se tem tradução salva e é translate, mostra ela sem re-traduzir.
    // (Erro "⚠️ …" NÃO é tradução salva: clicar de novo TENTA DE NOVO.)
    if (
      action === "translate" &&
      pageTranslation &&
      !pageTranslation.startsWith("⚠️") &&
      overlayMode !== "explain"
    ) {
      setOverlayMode("translate");
      setShowTranslation(true);
      return;
    }
    if (!currentPageText || translatingPage) return;

    setTranslatingPage(true);
    setOverlayMode(action);
    setPageTranslation("");
    setShowTranslation(true);

    const ctx = {
      bookTitle: book.title,
      bookAuthor: book.author,
      bookLanguage: book.language,
    };
    const onChunk = (full: string) => setPageTranslation(full);

    const result =
      action === "translate"
        ? await translatePageStream(currentPageText, ctx, onChunk)
        : await explainPageStream(currentPageText, ctx, onChunk);

    setTranslatingPage(false);
    if (result.ok && result.text) {
      setPageTranslation(result.text);
      if (action === "translate") {
        onPageTranslation?.(pageKey, result.text);
      }
      // AUTO-SAVE: toda tradução/explicação de página inteira vai pra notas.
      // O source traz o trecho original da página (truncado pra não ficar enorme).
      const sourcePreview = currentPageText.length > 500
        ? `${currentPageText.slice(0, 500)}…`
        : currentPageText;
      onSaveNote?.({
        kind: action,
        source: sourcePreview,
        result: result.text,
        chapterId: chapter?.id,
      });
    } else {
      setPageTranslation(`⚠️ ${result.error ?? "Erro."}`);
    }
  };

  /** Atalho pra traduzir. */
  const handleTranslatePage = () => handlePageAction("translate");

  /** Rótulo dinâmico do botão conforme o estado. */
  const translateBtnLabel = translatingPage && overlayMode === "translate"
    ? t("reader_translating")
      : pageTranslation && overlayMode === "translate"
      ? showTranslation
        ? t("reader_view_original")
        : t("reader_view_translation")
      : t("reader_translate_page");

  /** Versão SÓ ÍCONE do botão de tradução (cabe numa linha só).
   *  O texto completo vai no `title` (tooltip ao passar o dedo/mouse). */
  const translateIcon = translatingPage && overlayMode === "translate"
    ? "⏳"
    : pageTranslation && overlayMode === "translate"
      ? showTranslation ? "📖" : "🌐"
      : "🌐";

  // Detecta seleção dentro do conteúdo e, se houver texto, mostra o menu.
  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setMenu(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 2) {
      setMenu(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const menuW = 300;
    const menuH = 52;
    const contW = containerRect?.width ?? 800;
    const rawX = rect.right - (containerRect?.left ?? 0);
    const clampedX = Math.max(menuW / 2 + 8, Math.min(contW - menuW / 2 - 8, rawX - menuW / 2));
    const relTop = rect.top - (containerRect?.top ?? 0);
    const placement: "above" | "below" = relTop < menuH + 16 ? "below" : "above";
    const y = placement === "above" ? relTop - 12 : rect.bottom - (containerRect?.top ?? 0) + 12;
    setMenu({ x: clampedX, y: Math.max(20, y), text, placement });
  };

  /**
   * Botão "⇤" do menu de seleção: move o INÍCIO da seleção pro começo do
   * parágrafo onde ela começa, mantendo o fim. Saída determinística pra
   * quando a alça do iOS escorrega — não depende de heurística nenhuma.
   */
  const snapSelectionStartToParagraph = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl =
      range.startContainer.nodeType === 1
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    const startBlock = startEl?.closest(
      "p, h1, h2, h3, h4, h5, h6, blockquote, li",
    );
    if (!startBlock) return;
    const newRange = range.cloneRange();
    newRange.setStart(startBlock, 0);
    sel.removeAllRanges();
    sel.addRange(newRange);
    handleSelection(); // reabre o menu com o texto corrigido
  };

  /**
   * Botão "¶" do menu de seleção: expande a seleção pro(s) parágrafo(s)
   * inteiro(s) que ela toca. Útil no iOS, onde a alça inicial às vezes
   * "escorrega" pra segunda linha — um toque corrige sem brigar com a alça.
   */
  const expandSelectionToParagraph = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const asEl = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);
    const startBlock = asEl(range.startContainer)?.closest(
      "p, h1, h2, h3, h4, h5, h6, blockquote, li",
    );
    const endBlock = asEl(range.endContainer)?.closest(
      "p, h1, h2, h3, h4, h5, h6, blockquote, li",
    );
    if (!startBlock || !endBlock) return;
    const newRange = document.createRange();
    newRange.setStart(startBlock, 0);
    newRange.setEnd(endBlock, endBlock.childNodes.length);
    sel.removeAllRanges();
    sel.addRange(newRange);
    handleSelection(); // reabre o menu já com o texto completo
  };

  /**
   * Escuta mudanças de seleção no documento (funciona em mouse E touch).
   * No iPad/touch puro, o onMouseUp às vezes não dispara depois de arrastar
   * pra selecionar — o selectionchange é o evento confiável. Mostra o menu
   * quando a seleção estabiliza (debounce curto: 180ms pra aparecer antes do
   * menu nativo do iOS, que costuma demorar ~300ms).
   */
  // Guard: ignora o próximo selectionchange causado pelo NOSSO removeAllRanges.
  const ignoreNextSelChange = useRef(false);

  /** Limpa o highlight customizado (chamar ao trocar página/fechar menu). */
  const clearCustomHighlight = useCallback(() => {
    if (typeof CSS !== "undefined" && "highlights" in CSS) {
      (CSS as any).highlights.delete("moka-sel");
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      // Guard: se fomos nós que limpamos a seleção, ignora o evento.
      if (ignoreNextSelChange.current) {
        ignoreNextSelChange.current = false;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setMenu(null);
          clearCustomHighlight();
          return;
        }
        const text = sel.toString().trim();
        if (!text || text.length < 2) {
          setMenu(null);
          clearCustomHighlight();
          return;
        }
        // Só mostra o menu se a seleção está DENTRO do reader.
        const range = sel.getRangeAt(0);
        if (!containerRef.current?.contains(range.commonAncestorContainer)) {
          return;
        }
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        const menuW = 300;
        const menuH = 52;
        const rawX = rect.right - (containerRect?.left ?? 0);
        const contW = containerRect?.width ?? 800;
        const clampedX = Math.max(menuW / 2 + 8, Math.min(contW - menuW / 2 - 8, rawX - menuW / 2));
        const relTop = rect.top - (containerRect?.top ?? 0);
        const placement: "above" | "below" = relTop < menuH + 16 ? "below" : "above";
        const y = placement === "above" ? relTop - 12 : rect.bottom - (containerRect?.top ?? 0) + 12;

        // NÃO limpa a seleção nem usa removeAllRanges (quebra a seleção no iOS).
        // O menu nativo pode aparecer junto, mas nosso menu tem z-index alto
        // e posição diferente (acima/direita) pra não conflitar tanto.
        // No celular, o menu nosso fica no rodapé (longe do nativo).
        setMenu({ x: clampedX, y: Math.max(20, y), text, placement });
      }, 500);
    };
    document.addEventListener("selectionchange", check);
    return () => {
      document.removeEventListener("selectionchange", check);
      if (timer) clearTimeout(timer);
    };
  }, [clearCustomHighlight]);

  /**
   * ASSISTENTE anti-escorregão (iOS): ao SOLTAR o dedo, se a seleção
   * começou logo depois da 1ª palavra do parágrafo (assinatura clássica
   * do deslize: o iOS re-ancora a alça no começo da palavra 2 por causa
   * das caixas de linha altas), estica o início de volta pro começo do
   * parágrafo. Só age no FIM do gesto — mexer na seleção DURANTE o
   * arraste quebra a alça do iOS. Se o usuário realmente quiser começar
   * na 2ª palavra, o botão ¶ e um novo arraste continuam disponíveis.
   */
  useEffect(() => {
    const fixSlippedStart = () => {
      // Pequeno atraso: no touchend a seleção ainda está assentando.
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const startEl =
          range.startContainer.nodeType === 1
            ? (range.startContainer as Element)
            : range.startContainer.parentElement;
        const block = startEl?.closest(
          "p, h1, h2, h3, h4, h5, h6, blockquote, li",
        );
        if (!block || !containerRef.current?.contains(block)) return;
        // Texto entre o começo do parágrafo e o começo da seleção.
        const pre = document.createRange();
        pre.selectNodeContents(block);
        pre.setEnd(range.startContainer, range.startOffset);
        const prefix = pre.toString();
        // Caso 1 — deslize clássico: ficou de fora só a 1ª palavra.
        if (/^\S+\s+$/.test(prefix)) {
          const fixed = range.cloneRange();
          fixed.setStart(block, 0);
          sel.removeAllRanges();
          sel.addRange(fixed);
          handleSelection(); // reabre o menu com o texto corrigido
          return;
        }
        // Caso 2 — a âncora caiu no FIM do parágrafo ANTERIOR (arrastou
        // pro vão e o iOS ancorou pra cima) e a seleção segue pro bloco
        // seguinte. Mover o início pro começo do próximo bloco não perde
        // texto nenhum (do bloco atual nada foi selecionado).
        const post = document.createRange();
        post.selectNodeContents(block);
        post.setStart(range.startContainer, range.startOffset);
        const next = block.nextElementSibling;
        if (
          post.toString().trim() === "" &&
          next?.matches("p, h1, h2, h3, h4, h5, h6, blockquote, li") &&
          !block.contains(range.endContainer)
        ) {
          const fixed = range.cloneRange();
          fixed.setStart(next, 0);
          sel.removeAllRanges();
          sel.addRange(fixed);
          handleSelection();
        }
      }, 60);
    };
    document.addEventListener("touchend", fixSlippedStart, { passive: true });
    document.addEventListener("mouseup", fixSlippedStart);
    return () => {
      document.removeEventListener("touchend", fixSlippedStart);
      document.removeEventListener("mouseup", fixSlippedStart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Toque duplo (double-click/double-tap): seleciona o parágrafo inteiro
   * sob o cursor. Muito útil em touch, onde arrastar pra selecionar é
   * impreciso. Encontra o ancestral <p> (ou block mais próximo) e seleciona
   * todo o seu conteúdo, depois dispara o menu Traduzir/Explicar.
   */
  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Sobe até achar um parágrafo, heading, quote ou listItem.
    const block = target.closest("p, h1, h2, h3, h4, h5, h6, blockquote, li, span");
    if (!block) return;

    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(block);
    sel.removeAllRanges();
    sel.addRange(range);

    // Dispara o menu na posição do parágrafo.
    const rect = block.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const text = sel.toString().trim();
    if (text.length >= 2) {
      const menuW = 300;
      const menuH = 52;
      const contW = containerRect?.width ?? 800;
      const rawX = rect.right - (containerRect?.left ?? 0);
      const clampedX = Math.max(menuW / 2 + 8, Math.min(contW - menuW / 2 - 8, rawX - menuW / 2));
      const relTop = rect.top - (containerRect?.top ?? 0);
      const placement: "above" | "below" = relTop < menuH + 16 ? "below" : "above";
      const y = placement === "above" ? relTop - 12 : rect.bottom - (containerRect?.top ?? 0) + 12;
      setMenu({ x: clampedX, y: Math.max(20, y), text, placement });
    }
  };

  const fire = (type: "translate" | "explain") => {
    if (!menu) return;
    if (isFullscreen) {
      // Em fullscreen, processa internamente (painel flutuante).
      handleFsSelectionAction(type, menu.text);
    } else {
      // Normal: manda pro AIPanel externo.
      onSelection({
        type,
        text: menu.text,
        chapterId: chapter?.id,
      });
    }
    setMenu(null);
    clearCustomHighlight();
    window.getSelection()?.removeAllRanges();
  };

  /** Lê um trecho selecionado em voz alta (neural ou nativa). */
  const fireSpeak = async (text: string) => {
    setMenu(null);
    clearCustomHighlight();
    window.getSelection()?.removeAllRanges();
    if (tts.state === "playing") tts.stop();

    // Respeita o idioma da fala: se for diferente do livro, traduz antes.
    const prepared = await prepareSpeech(text, book.language || "en");
    if (!prepared) return;

    const config = getConfigSync();
    if (config && config.providerId === "openai") {
      const gen = ttsPrepGen.current;
      setTtsPrep("voice");
      setTtsLoading(true);
      await tts.speakNeural(prepared.text, prepared.lang, {
        baseUrl: "https://api.openai.com/v1",
        apiKey: config.apiKey,
        model: "tts-1",
        voice: "nova",
      });
      if (gen === ttsPrepGen.current) {
        setTtsLoading(false);
        setTtsPrep(null);
      }
    } else {
      setTtsPrep(null);
      setTtsLoading(false);
      tts.speak(prepared.text, prepared.lang);
    }
  };

  /** Para o áudio completamente (diferente de pausar). */
  const stopTTS = () => {
    cancelTtsPrep();
  };

  const renderedBlocks = useMemo(
    () => currentBlocks.map((b) => <BlockView key={b.id} block={b} />),
    [currentBlocks],
  );

  return (
    <section className="reader" ref={containerRef} data-menu-hidden={!menuVisible}>
      {/* Botão flutuante da xicrinha (☕) para reexibir o menu quando oculto */}
      {!menuVisible && (
        <button
          onClick={() => setMenuVisible(true)}
          className="moka-teacup-float-btn"
          title={t("reader_show_menu")}
          aria-label={t("reader_show_menu")}
        >
          ☕
        </button>
      )}

      <header className="reader-header" data-hidden={!menuVisible}>
        {/* ── Menu: row-scroll (ações do livro, scrollável) + row-right (controles, fixo) ── */}
        <div className="reader-row-main">
        <div className="reader-row-scroll">
          {/* Logo Cafezinho — canto esquerdo, vai para a home central (/) */}
          <a
            href="/"
            className="cafezinho-mark"
            title="Moka — Ir para página central"
            aria-label="Moka — Ir para página central"
          >
            <CafezinhoLogo size={26} opacity={0.85} />
          </a>
          {/* ➕ Abrir novo arquivo (dispara seletor de arquivo direto) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="icon-btn"
            title={t("reader_open_new")}
            aria-label={t("reader_open_new")}
          >
            ➕
          </button>
          {/* 📚 Estante */}
          <button
            onClick={() => onGoToShelf?.()}
            className="icon-btn"
            title={t("reader_shelf")}
            aria-label={t("reader_shelf")}
          >
            📚
          </button>
          {/* 📓 Notas */}
          <button
            onClick={() => setNotesOpen(true)}
            className="icon-btn"
            title={t("reader_notes")}
            aria-label={t("reader_notes")}
          >
            📓 {notes.length > 0 && <span className="badge">{notes.length}</span>}
          </button>
          {/* 🏷 Marcar página */}
          <button
            onClick={toggleBookmark}
            className={`icon-btn ${isBookmarked ? "active" : ""}`}
            title={isBookmarked ? t("reader_bookmark_remove") : t("reader_bookmark")}
            aria-label={t("reader_bookmark")}
            aria-pressed={isBookmarked}
          >
            {isBookmarked ? "🔖" : "🏷"}
          </button>
          {/* 📸 Foto (com confirmação antes de baixar) */}
          <button
            onClick={() => {
              if (confirm(t("reader_confirm_photo", { page: pageLabel }))) {
                savePageAsImage();
              }
            }}
            className="icon-btn"
            title={t("reader_photo")}
            aria-label={t("reader_photo")}
          >
            📸
          </button>
          {/* 🔊 Ler em voz alta (TTS) — neural (IA) ou nativa */}
          <button
            onClick={() => {
              // Se já tá tocando/pausado, controla pause/resume direto.
              if (tts.state === "paused") { tts.resume(); return; }
              if (tts.state === "playing") { tts.pause(); return; }
              // Se tá parado, pede confirmação antes de gerar áudio.
              if (confirm(t("reader_confirm_audio"))) {
                readPageAloud();
              }
            }}
            className={`icon-btn ${tts.state !== "idle" || ttsLoading ? "active" : ""}`}
            title={
              ttsLoading ? t("reader_preparing_audio")
              : tts.state === "playing" ? t("reader_pause")
              : tts.state === "paused" ? t("reader_resume")
              : t("reader_read_aloud")
            }
            aria-label={t("reader_read_aloud")}
            disabled={!tts.supported}
          >
            {ttsLoading ? "⏳" : tts.state === "playing" ? "⏸" : tts.state === "paused" ? "▶️" : "🔊"}
          </button>
          {/* 🎤✒️ Perguntar qualquer coisa — abre a janelinha de pergunta
              (por voz OU escrevendo) sobre o livro. Funciona até em fullscreen. */}
          <button
            onClick={() => setAskOpen(true)}
            className="icon-btn"
            title={t("reader_ask_anything")}
            aria-label={t("reader_ask_anything")}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* microfone */}
              <rect x="6" y="2" width="6" height="10.5" rx="3" />
              <path d="M3.5 10.5a5.5 5.5 0 0 0 9.4 3.9" />
              {/* caneta (canto inferior direito) */}
              <path
                d="M14.2 20.4l4.9-4.9a1.56 1.56 0 0 1 2.2 2.2l-4.9 4.9-2.9.7z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
          {/* 📝 ANOTAR — Resumir ou Explicar a página inteira, com barra
              deslizante de tamanho (pedido do Miguel, 2026-08-01: antes eram
              dois ícones 📝+🧠 — redundância cortada). Resumo cobre também
              o livro inteiro. */}
          <button
            onClick={() => setSummaryOpen(true)}
            className="icon-btn"
            title={t("pa_title")}
            aria-label={t("pa_title")}
          >
            📝
          </button>
          {/* 🌐 Traduzir a PÁGINA NA TELA (só ícone + confirmação).
              SEMPRE renderizado: antes só aparecia com (isEpub||pdfSource)
              e SUMIA em PDF enquanto o arquivo carregava — pedaço do bug
              crônico do menu. Sem texto ainda, fica só desabilitado.
              PDF: texto extraído da página renderizada.
              EPUB: texto da página local visível (nunca o livro inteiro). */}
          <button
            onClick={() => {
              if (overlayMode === "translate" && showTranslation) {
                setShowTranslation(false);
                return;
              }
              if (confirm(t("reader_confirm_translate_page"))) {
                handleTranslatePage();
              }
            }}
            disabled={translatingPage || !currentPageText}
            className={`icon-btn ${overlayMode === "translate" && showTranslation ? "active" : ""}`}
            title={translateBtnLabel}
            aria-label={translateBtnLabel}
          >
            {translatingPage && overlayMode === "translate" ? "⏳" : "🌐"}
          </button>
          {/* 🌍 Traduzir o LIVRO INTEIRO em volumes de ~50 páginas.
              Cada volume vira um EPUB (baixado) + livro na estante;
              depois dá pra integrar tudo num livro único. Só EPUB. */}
          {isEpub && (
            <button
              onClick={() => setTransBookOpen(true)}
              className="icon-btn"
              title={t("tb_icon")}
              aria-label={t("tb_icon")}
            >
              🌍
            </button>
          )}
          {/* ⏹ Stop áudio (só aparece quando tem áudio rolando) */}
          {(tts.state !== "idle" || ttsLoading) && (
            <button
              onClick={stopTTS}
              className="icon-btn tts-stop-btn"
              title={t("reader_stop")}
              aria-label={t("reader_stop")}
            >
              ⏹
            </button>
          )}
        </div>
        {/* Fim reader-row-scroll. Início reader-row-right (controles fixos). */}
          <div className="reader-row-right">
            <LangSwitcher />
            {/* ❓ Ajuda */}
            <a
              href="/ajuda"
              target="_blank"
              rel="noreferrer"
              className="icon-btn"
              title={t("help_title")}
              aria-label={t("help_title")}
              style={{ textDecoration: "none", color: "var(--text)" }}
            >
              ❓
            </a>
            {/* ⚙️ Configurações */}
            {onOpenSettings && (
              <button
                onClick={() => {
                  setMenuVisible(true);
                  onOpenSettings();
                }}
                className={`icon-btn settings-gear ${configReady ? "" : "unset"}`}
                title={t("reader_settings")}
                aria-label={t("settings")}
              >
                ⚙️
              </button>
            )}
            {/* 👤 Login (AuthGate: Google OU e-mail — modal com as duas portas) */}
            {auth && <AuthGate />}
            {/* 🗐 Tela cheia */}
            <button
              onClick={toggleFullscreen}
              className="icon-btn"
              title={isFullscreen ? t("reader_exit_fullscreen") : t("reader_fullscreen")}
              aria-label={isFullscreen ? t("reader_exit_fullscreen") : t("reader_fullscreen")}
            >
              {isFullscreen ? "🗗" : "⛶"}
            </button>
            {/* 👁 Ocultar menu (leitura imersiva) — o ícone precisa dizer o
                que faz: antes era ☕ (a marca!), e o usuário tocava sem querer
                achando que era "menu do Moka" → o menu sumia do nada (bug
                crônico reportado pelo Miguel, 2026-08-01). O ☕ ficou só no
                botão flutuante que TRAZ o menu de volta. */}
            <button
              onClick={() => setMenuVisible((v) => !v)}
              className="icon-btn menu-toggle-btn"
              title={menuVisible ? t("reader_hide_menu") : t("reader_show_menu")}
              aria-label={menuVisible ? t("reader_hide_menu") : t("reader_show_menu")}
            >
              {menuVisible ? "👁" : "🙈"}
            </button>
          </div>
        </div>

        {/* Barra de progresso de leitura (estilo Kindle) */}
        <div className="reader-progress" aria-hidden>
          <div
            className="reader-progress-bar"
            style={{ width: `${totalPages > 0 ? ((globalPageIdx + 1) / totalPages) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* Zoom VERTICAL no canto superior direito — pra TODO livro:
          PDF: +/− dão zoom na página. EPUB: +/− aumentam/reduzem a FONTE.
          Some quando o menu é ocultado (fullscreen). */}
      <div className="zoom-rail" data-hidden={!menuVisible} title={t("reader_zoom")}>
        <button
          onClick={() => (isEpub ? bumpFont(1) : zoomIn())}
          disabled={isEpub ? fontScale >= FONT_SCALE_MAX : zoom >= MAX_ZOOM}
          aria-label={isEpub ? t("reader_font_increase") : t("reader_zoom_in")}
          title={isEpub ? t("reader_font_increase") : t("reader_zoom_in")}
          className="zoom-rail-btn"
        >
          +
        </button>
        <button
          onClick={() => (isEpub ? bumpFont(-1) : zoomOut())}
          disabled={isEpub ? fontScale <= FONT_SCALE_MIN : zoom <= MIN_ZOOM}
          aria-label={isEpub ? t("reader_font_decrease") : t("reader_zoom_out")}
          title={isEpub ? t("reader_font_decrease") : t("reader_zoom_out")}
          className="zoom-rail-btn"
        >
          −
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`reader-scroll ${book.sourceFormat === "pdf" ? "pdf-mode" : ""}`}
        onDoubleClick={handleDoubleClick}
        onClick={handleInvisibleMark}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {book.sourceFormat === "pdf" && pdfSource ? (
          <PdfPageCanvas
            data={pdfSource}
            pageNum={chapterIdx + 1}
            zoom={zoom}
            translationOverlay={pageTranslation}
            showTranslation={showTranslation}
            translating={translatingPage}
            onPageText={setCurrentPageText}
            onCanvasReady={(c) => (pdfCanvasRef.current = c)}
            onNumPages={setPdfNumPages}
          />
        ) : showTranslation && overlayMode === "translate" ? (
          /* Tradução da página inteira em EPUB: troca o conteúdo da área da
             página. BUG (Miguel, 04/08 — "cliquei, veio a ampulheta e não
             traduziu"): antes a tradução só aparecia em PDF; em EPUB o
             resultado nunca era renderizado. E a espera agora é EXPLÍCITA:
             a página toda mostra o estado (pedido do Miguel). */
          <article
            className="reader-text"
            style={{ fontSize: `calc(var(--text-lg) * ${fontScale})` }}
          >
            {translatingPage && !pageTranslation ? (
              <div className="page-ai-waiting">
                <div className="page-ai-spinner" />
                <strong>{t("reader_translating_page")}</strong>
                <span>{t("reader_translating_page_sub")}</span>
              </div>
            ) : pageTranslation?.startsWith("⚠️") ? (
              <div className="page-ai-error">{pageTranslation}</div>
            ) : (
              (pageTranslation ?? "").split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))
            )}
          </article>
        ) : (
          <article
            className="reader-text"
            style={{ fontSize: `calc(var(--text-lg) * ${fontScale})` }}
          >
            {renderedBlocks}
          </article>
        )}
      </div>

      {/* Barra de navegação rápida — slider horizontal pra pular páginas.
          Sempre mostra (mesmo com 1 página) pra não sumir em nenhum caso. */}
      {totalPages >= 1 && (
        <div className="reader-nav-bar">
          <button onClick={goPrev} disabled={globalPageIdx === 0} aria-label={t("reader_nav_prev")}>
            ‹
          </button>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={globalPageIdx}
            onChange={(e) => goToGlobalPage(Number(e.target.value))}
            className="nav-slider"
            aria-label={t("reader_nav_label")}
          />
          <button
            onClick={goNext}
            disabled={globalPageIdx >= totalPages - 1}
            aria-label={t("reader_nav_next")}
          >
            ›
          </button>
          <span className="nav-counter-bottom">
            {globalPageIdx + 1}/{totalPages}
          </span>
        </div>
      )}

      {menu && (
        <div
          className={`selection-menu ${menu.placement === "below" ? "placement-below" : "placement-above"}`}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button onClick={snapSelectionStartToParagraph} role="menuitem">
            {t("reader_sel_from_start")}
          </button>
          <button onClick={expandSelectionToParagraph} role="menuitem">
            {t("reader_sel_paragraph")}
          </button>
          <button onClick={() => fire("translate")} role="menuitem">
            {t("reader_sel_translate")}
          </button>
          <button onClick={() => fire("explain")} role="menuitem">
            {t("reader_sel_explain")}
          </button>
          <button onClick={() => fireSpeak(menu.text)} role="menuitem">
            🔊 {t("reader_sel_speak")}
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(menu.text).catch(() => {});
              setMenu(null);
              clearCustomHighlight();
            }}
            role="menuitem"
          >
            📋 {t("reader_sel_copy")}
          </button>
          <button
            className="selection-menu-close"
            onClick={() => { setMenu(null); clearCustomHighlight(); window.getSelection()?.removeAllRanges(); }}
            role="menuitem"
            aria-label={t("close")}
            title={t("close")}
          >
            ✕
          </button>
        </div>
      )}

      {/* DICA INICIAL — só 1x por livro, 3 passos */}
      {showTip && (
        <div className="tip-overlay" onClick={dismissTip}>
          <div className="tip-balloon" onClick={(e) => e.stopPropagation()}>
            {tipStep === 0 && (
              <>
                <span className="tip-emoji">👆</span>
                <p className="tip-text">{t("reader_tip_selection")}</p>
                <p className="tip-subtext">{t("reader_tip_selection_sub")}</p>
              </>
            )}
            {tipStep === 1 && (
              <>
                <span className="tip-emoji">🔊</span>
                <p className="tip-text">{t("reader_tip_audio")}</p>
                <p className="tip-subtext">{t("reader_tip_audio_sub")}</p>
              </>
            )}
            {tipStep === 2 && (
              <>
                <span className="tip-emoji">🌐</span>
                <p className="tip-text">{t("reader_tip_translate")}</p>
                <p className="tip-subtext">{t("reader_tip_translate_sub")}</p>
              </>
            )}
            <div className="tip-dots">
              <span className={tipStep === 0 ? "tip-dot active" : "tip-dot"} />
              <span className={tipStep === 1 ? "tip-dot active" : "tip-dot"} />
              <span className={tipStep === 2 ? "tip-dot active" : "tip-dot"} />
            </div>
            <div className="tip-buttons">
              <button className="tip-skip" onClick={dismissTip}>{t("reader_tip_skip")}</button>
              <button className="tip-btn" onClick={nextTip}>
                {tipStep < 2 ? t("reader_tip_next") : t("reader_tip_ok")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BALÃO CENTRAL de loading do áudio — chama atenção, some quando entra.
          Mostra a ETAPA (traduzindo pra falar / gerando voz), o cronômetro
          e um botão de cancelar. */}
      {ttsLoading && (
        <div className="tts-loading-overlay">
          <div className="tts-loading-balloon">
            <div className="tts-loading-anim">
              <span className="tts-dot" />
              <span className="tts-dot" />
              <span className="tts-dot" />
            </div>
            <p className="tts-loading-text">
              {ttsPrep === "translate" ? t("reader_tts_translating") : t("reader_preparing_audio")}
            </p>
            <span className="tts-loading-secs">{ttsPrepSecs}s</span>
            <button
              className="tts-loading-cancel"
              onClick={cancelTtsPrep}
              aria-label={t("cancel")}
              title={t("cancel")}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Painel flutuante de resultado em FULLSCREEN (tradução/explicação de trecho) */}
      {isFullscreen && (fsResult !== null || fsLoading) && (
        <div className="fs-result-panel">
          <div className="fs-result-header">
            <span>{fsAction === "translate" ? t("reader_fs_translation") : t("reader_fs_explanation")}</span>
            <button onClick={() => { setFsResult(null); setFsAction(null); }}>✕</button>
          </div>
          <div className="fs-result-body">
            {fsLoading && !fsResult && <p>{t("reader_processing")}</p>}
            {fsResult && <p>{fsResult}</p>}
          </div>
        </div>
      )}

      {/* Botão flutuante pra re-mostrar o menu quando oculto em fullscreen */}
      {isFullscreen && !menuVisible && (
        <button
          onClick={() => setMenuVisible(true)}
          className="fs-show-menu-btn"
          title={t("reader_show_menu")}
          aria-label={t("reader_show_menu")}
        >
          <CafezinhoLogo size={22} opacity={0.9} />
        </button>
      )}

      {/* Modal UNIFICADO: Anotações + Marcadores + Áudios (3 abas) */}
      {notesOpen && (
        <div className="notes-overlay" onClick={() => setNotesOpen(false)}>
          <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
            <header className="notes-header">
              <h2>📓 {t("reader_notes_title")}</h2>
              <button onClick={() => setNotesOpen(false)} aria-label={t("close")}>✕</button>
            </header>
            {/* Abas */}
            <div className="notes-tabs">
              <button
                className={`notes-tab ${notesTab === "notes" ? "active" : ""}`}
                onClick={() => setNotesTab("notes")}
              >
                📝 {t("reader_notes_title").replace("📓 ", "")}
                {notes.length > 0 && <span className="tab-count">{notes.length}</span>}
              </button>
              <button
                className={`notes-tab ${notesTab === "bookmarks" ? "active" : ""}`}
                onClick={() => setNotesTab("bookmarks")}
              >
                🔖 {t("reader_bookmarks_title").replace("🔖 ", "")}
                {bookmarks.length > 0 && <span className="tab-count">{bookmarks.length}</span>}
              </button>
              <button
                className={`notes-tab ${notesTab === "audio" ? "active" : ""}`}
                onClick={() => setNotesTab("audio")}
              >
                🔊 Áudios
              </button>
            </div>
            {/* Conteúdo da aba */}
            <div className="notes-body">
              {notesTab === "notes" && (
                <>
                  {notes.length === 0 ? (
                    <p className="notes-empty">{t("reader_notes_empty")}</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="note-card">
                        <div className="note-meta">
                          <span className={`note-kind note-${n.kind}`}>
                            {n.kind === "translate" ? t("reader_note_translate") : n.kind === "explain" ? t("reader_note_explain") : n.kind === "summary" ? t("reader_note_summary") : t("reader_note_question")}
                          </span>
                          <time>{new Date(n.savedAt).toLocaleString(lang)}</time>
                          <button
                            className="note-delete"
                            onClick={() => onRemoveNote?.(n.id)}
                            aria-label={t("remove")}
                          >
                            🗑
                          </button>
                        </div>
                        {n.source && (
                          <blockquote className="note-source">{n.source}</blockquote>
                        )}
                        <div className="note-result">{n.result}</div>
                      </div>
                    ))
                  )}
                </>
              )}
              {notesTab === "bookmarks" && (
                <>
                  {bookmarks.length === 0 ? (
                    <p className="notes-empty">{t("reader_bookmarks_empty")}</p>
                  ) : (
                    [...bookmarks]
                      .sort((a, b) => b.savedAt - a.savedAt)
                      .map((bm) => {
                        const ch = book.chapters[bm.chapterIdx];
                        const label =
                          book.sourceFormat === "pdf"
                            ? t("reader_page_n", { n: bm.chapterIdx + 1 })
                            : ch?.title || t("reader_chapter_n", { n: bm.chapterIdx + 1 });
                        return (
                          <button
                            key={`${bm.chapterIdx}-${bm.savedAt}`}
                            className="bookmark-item"
                            onClick={() => {
                              setChapterIdx(bm.chapterIdx);
                              setNotesOpen(false);
                            }}
                          >
                            <span className="bookmark-label">{label}</span>
                            <span className="bookmark-date">
                              {new Date(bm.savedAt).toLocaleDateString(lang, {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </button>
                        );
                      })
                  )}
                </>
              )}
              {notesTab === "audio" && (
                <p className="notes-empty">
                  🔊 Áudios gerados aparecerão aqui. (Em breve)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .reader {
          display: flex;
          flex-direction: column;
          height: 100%;
          height: 100dvh;
          max-height: 100dvh;
          min-height: 0;
          background: var(--bg);
          border-right: none;
          position: relative;
          overflow: hidden;
        }
        /* Botão flutuante da xicrinha Moka (☕) quando menu está oculto */
        .moka-teacup-float-btn {
          position: absolute;
          top: 12px;
          left: 16px;
          z-index: 200;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .moka-teacup-float-btn:hover {
          transform: scale(1.1);
          background: var(--accent-soft);
          border-color: var(--accent);
          box-shadow: 0 6px 20px rgba(30, 64, 175, 0.22);
        }
        .moka-teacup-float-btn:active {
          transform: scale(0.92);
        }
        /* Em tela cheia: ocupa toda a tela, mantém header + nav visíveis quando ativo */
        .reader:fullscreen {
          width: 100vw;
          height: 100vh;
          border-right: none;
        }
        .reader:fullscreen .reader-header {
          padding: 8px 16px;
          flex-shrink: 0;
          height: auto;
          max-height: none;
          overflow: visible;
        }
        .reader-header[data-hidden="true"],
        .reader[data-menu-hidden="true"] .reader-header,
        .reader:fullscreen[data-menu-hidden="true"] .reader-header {
          display: none !important;
        }
        .reader:fullscreen .reader-scroll {
          padding-top: 16px;
        }
        .reader-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 7px 16px;
          border-bottom: 1px solid var(--border-soft);
          background: var(--surface);
          flex-shrink: 0;
          min-height: 50px;
          box-shadow: var(--shadow-sm);
          position: relative;
          top: 0;
          left: 0;
          right: 0;
          width: 100%;
          box-sizing: border-box;
          z-index: 100;
        }
        /* Linhas do header — distribuem bem os elementos (sem espaço vazio). */
        .reader-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          min-height: 42px;
        }
        /* Container principal: GRID (scroll + right) */
        .reader-row-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) max-content;
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
          overflow: visible;
        }
        /* Ações do livro — scroll horizontal suave com snap */
        .reader-row-scroll {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
          -webkit-mask-image: linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%);
          mask-image: linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%);
        }
        .reader-row-scroll::-webkit-scrollbar {
          display: none;
        }
        .reader-row-scroll > * {
          flex: 0 0 auto;
          scroll-snap-align: start;
        }
        /* Em telas pequenas (celular): 2 linhas harmônicas */
        @media (max-width: 600px) {
          .reader-header {
            min-height: 0;
            padding: 6px 8px;
            overflow: visible;
          }
          .reader-row-main {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto auto;
            gap: 6px;
          }
          .reader-row-scroll {
            grid-row: 1;
            width: 100%;
            min-height: 38px;
          }
          .reader-row-right {
            grid-row: 2;
            width: 100%;
            min-height: 38px;
            justify-content: center;
            margin: 0;
          }
          .icon-btn {
            width: 36px;
            height: 36px;
            font-size: 16px;
          }
        }
        /* Controles fixos à direita */
        .reader-row-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
          background: var(--surface);
          z-index: 10;
          margin-left: auto;
          flex-shrink: 0;
        }
        /* Zoom VERTICAL no topo da lateral direita.
           Ajustado dinamicamente para não cortar nem sobrepor. */
        .zoom-rail {
          position: absolute;
          right: 12px;
          top: 64px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px;
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-pill);
          box-shadow: var(--shadow);
          z-index: 90;
          transition: top 200ms ease, opacity 200ms ease;
        }
        @media (max-width: 600px) {
          .zoom-rail {
            top: 96px;
          }
        }
        .reader[data-menu-hidden="true"] .zoom-rail,
        .reader:fullscreen[data-menu-hidden="true"] .zoom-rail {
          top: 12px;
        }
        .zoom-rail-btn {
          width: 40px;
          height: 40px;
          border: none;
          background: transparent;
          color: var(--text);
          font-size: 22px;
          font-weight: 600;
          border-radius: 50%;
          cursor: pointer;
          transition: all 120ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .zoom-rail-btn:hover:not(:disabled) {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .zoom-rail-btn:active:not(:disabled) {
          transform: scale(0.9);
        }
        .zoom-rail-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .translate-page-btn {
          padding: 7px 14px;
          border: 1px solid var(--border-soft);
          background: var(--bg);
          color: var(--text);
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          transition: border-color var(--transition), color var(--transition),
            background var(--transition);
        }
        .translate-page-btn:hover:not(:disabled) {
          border-color: var(--gold);
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .translate-page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        /* Botões de ação da página (traduzir/explicar).
           No modo NORMAL: texto (padding menor, fonte 13px).
           No FULLSCREEN: só ícone (44px touch target). */
        .page-action-btn {
          padding: 7px 14px;
          border: 1px solid var(--border-soft);
          background: var(--bg);
          color: var(--text);
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: border-color var(--transition), color var(--transition),
            background var(--transition);
          flex-shrink: 0;
        }
        .page-action-btn:hover:not(:disabled) {
          border-color: var(--gold);
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .page-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        /* Em fullscreen: vira botão de ícone quadrado (44px). */
        .reader:fullscreen .page-action-btn {
          width: 44px;
          height: 44px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        /* Destaque quando a página está traduzida/explicada (ativo). */
        .page-action-btn.active {
          background: var(--accent-soft);
          border-color: var(--gold);
          color: var(--accent-dark);
        }
        .open-other-btn,
        .notes-btn {
          padding: 7px 14px;
          border: 1px solid var(--border-soft);
          background: var(--bg);
          color: var(--text);
          border-radius: var(--radius-pill);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          transition: border-color var(--transition), color var(--transition),
            background var(--transition);
        }
        .open-other-btn:hover,
        .notes-btn:hover {
          border-color: var(--gold);
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .notes-btn .btn-label {
          font-size: 11px;
          opacity: 0.7;
        }

        /* Logo Cafezinho no header do reader (canto esquerdo, vazada) */
        .cafezinho-mark {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          color: var(--text-muted);
          transition: var(--transition);
          flex-shrink: 0;
          text-decoration: none;
        }
        .cafezinho-mark:hover {
          background: var(--accent-soft);
          color: var(--accent);
        }

        /* Botões de ícone reutilizáveis (44px touch target) */
        .icon-btn {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          border-radius: var(--radius);
          font-size: 17px;
          cursor: pointer;
          transition: background var(--transition), color var(--transition),
            transform var(--transition);
          flex-shrink: 0;
          position: relative;
        }
        .icon-btn:hover {
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .icon-btn:active {
          transform: scale(0.92);
        }
        .icon-btn.active {
          background: var(--accent-soft);
          color: var(--accent-dark);
          border-color: var(--gold);
        }
        /* Contador dentro do botão (notas/marcadores) */
        .icon-btn .badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: var(--accent);
          color: white;
          font-size: 10px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }

        /* Marcador ativo: destaque dourado */        /* Marcador ativo: destaque dourado */
        .bookmark-btn.active {
          background: var(--accent-soft);
          border-color: var(--accent);
        }
        /* Botão STOP (para áudio) — vermelho, aparece só durante playback */
        .tts-stop-btn {
          background: #e74c3c !important;
          border-color: #c0392b !important;
          color: white !important;
          animation: pulse-red 1.5s infinite;
        }
        .tts-stop-btn:hover {
          background: #c0392b !important;
        }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(231, 76, 60, 0); }
        }
        /* ⚙️ não configurado: ponto vermelho de alerta (igual ao TopBar antigo) */
        .settings-gear.unset {
          position: relative;
          border-color: var(--accent);
        }
        .settings-gear.unset::after {
          content: "";
          position: absolute;
          top: 5px;
          right: 5px;
          width: 9px;
          height: 9px;
          background: #e74c3c;
          border-radius: 50%;
          border: 2px solid var(--surface);
        }

        /* Nav-bar: colapsa quando menu invisível em fullscreen */
        .reader:fullscreen .reader-nav-bar {
          transition: max-height 200ms ease, opacity 200ms ease;
          max-height: 80px;
          overflow: hidden;
        }
        .reader:fullscreen[data-menu-hidden="true"] .reader-nav-bar {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
          border-top-color: transparent;
        }

        /* Botão flutuante pra re-mostrar menu em fullscreen (logo Cafezinho) */
        .fs-show-menu-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 48px;
          height: 48px;
          border: 1px solid var(--border-soft);
          background: var(--surface);
          color: var(--text-muted);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow);
          z-index: 60;
          transition: border-color var(--transition), color var(--transition);
        }
        .fs-show-menu-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        /* Itens do modal de marcadores */
        .bookmark-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          text-align: left;
          padding: 13px 16px;
          border: 1px solid var(--border-soft);
          background: var(--surface);
          border-radius: var(--radius);
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition);
          color: var(--text);
        }
        .bookmark-item:hover {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .bookmark-label {
          font-weight: 600;
          font-size: var(--text-sm);
        }
        .bookmark-date {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Modal de Notas */
        .notes-overlay {
          position: fixed;
          inset: 0;
          background: rgba(30, 20, 12, 0.4);
          -webkit-backdrop-filter: blur(5px);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .notes-modal {
          background: var(--bg);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 620px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border-soft);
        }
        .notes-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-soft);
        }
        /* Abas do modal unificado */
        .notes-tabs {
          display: flex;
          gap: 0;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-alt);
        }
        .notes-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 150ms ease;
        }
        .notes-tab:hover {
          color: var(--text);
          background: var(--surface);
        }
        .notes-tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
          font-weight: 600;
        }
        .tab-count {
          background: var(--accent);
          color: white;
          font-size: 10px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
        }
        .notes-header h2 {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 19px;
          font-weight: 600;
        }
        .notes-header button {
          border: none;
          background: var(--surface-alt);
          color: var(--text-muted);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          cursor: pointer;
        }
        .notes-body {
          padding: 20px 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .notes-empty {
          text-align: center;
          color: var(--text-muted);
          line-height: 1.7;
          margin: 40px 0;
        }
        .note-card {
          border: 1px solid var(--border-soft);
          border-radius: var(--radius);
          padding: 16px;
          background: var(--surface);
          box-shadow: var(--shadow-sm);
        }
        .note-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .note-kind {
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 6px;
          background: var(--surface-alt);
        }
        .note-meta time {
          font-size: 11px;
        }
        .note-delete {
          margin-left: auto;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
          opacity: 0.5;
        }
        .note-delete:hover {
          opacity: 1;
        }
        .note-source {
          margin: 0 0 10px;
          padding: 10px 12px;
          background: var(--surface-alt);
          border-left: 3px solid var(--gold);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          font-family: var(--font-serif);
          font-size: 13px;
          font-style: italic;
          white-space: pre-wrap;
        }
        .note-result {
          font-family: var(--font-serif);
          font-size: 14px;
          line-height: 1.65;
          white-space: pre-wrap;
          color: var(--text);
        }
        .reader-title {
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
        }
        .reader-title h1 {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.005em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: baseline;
          gap: 0;
        }
        /* Título e autor na MESMA linha, mesma fonte — só muda a cor. */
        .reader-title-text {
          color: var(--text);
        }
        .reader-title-author {
          font-weight: 400;  /* mais fino que o título */
          color: var(--text-muted);
        }
        /* Botão de ícone COM texto (ex: "Ler novo"). */
        .icon-btn.with-text {
          width: auto;
          padding: 0 12px;
          gap: 5px;
          font-size: 13px;
          font-weight: 500;
        }
        .icon-btn.with-text .btn-text {
          white-space: nowrap;
        }
        .reader-nav {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .reader-nav button {
          width: 34px;
          height: 34px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 50%;
          font-size: 17px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background var(--transition), color var(--transition);
        }
        .reader-nav button:not(:disabled):hover {
          background: var(--accent-soft);
          color: var(--accent-dark);
        }
        .reader-nav button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .reader-counter {
          font-size: 13px;
          font-variant-numeric: tabular-nums;
          color: var(--text-muted);
          min-width: 56px;
          text-align: center;
        }
        .reader-scroll {
          flex: 1 1 0;
          min-height: 0; /* CRÍTICO: permite encolher e deixar a nav-bar visível */
          overflow-y: auto;
          padding: 40px 0 120px;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        /* Estado de espera da IA (tradução da página inteira) — EXPLÍCITO,
           ocupa a área da página: a pessoa vê que algo está acontecendo.
           (Pedido do Miguel, 04/08: "não basta ampulheta".) */
        .page-ai-waiting {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 50vh;
          text-align: center;
          color: var(--text-muted);
          padding: 32px 20px;
        }
        .page-ai-waiting strong {
          font-size: 18px;
          color: var(--text);
        }
        .page-ai-waiting span {
          font-size: 13.5px;
          max-width: 340px;
          line-height: 1.5;
        }
        .page-ai-spinner {
          width: 44px;
          height: 44px;
          border: 4px solid var(--accent-soft);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: page-ai-spin 0.9s linear infinite;
        }
        @keyframes page-ai-spin {
          to { transform: rotate(360deg); }
        }
        .page-ai-error {
          margin: 24px auto;
          max-width: 480px;
          padding: 16px 18px;
          background: var(--accent-soft);
          border-radius: 12px;
          color: var(--accent);
          font-size: 15px;
          line-height: 1.6;
        }
        .reader-text {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 36px;
          font-family: var(--font-serif);
          font-size: var(--text-lg);
          line-height: 1.85;
          color: var(--text);
        }
        /* Barra de progresso de leitura */
        .reader-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--surface-alt);
          overflow: hidden;
        }
        .reader-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-dark), var(--accent), var(--gold));
          transition: width 300ms var(--ease);
          border-radius: 0 2px 2px 0;
        }

        /* Painel flutuante de resultado em fullscreen */
        /* BALÃO CENTRAL de loading do áudio */
        /* DICA INICIAL (1x por livro) */
        .tip-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9500;
          background: rgba(43, 32, 21, 0.3);
          backdrop-filter: blur(3px);
        }
        .tip-balloon {
          background: var(--surface);
          border: 2px solid var(--accent);
          border-radius: 20px;
          padding: 28px 32px;
          max-width: 360px;
          box-shadow: 0 8px 40px rgba(62, 42, 24, 0.25);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
          animation: tts-pop 350ms ease;
        }
        .tip-emoji {
          font-size: 40px;
          margin-bottom: 4px;
        }
        .tip-text {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
          line-height: 1.5;
        }
        .tip-subtext {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.5;
        }
        .tip-btn {
          margin-top: 4px;
          padding: 10px 28px;
          border: none;
          background: var(--accent);
          color: white;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms ease;
        }
        .tip-btn:hover {
          background: var(--accent-dark);
          transform: scale(1.05);
        }
        .tip-skip {
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 14px;
          cursor: pointer;
          padding: 10px 16px;
        }
        .tip-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
        }
        .tip-dots {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }
        .tip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border);
        }
        .tip-dot.active {
          background: var(--accent);
        }

        .tts-loading-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9000;
          pointer-events: none;
          background: rgba(43, 32, 21, 0.15);
          backdrop-filter: blur(2px);
        }
        .tts-loading-balloon {
          background: var(--surface);
          border: 2px solid var(--accent);
          border-radius: 20px;
          padding: 24px 36px;
          box-shadow: 0 8px 40px rgba(62, 42, 24, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          animation: tts-pop 300ms ease;
          position: relative;
        }
        .tts-loading-secs {
          font-size: 12px;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
        .tts-loading-cancel {
          position: absolute;
          top: 8px;
          right: 8px;
          border: none;
          background: var(--surface-alt);
          color: var(--text-muted);
          width: 26px;
          height: 26px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 13px;
        }
        .tts-loading-cancel:hover {
          background: var(--accent-soft);
          color: var(--accent);
        }
        @keyframes tts-pop {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .tts-loading-anim {
          display: flex;
          gap: 8px;
        }
        .tts-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent);
          animation: tts-bounce 1s infinite ease-in-out;
        }
        .tts-dot:nth-child(2) { animation-delay: 0.15s; }
        .tts-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes tts-bounce {
          0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        .tts-loading-text {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
        }

        .fs-result-panel {
          position: absolute;
          bottom: 80px;
          right: 20px;
          width: 380px;
          max-width: 90vw;
          max-height: 50vh;
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          z-index: 100;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .fs-result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          font-weight: 600;
          font-size: var(--text-sm);
        }
        .fs-result-header button {
          border: none;
          background: transparent;
          font-size: 18px;
          cursor: pointer;
          color: var(--text-muted);
        }
        .fs-result-body {
          padding: 16px;
          overflow-y: auto;
          font-family: var(--font-serif);
          font-size: var(--text-base);
          line-height: 1.75;
          white-space: pre-wrap;
        }
        .reader-text h2 {
          font-size: 22px;
          margin-top: 0;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Barra de navegação rápida (slider horizontal no rodapé) */
        .reader-nav-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          /* FIXED no rodapé da viewport — sempre visível, não depende de flex. */
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
        }
        /* Em fullscreen, a nav-bar fica relativa ao .reader */
        .reader:fullscreen .reader-nav-bar {
          position: fixed;
          bottom: 0;
        }
        /* Margem vazia no fim do texto: SEMPRE bem maior que a bandeja de
           navegação flutuante (~52px de altura + 12px solta do rodapé +
           respiro generoso pro iPad). Assim dá pra subir o texto e ler a
           página ATÉ O FIM, sem a barra cobrir a última linha.
           Inclui a safe-area do iPhone/iPad. */
        .reader-scroll {
          padding-bottom: calc(150px + env(safe-area-inset-bottom, 0px)) !important;
        }
        .reader-nav-bar button {
          width: 36px;
          height: 36px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          border-radius: 8px;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .reader-nav-bar button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .reader-nav-bar button:not(:disabled):hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .nav-slider {
          flex: 1;
          height: 36px;
          cursor: pointer;
          accent-color: var(--accent);
        }
        .nav-counter-bottom {
          font-size: var(--text-sm);
          color: var(--text-muted);
          min-width: 60px;
          text-align: center;
          flex-shrink: 0;
        }
        .selection-menu {
          position: absolute;
          background: linear-gradient(180deg, var(--accent), var(--accent-dark));
          border: none;
          border-radius: var(--radius-pill);
          box-shadow: 0 8px 28px rgba(43, 26, 12, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 4px;
          z-index: 9999;
        }
        /* Acima: sobe o menu pra cima da coordenada (padrão). */
        .selection-menu.placement-above {
          transform: translate(-50%, -100%);
        }
        /* Abaixo: quando não cabe em cima (topo da página). */
        .selection-menu.placement-below {
          transform: translate(-50%, 0);
        }
        /* No celular: barra fixa no rodapé, longe do menu nativo iOS */
        /* Em dispositivos de TOQUE (iPad, iPhone, Android): barra fixa no rodapé,
           longe do menu nativo do iOS. Usa hover:none + pointer:coarse que detecta
           TODOS os dispositivos touch, incluindo iPad (solução ChatGPT). */
        @media (hover: none) and (pointer: coarse) {
          .selection-menu {
            position: fixed !important;
            left: 10px !important;
            right: auto !important;
            top: auto !important;
            bottom: calc(66px + env(safe-area-inset-bottom, 0px)) !important;
            transform: translateX(-50%) !important;
            left: 50% !important;
            width: max-content;
            max-width: calc(100vw - 24px);
            justify-content: center;
            z-index: 2000;
            /* Celular estreito: deixa quebrar em DUAS LINHAS pra não cortar
               os botões (bug reportado pelo Miguel no celular). */
            flex-wrap: wrap;
            row-gap: 4px;
            border-radius: var(--radius-lg);
            padding: 6px;
          }
        }
        /* Telas bem estreitas (celular): botões um pouco menores pra
           caber tudo em no máximo duas linhas. */
        @media (hover: none) and (pointer: coarse) and (max-width: 430px) {
          .selection-menu button {
            padding: 9px 12px;
            font-size: 13px;
          }
        }
        .selection-menu button {
          border: none;
          background: transparent;
          color: #fff8ee;
          padding: 10px 16px;
          border-radius: var(--radius-pill);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          cursor: pointer;
          transition: background var(--transition);
        }
        .selection-menu button:hover,
        .selection-menu button:active {
          background: rgba(255, 248, 238, 0.2);
        }
        .selection-menu-close {
          width: 36px !important;
          height: 36px;
          padding: 0 !important;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.85;
          font-size: 16px !important;
        }
        .selection-menu-close:hover {
          opacity: 1;
          background: rgba(0, 0, 0, 0.2) !important;
        }
      `}</style>

      {/* Settings renderizado DENTRO da <section.reader> — assim aparece
          tanto no modo normal quanto no fullscreen (que só mostra o
          elemento que pediu fullscreen e seus filhos). */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => onCloseSettings?.()}
          onSaved={() => onSettingsSaved?.()}
        />
      )}

      {/* Janela "Pergunte qualquer coisa" (ícone microfone+caneta) —
          pergunta por voz ou escrita, resposta com streaming na janela. */}
      {askOpen && (
        <AskModal
          book={book}
          chapterId={chapter?.id}
          onClose={() => setAskOpen(false)}
          onSaveNote={onSaveNote}
        />
      )}

      {/* Janela "Traduzir livro inteiro" (🌍) — volumes de ~50 páginas,
          EPUB baixado + estante, com retomada e integrador de volumes. */}
      {transBookOpen && (
        <TranslateBookModal
          book={book}
          userId={auth?.user?.id ?? null}
          onClose={() => setTransBookOpen(false)}
        />
      )}

      {/* Janela ANOTAR (📝) — Resumir ou Explicar a página inteira com
          barra de tamanho; resumo também cobre o livro inteiro. */}
      {summaryOpen && (
        <PageActionModal
          book={book}
          pageText={currentPageText || blocksToText(currentBlocks, "\n\n")}
          pageLabel={pageLabel}
          totalPages={totalPages}
          buildBookCompilation={buildBookCompilation}
          onClose={() => setSummaryOpen(false)}
          onSaveNote={onSaveNote}
        />
      )}

      {/* Input de arquivo escondido — aberto pelo botão ➕ "Abrir novo".
          Vai pra home que abre o seletor de arquivo automaticamente. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf"
        hidden
        onChange={(e) => {
          // Se selecionou algo, vai pra home processar.
          if (e.target.files?.[0]) {
            sessionStorage.setItem("moka.openUploader", "1");
            onCloseBook?.();
          }
        }}
      />
    </section>
  );
}

/** Escapa HTML pra injetar com segurança no iframe de print. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Renderiza um bloco conforme seu tipo. */
function BlockView({ block }: { block: import("@igot/parser").Block }) {
  switch (block.type) {
    case "heading":
      switch (block.level) {
        case 1:
          return <h1>{block.text}</h1>;
        case 2:
          return <h2>{block.text}</h2>;
        case 3:
          return <h3>{block.text}</h3>;
        default:
          return <h4>{block.text}</h4>;
      }
    case "quote":
      return <blockquote>{block.text}</blockquote>;
    case "list":
      return (
        <ul>
          {block.items?.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "image":
      return block.src ? <img src={block.src} alt={block.alt ?? ""} /> : null;
    case "page-break":
      return <hr />;
    default:
      return <p>{block.text}</p>;
  }
}
