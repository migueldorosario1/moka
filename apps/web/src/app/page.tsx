"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Uploader } from "@/components/Uploader";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { SettingsModal } from "@/components/SettingsModal";
import { SectionSwitcher } from "@/components/SectionSwitcher";
import { CloseAppButton } from "@/components/CloseAppButton";
import { VisitPing } from "@/components/VisitPing";
import { AuthButton } from "@/components/AuthButton";
import { hasConfig, loadConfigCache } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { listLibrary, saveToLibrary, removeFromLibrary, clearAllBooks } from "@/lib/repository";
import {
  migrateLegacyBook,
  type Session,
} from "@/lib/db";
import { parseBook } from "@igot/parser";

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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      // Se tem livros e o usuário não veio clicando em "estante" (voltar),
      // abre automaticamente o último lido.
      const cameFromEstante = sessionStorage.getItem("igot.backToEstante") === "1";
      // Se veio do botão "Abrir novo" do Reader, abre o seletor de arquivo.
      const openUploader = sessionStorage.getItem("moka.openUploader") === "1";
      if (openUploader) {
        sessionStorage.removeItem("moka.openUploader");
        // Dispara o clique no input de arquivo depois de renderizar.
        setTimeout(() => document.getElementById("file-input")?.click(), 300);
      } else if (cameFromEstante) {
        sessionStorage.removeItem("igot.backToEstante");
      } else if (list.length > 0) {
        const lastRead = list.reduce((a, b) =>
          (b.savedAt ?? 0) > (a.savedAt ?? 0) ? b : a,
        );
        router.replace(`/book/${lastRead.id}`);
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
  const handleFile = useCallback(
    async (file: File) => {
      setAddingBook(true);
      setUploadError(null);
      try {
        const data = await file.arrayBuffer();

        // ANTES de parsear, checa se já existe pelo tamanho do arquivo.
        // DEDUP DEFENSIVO: entre os candidatos, PREFERE o que tem chapters válidos.
        const existingBySize = books.find(
          (b) => b.fileName === file.name && b.fileSize === file.size
            && (b.book?.chapters?.length ?? 0) > 0,
        ) ?? books.find(
          (b) => b.fileName === file.name && b.fileSize === file.size,
        );
        if (existingBySize) {
          router.push(`/book/${existingBySize.id}`);
          return;
        }

        const result = await parseBook({ data: data.slice(0), fileName: file.name });
        if (result.ok) {
          // DEDUPLICAÇÃO por título — também prefere chapters válidos.
          const existingByTitle = books.find(
            (b) => b.book.title === result.book?.title
              && (b.book?.chapters?.length ?? 0) > 0,
          ) ?? books.find(
            (b) => b.book.title === result.book?.title,
          );
          if (existingByTitle) {
            existingByTitle.pdfSource = result.book.sourceFormat === "pdf" ? new Uint8Array(data) : null;
            await saveToLibrary(existingByTitle, auth.userId);
            router.push(`/book/${existingByTitle.id}`);
            return;
          }

          // Livro NOVO — cria entry na estante.
          const bookId = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const session: Session = {
            id: bookId,
            fileName: file.name,
            fileSize: file.size,
            book: result.book,
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

  return (
    <main className="igot-shell">
      <VisitPing />
      {/* TopBar com logo clicável */}
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <div className="brand" title="Moka — livros e vídeos">
            <CafezinhoLogo size={26} opacity={0.85} /> <span>Moka</span>
          </div>
          <SectionSwitcher active="reader" />
        </div>
        <div className="igot-topbar-actions">
          <CloseAppButton />
          <a href="/premium" className="premium-link" title="Moka Premium">⭐</a>
          <LangSwitcher />
          <AuthButton
            status={auth.status}
            userName={auth.user?.user_metadata?.full_name ?? null}
            avatarUrl={auth.user?.user_metadata?.avatar_url ?? null}
            onSignIn={auth.signInWithGoogle}
            onSignOut={auth.signOut}
          />
          <button
            className={`gear ${configReady ? "" : "unset"}`}
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações de IA"
          >
            ⚙️
          </button>
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
          onOpenSettings={() => setSettingsOpen(true)}
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
                    {book.coverImage ? (
                      <img src={book.coverImage} alt="" />
                    ) : (
                      <div className="book-cover-placeholder">
                        <span className="book-cover-icon">📖</span>
                        <span className="book-cover-format">{book.book.sourceFormat.toUpperCase()}</span>
                      </div>
                    )}
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

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setConfigReady(hasConfig())}
        />
      )}

      <style jsx>{`
        .premium-link {
          font-size: 20px;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: var(--radius);
          transition: background var(--transition), transform var(--transition);
        }
        .premium-link:hover {
          background: var(--accent-soft);
        }
        .premium-link:active {
          transform: scale(0.94);
        }
        .shelf-page {
          flex: 1;
          overflow-y: auto;
          padding: 32px 40px 100px;
        }
        .shelf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .shelf-header h1 {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 30px;
          font-weight: 600;
          letter-spacing: 0.005em;
        }
        .shelf-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .add-book-btn {
          padding: 10px 20px;
          border: none;
          background: linear-gradient(180deg, var(--accent), var(--accent-dark));
          color: #fff8ee;
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          box-shadow: var(--shadow-sm);
          transition: box-shadow var(--transition), transform var(--transition),
            filter var(--transition);
        }
        .add-book-btn:hover {
          box-shadow: var(--shadow);
          transform: translateY(-1px);
          filter: brightness(1.05);
        }
        .add-book-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .clear-shelf-btn {
          padding: 9px 16px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: border-color var(--transition), color var(--transition),
            background var(--transition);
        }
        .clear-shelf-btn:hover {
          border-color: var(--border);
          background: var(--surface);
          color: var(--accent-dark);
        }
        .book-card-wrapper {
          position: relative;
        }
        .book-delete-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 32px;
          height: 32px;
          border: none;
          background: rgba(30, 20, 12, 0.55);
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
          color: #fff8ee;
          border-radius: 50%;
          font-size: 13px;
          cursor: pointer;
          opacity: 0.65; /* sempre visível em touch (sem hover no iPad) */
          transition: opacity var(--transition), background var(--transition);
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .book-delete-btn:hover {
          opacity: 1;
          background: rgba(126, 69, 34, 0.9);
        }
        .shelf-error {
          padding: 12px 16px;
          background: var(--accent-soft);
          border-radius: var(--radius);
          color: var(--accent-dark);
          font-size: var(--text-sm);
          margin-bottom: 16px;
          border: 1px solid var(--gold);
        }
        .shelf-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 32px 24px;
        }
        .book-card {
          text-decoration: none;
          color: var(--text);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        /* Capa como livro de verdade: lombada à esquerda, cantos de folha
           à direita, sombra que aprofunda no hover (o livro "levanta"). */
        .book-cover {
          position: relative;
          aspect-ratio: 2 / 3;
          background: var(--surface-alt);
          border-radius: 3px 8px 8px 3px;
          overflow: hidden;
          box-shadow: var(--shadow);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: box-shadow 280ms var(--ease), transform 280ms var(--ease);
        }
        .book-cover::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          background: linear-gradient(
            to right,
            rgba(30, 20, 12, 0.18) 0%,
            rgba(30, 20, 12, 0.05) 3%,
            rgba(255, 255, 255, 0.12) 5%,
            transparent 8%
          );
          box-shadow: inset 0 0 0 1px rgba(62, 42, 24, 0.06);
        }
        .book-card:hover .book-cover {
          transform: translateY(-6px) rotate(-0.5deg);
          box-shadow: var(--shadow-lg);
        }
        .book-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .book-cover-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: var(--text-muted);
        }
        .book-cover-icon {
          font-size: 34px;
          opacity: 0.75;
        }
        .book-cover-format {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          background: var(--surface);
          border-radius: var(--radius-pill);
          box-shadow: var(--shadow-sm);
        }
        .book-info {
          text-align: center;
        }
        .book-title {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .book-author {
          margin: 3px 0 0;
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .book-progress {
          margin: 4px 0 0;
          font-size: 11px;
          letter-spacing: 0.03em;
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
