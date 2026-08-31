"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Uploader } from "@/components/Uploader";
import { LangSwitcher } from "@/components/LangSwitcher";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter } from "@/components/SiteFooter";
import { useI18n } from "@/components/I18nProvider";
import { TopNav, TopNavActions } from "@/components/TopNav";
import { BackButton } from "@/components/BackButton";
import { TelemetryIconButton } from "@/components/TelemetryIconButton";
import { VisitPing } from "@/components/VisitPing";
import { hasConfig, loadConfigCache } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { listLibrary, saveToLibrary, removeFromLibrary, clearAllBooks } from "@/lib/repository";
import {
  migrateLegacyBook,
  type Session,
} from "@/lib/db";
import { blocksToText } from "@/lib/paginate";
import { getActiveMemoriaId, putMemoriaObject } from "@/lib/memoria/store";
import { parseBook } from "@igot/parser";
import { renderPdfCover, isImagePdf } from "@/lib/pdf-cover";
import { generateDynamicBookCover } from "@/lib/cover-generator";

/**
 * Home = ESTANTE.
 *
 * Mostra os livros da biblioteca em grid de capas. Logo "igot" é clicável
 * (volta pra cá). Clicar num livro vai pra /book/[id] (URL própria).
 * Botão "+ Adicionar" abre o Uploader.
 */
export default function HomePage() {
  const router = useRouter();
  const auth = useAuth();
  const { t } = useI18n();
  const [books, setBooks] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingBook, setAddingBook] = useState(false);
  // Progresso da ingestão (ordem do Miguel, 31/08: livro grande tem que
  // mostrar BARRINHA DE PERCENTUAL subindo — nunca mais "parado" sem dizer nada).
  const [ingest, setIngest] = useState<{ pct: number; label: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [configReady, setConfigReady] = useState(false);
  // 🧠 jogar na memória (obra MOKA): qual card está salvando/salvo.
  const [memSaving, setMemSaving] = useState<string | null>(null);
  const [memSaved, setMemSaved] = useState<string | null>(null);

  // Carrega a estante (migrando livro legado primeiro).
  // Só roda UMA VEZ no boot — não re-roda quando auth muda de estado.
  const refresh = useCallback(async () => {
    await migrateLegacyBook();
    const list = await listLibrary(auth.userId).catch(() => []);
    setBooks(list);
    setLoading(false);
  }, [auth.userId]);

  // Boot: carrega config + estante. SÓ UMA VEZ (não depende de refresh).
  // Se tem livros, abre automaticamente o último lido (savedAt mais recente).
  useEffect(() => {
    let cancelled = false;
    loadConfigCache().then(() => {
      if (!cancelled) setConfigReady(hasConfig());
    });
    (async () => {
      await migrateLegacyBook();
      const list = await listLibrary(null).catch(() => []);
      if (cancelled) return;
      setBooks(list);
      setLoading(false);

      // A CAPA (/) virou a porta de entrada do app — a estante não redireciona
      // mais pro último lido (pedido do Miguel 23/07: home = explicação,
      // estante = link). Só resta o fluxo "Abrir novo" do Reader.
      const openUploader = sessionStorage.getItem("moka.openUploader") === "1";
      if (openUploader) {
        sessionStorage.removeItem("moka.openUploader");
        // Dispara o clique no input de arquivo depois de renderizar.
        setTimeout(() => document.getElementById("file-input")?.click(), 300);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando auth resolve (login/logout), recarrega a estante — mas só se
  // mudou de 'loading' pra outro estado. NÃO zera books durante o carregamento.
  const authResolved = auth.status !== "loading";
  useEffect(() => {
    if (!authResolved) return;
    let cancelled = false;
    (async () => {
      const list = await listLibrary(auth.userId).catch(() => []);
      if (!cancelled && list.length > 0) setBooks(list);
      // Se a lista da nuvem for vazia, NÃO zera a local (evita flash).
    })();
    return () => {
      cancelled = true;
    };
  }, [authResolved, auth.userId]);

  // PRÉ-AQUECIMENTO do pdfjs (BUG-20260723-IPAD-PRIMEIRO-UPLOAD): baixa o
  // chunk do pdfjs-dist (~1,4 MB) e o worker local em idle, pra PRIMEIRA
  // tentativa de adicionar um PDF não ser a fria — era o motivo de só
  // funcionar na segunda tentativa no iPad.
  useEffect(() => {
    const warm = () => {
      void import("pdfjs-dist")
        .then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        })
        .catch(() => { /* pré-aquecer é best-effort */ });
      void fetch("/pdf.worker.min.mjs").catch(() => {});
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
  }, []);

  // Progresso da geração de capa (45%..90% da barra).
  const coverProgress = useCallback(
    (d: number, n: number) =>
      setIngest({
        pct: Math.round(45 + 45 * (d / Math.max(1, n))),
        label: t("ingest_cover", { n: d, total: n }),
      }),
    [t],
  );

  // Abre um arquivo: se JÁ EXISTE na estante (mesmo título ou tamanho),
  // abre o livro existente (com progresso salvo). Senão, cria novo.
  // Ingestão de livro: mesma pipeline pra todo arquivo local
  // (dedup → parse → aviso PDF-imagem → capa → estante).
  const ingestBook = useCallback(
    async (data: ArrayBuffer, fileName: string, fileSize: number) => {
      setAddingBook(true);
      setUploadError(null);
      setIngest({ pct: 8, label: t("ingest_open") });
      try {
        // ANTES de parsear, checa se já existe pelo tamanho do arquivo.
        // DEDUP DEFENSIVO: entre os candidatos, PREFERE o que tem chapters válidos.
        const existingBySize = books.find(
          (b) => b.fileName === fileName && b.fileSize === fileSize
            && (b.book?.chapters?.length ?? 0) > 0,
        ) ?? books.find(
          (b) => b.fileName === fileName && b.fileSize === fileSize,
        );
        if (existingBySize) {
          router.push(`/book/${existingBySize.id}`);
          return;
        }

        const result = await parseBook({ data: data.slice(0), fileName });
        if (result.ok) {
          // DEDUPLICAÇÃO por título — também prefere chapters válidos.
          const existingByTitle = books.find(
            (b) => b.book.title === result.book?.title
              && (b.book?.chapters?.length ?? 0) > 0,
          ) ?? books.find(
            (b) => b.book.title === result.book?.title,
          );
          // PDF 100% IMAGEM (scan sem texto — pedido do Miguel, 24/08):
          // avisa ANTES de adicionar que ler é normal, mas traduzir/explicar
          // páginas exige IA com VISÃO e custa um pouco mais por página.
          // Confirm com explicação nos 12 idiomas; cancelar = não adiciona.
          const isPdfScan =
            result.book.sourceFormat === "pdf" &&
            (await isImagePdf(data, (d, n) =>
              setIngest({
                pct: Math.round(10 + 30 * (d / Math.max(1, n))),
                label: t("ingest_check"),
              }),
            ));
          if (isPdfScan) {
            if (!confirm(t("shelf_image_pdf_confirm"))) return;
          }

          if (existingByTitle) {
            existingByTitle.pdfSource = result.book.sourceFormat === "pdf" ? new Uint8Array(data) : null;
            // Re-enviou o arquivo: recalcula a capa com a detecção V4 (examina
            // as 10 primeiras páginas e elege a melhor — pedido do Miguel,
            // 23/08; caso-escola: Roman Political Institutions, capa na p.9).
            // Best-effort: falha silencosa mantém a capa antiga.
            if (result.book.sourceFormat === "pdf") {
              existingByTitle.coverImage =
                (await renderPdfCover(data, coverProgress)) ?? existingByTitle.coverImage;
            }
            await saveToLibrary(existingByTitle, auth.userId);
            router.push(`/book/${existingByTitle.id}`);
            return;
          }

          // Livro NOVO — cria entry na estante.
          const bookId = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          // Capa (V3 — pedido do Miguel): EPUB/PDF traz extraída ou gera capa elegante.
          let coverImage =
            result.book.coverImage ??
            (result.book.sourceFormat === "pdf"
              ? await renderPdfCover(data, coverProgress) ?? undefined
              : undefined);
          if (!coverImage) {
            coverImage = generateDynamicBookCover({
              title: result.book.title,
              author: result.book.author,
            });
          }
          const session: Session = {
            id: bookId,
            fileName,
            fileSize,
            book: result.book,
            coverImage,
            pdfSource: result.book.sourceFormat === "pdf" ? new Uint8Array(data) : null,
            chapterIdx: 0,
            zoom: 1,
            savedAt: Date.now(),
            translations: {},
            notes: [],
          };
          setIngest({ pct: 96, label: t("ingest_saving") });
          await saveToLibrary(session, auth.userId);
          router.push(`/book/${bookId}`);
        } else {
          setUploadError(result.error);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setAddingBook(false);
        setIngest(null);
      }
    },
    [auth.userId, router, books, t, coverProgress],
  );

  const handleFile = useCallback(
    async (file: File) =>
      ingestBook(await file.arrayBuffer(), file.name, file.size),
    [ingestBook],
  );

  return (
    <main className="estante-page">
      <VisitPing />
      {/* TopBar com logo clicável */}
      <TopNav active="reader" right={<TopNavActions gearUnset={!configReady} />} />

      {/* Estante */}
      {loading ? (
        <div className="igot-loading">
          <div className="spinner" />
          <p>{t("shelf_loading")}</p>
        </div>
      ) : books.length === 0 ? (
        <Uploader
          onFile={handleFile}
          error={uploadError}
          configReady={configReady}
          onOpenSettings={() => router.push("/configuracoes")}
          progress={addingBook ? ingest : null}
        />
      ) : (
        <div className="shelf-page">
          <div className="shelf-header">
            <h1>{t("shelf_title")}</h1>
            <div className="shelf-actions">
              <button
                className="clear-shelf-btn"
                onClick={async () => {
                  if (confirm(t("shelf_clear_confirm"))) {
                    await clearAllBooks(auth.userId);
                    setBooks([]);
                  }
                }}
                title={t("shelf_clear_all")}
              >
                {t("shelf_clear_all")}
              </button>
              <button className="add-book-btn" onClick={() => document.getElementById("file-input")?.click()}>
                {t("shelf_add_book")}
              </button>
            </div>
            <input
              id="file-input"
              type="file"
              accept=".epub,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {/* Oferta da Biblioteca Livre (pedido do Miguel, 29/07) */}
          <a className="shelf-bib-link" href="/biblioteca">
            📚 <b>Biblioteca Livre</b> — livros grátis de domínio público,
            com capa e sinopse. <span>{t("shelf_bib_cta")}</span>
          </a>

          {addingBook && (
            ingest ? (
              <div className="ingest-progress" role="status" aria-live="polite">
                <div className="ingest-progress-bar">
                  <div className="ingest-progress-fill" style={{ width: `${ingest.pct}%` }} />
                </div>
                <p className="ingest-progress-label">
                  <span className="ingest-progress-pct">{ingest.pct}%</span> — {ingest.label}
                </p>
              </div>
            ) : (
              <div className="igot-loading">
                <div className="spinner" />
                <p>{t("shelf_adding")}</p>
              </div>
            )
          )}

          {uploadError && (
            <p className="shelf-error">⚠️ {uploadError}</p>
          )}

          <div className="shelf-grid">
            {books.map((book) => (
              <div key={book.id} className="book-card-wrapper">
                <Link href={`/book/${book.id}`} className="book-card">
                  <div className="book-cover">
                    <img
                      src={
                        book.coverImage ||
                        generateDynamicBookCover({
                          title: book.book.title,
                          author: book.book.author,
                        })
                      }
                      alt={book.book.title}
                    />
                  </div>
                  <div className="book-info">
                    <h3 className="book-title">{book.book.title}</h3>
                    {book.book.author && (
                      <p className="book-author">{book.book.author}</p>
                    )}
                    <p className="book-progress">
                      {book.book.sourceFormat === "pdf"
                        ? t("shelf_page_n", { n: book.chapterIdx + 1 })
                        : t("shelf_chapter_n", { n: book.chapterIdx + 1 })}
                    </p>
                    {/* Marca do formato (pedido do Miguel, 29/07) */}
                    <span className={`book-format-badge fmt-${book.book.sourceFormat}`}>
                      {book.book.sourceFormat.toUpperCase()}
                    </span>
                  </div>
                </Link>
                {/* 🧠 Jogar na memória (obra MOKA — ordem do Miguel 30/08 ~16h:
                    ícone embaixo do livro). Conversão 100% LOCAL: grátis, não
                    gasta token — tarefa grande de IA é que tem orçamento (DSC-018). */}
                <button
                  className="book-memory-btn"
                  title={t("mem_to_memory")}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMemSaving(book.id);
                    setUploadError(null);
                    try {
                      const body = (book.book.chapters ?? [])
                        .map((ch) => `## ${ch.title}\n\n${blocksToText(ch.blocks, "\n\n")}`)
                        .join("\n\n")
                        .trim();
                      if (body.length < 200) {
                        setUploadError(t("mem_rejected_count", { n: 1 }));
                        return;
                      }
                      await putMemoriaObject({
                        memoriaId: getActiveMemoriaId(),
                        type: "livro",
                        title: book.book.title,
                        author: book.book.author,
                        lang: book.book.language,
                        source: "estante do Moka",
                        tags: ["livro"],
                        body,
                        chars: body.length,
                      });
                      setMemSaved(book.id);
                      setTimeout(() => setMemSaved(null), 2500);
                    } catch {
                      setUploadError("⚠️");
                    } finally {
                      setMemSaving(null);
                    }
                  }}
                >
                  <span aria-hidden>{memSaving === book.id ? "…" : memSaved === book.id ? "✅" : "🧠"}</span>
                  <span className="book-memory-label">
                    {memSaved === book.id ? t("mem_in_memory") : t("mem_to_memory")}
                  </span>
                </button>
                <button
                  className="book-delete-btn"
                  title={t("shelf_remove_book")}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(t("shelf_remove_confirm", { title: book.book.title }))) {
                      await removeFromLibrary(book.id, auth.userId);
                      setBooks((prev) => prev.filter((b) => b.id !== book.id));
                    }
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

          <SiteFooter />
    </main>
  );
}
