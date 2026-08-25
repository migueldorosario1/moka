"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Uploader } from "@/components/Uploader";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter } from "@/components/SiteFooter";
import { useI18n } from "@/components/I18nProvider";
import { SectionSwitcher } from "@/components/SectionSwitcher";
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
import { parseBook } from "@igot/parser";
import { renderPdfCover, isImagePdf } from "@/lib/pdf-cover";
import {
  getDriveToken,
  listDriveBooks,
  fetchDriveFile,
  reconnectGoogle,
  type DriveBook,
} from "@/lib/gdrive";
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [configReady, setConfigReady] = useState(false);

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

  // Abre um arquivo: se JÁ EXISTE na estante (mesmo título ou tamanho),
  // abre o livro existente (com progresso salvo). Senão, cria novo.
  // Ingestão comum: arquivo local OU Google Drive — mesma pipeline
  // (dedup → parse → aviso PDF-imagem → capa → estante). Miguel, 24/08.
  const ingestBook = useCallback(
    async (data: ArrayBuffer, fileName: string, fileSize: number) => {
      setAddingBook(true);
      setUploadError(null);
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
          if (result.book.sourceFormat === "pdf" && (await isImagePdf(data))) {
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
                (await renderPdfCover(data)) ?? existingByTitle.coverImage;
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
              ? await renderPdfCover(data) ?? undefined
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
          await saveToLibrary(session, auth.userId);
          router.push(`/book/${bookId}`);
        } else {
          setUploadError(result.error);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
      } finally {
        setAddingBook(false);
      }
    },
    [auth.userId, router, books],
  );

  const handleFile = useCallback(
    async (file: File) =>
      ingestBook(await file.arrayBuffer(), file.name, file.size),
    [ingestBook],
  );

  // ── 📂 Google Drive: subir livro sem baixar pro PC (Miguel, 24/08) ──
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveBooks, setDriveBooks] = useState<DriveBook[] | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveQuery, setDriveQuery] = useState("");
  const [driveNeedAuth, setDriveNeedAuth] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFetching, setDriveFetching] = useState<string | null>(null);

  const openDrive = useCallback(async (query = "") => {
    setDriveOpen(true);
    setDriveBusy(true);
    setDriveError(null);
    setDriveNeedAuth(false);
    setDriveBooks(null);
    try {
      const token = await getDriveToken();
      if (!token) {
        setDriveNeedAuth(true);
        return;
      }
      setDriveBooks(await listDriveBooks(token, query));
    } catch (err) {
      if (err instanceof Error && err.message === "NEED_AUTH") {
        setDriveNeedAuth(true);
      } else {
        setDriveError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setDriveBusy(false);
    }
  }, []);

  const pickDriveBook = useCallback(
    async (b: DriveBook) => {
      setDriveFetching(b.name);
      setDriveError(null);
      try {
        const token = await getDriveToken();
        if (!token) {
          setDriveNeedAuth(true);
          return;
        }
        const bytes = await fetchDriveFile(token, b.id);
        setDriveOpen(false);
        await ingestBook(bytes, b.name, bytes.byteLength);
      } catch (err) {
        if (err instanceof Error && err.message === "NEED_AUTH") {
          setDriveNeedAuth(true);
        } else {
          setDriveError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setDriveFetching(null);
      }
    },
    [ingestBook],
  );

  return (
    <main className="estante-page">
      <VisitPing />
      {/* TopBar com logo clicável */}
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <Link href="/" className="brand" title="Moka — Ir para página central">
            <CafezinhoLogo size={26} opacity={0.85} /> <span>Moka</span>
          </Link>
          <SectionSwitcher active="reader" />
        </div>
        <div className="igot-topbar-actions">
          <BackButton />
          <AuthGate />
          <LangSwitcher />
          <button
            className={`gear ${configReady ? "" : "unset"}`}
            onClick={() => router.push("/configuracoes")}
            aria-label="Configurações de IA"
          >
            ⚙️
          </button>
          {/* 📊 Suas IAs e telemetria (pedido do Miguel, 22/08). */}
          <TelemetryIconButton />
        </div>
      </div>

      {/* Estante */}
      {loading ? (
        <div className="igot-loading">
          <div className="spinner" />
          <p>{t("shelf_loading")}</p>
        </div>
      ) : books.length === 0 && !addingBook ? (
        <Uploader
          onFile={handleFile}
          error={uploadError}
          configReady={configReady}
          onOpenSettings={() => router.push("/configuracoes")}
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
              {/* 📂 Direto do Google Drive (Miguel, 24/08): escolhe no Drive,
                  sobe pra estante sem baixar nada pro computador. */}
              <button className="add-book-btn" onClick={() => void openDrive()}>
                📂 {t("shelf_gdrive_btn")}
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

          {/* Modal 📂 Do Google Drive — lista PDFs/EPUBs e sobe sem baixar. */}
          {driveOpen && (
            <div
              className="gdrive-overlay"
              onClick={() => !driveFetching && setDriveOpen(false)}
            >
              <div className="gdrive-modal" onClick={(e) => e.stopPropagation()}>
                <div className="gdrive-head">
                  <h3>📂 {t("shelf_gdrive_btn")}</h3>
                  <button
                    className="ghost"
                    onClick={() => setDriveOpen(false)}
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>
                {driveNeedAuth ? (
                  <div className="gdrive-auth">
                    <p>{t("shelf_gdrive_need_auth")}</p>
                    <button className="add-book-btn" onClick={() => void reconnectGoogle()}>
                      {t("shelf_gdrive_reconnect")}
                    </button>
                  </div>
                ) : (
                  <>
                    <form
                      className="gdrive-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void openDrive(driveQuery);
                      }}
                    >
                      <input
                        type="search"
                        value={driveQuery}
                        onChange={(e) => setDriveQuery(e.target.value)}
                        placeholder={t("shelf_gdrive_search")}
                      />
                      <button type="submit" className="ghost">🔍</button>
                    </form>
                    {driveBusy && <p className="gdrive-hint">⏳ {t("shelf_gdrive_loading")}</p>}
                    {driveError && (
                      <p className="gdrive-hint">⚠️ {t("shelf_gdrive_error")} ({driveError})</p>
                    )}
                    {driveBooks !== null && driveBooks.length === 0 && !driveBusy && (
                      <p className="gdrive-hint">{t("shelf_gdrive_empty")}</p>
                    )}
                    <div className="gdrive-list">
                      {driveBooks?.map((b) => (
                        <button
                          key={b.id}
                          className="gdrive-item"
                          onClick={() => void pickDriveBook(b)}
                          disabled={!!driveFetching}
                        >
                          <span className="gdrive-name">{b.name}</span>
                          <span className="gdrive-meta">
                            {b.size ? `${(Number(b.size) / 1024 / 1024).toFixed(1)} MB · ` : ""}
                            {b.modifiedTime
                              ? new Date(b.modifiedTime).toLocaleDateString()
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                    {driveFetching && (
                      <p className="gdrive-hint">
                        ⏳ {t("shelf_gdrive_fetching", { name: driveFetching })}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Oferta da Biblioteca Livre (pedido do Miguel, 29/07) */}
          <a className="shelf-bib-link" href="/biblioteca">
            📚 <b>Biblioteca Livre</b> — livros grátis de domínio público,
            com capa e sinopse. <span>Baixe direto pra sua estante →</span>
          </a>

          {addingBook && (
            <div className="igot-loading">
              <div className="spinner" />
              <p>{t("shelf_adding")}</p>
            </div>
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
