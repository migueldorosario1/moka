"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Reader } from "@/components/Reader";
import { useI18n } from "@/components/I18nProvider";
import { AIPanel } from "@/components/AIPanel";
import { hasConfig, loadConfigCache } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { getBook } from "@/lib/repository";
import { saveToLibrary } from "@/lib/repository";
import type { Session } from "@/lib/db";
import type { SelectionAction } from "@/lib/types";

/**
 * Rota /book/[id] — abre um livro específico da estante.
 * Cada livro tem URL própria (compartilhável, voltável).
 */
export default function BookPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const auth = useAuth();
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [action, setAction] = useState<SelectionAction | null>(null);
  // Painel oculto/mostrado (separado de ter ação ou não).
  // Ocultar NÃO perde a ação — só esconde visualmente.
  const [panelVisible, setPanelVisible] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Reconstrói o ArrayBuffer a partir do Uint8Array (cópia defensiva).
  // MEMOIZADO: deve vir ANTES de TODOS os early returns (Rules of Hooks).
  const pdfSource = useMemo(() => {
    if (!session?.pdfSource) return null;
    const copy = new ArrayBuffer(session.pdfSource.byteLength);
    new Uint8Array(copy).set(session.pdfSource);
    return copy;
  }, [session?.pdfSource]);

  // Carrega o livro pelo ID da URL.
  useEffect(() => {
    loadConfigCache().then(() => setConfigReady(hasConfig())).catch(() => {});
    let cancelled = false;
    (async () => {
      try {
        const book = await getBook(params.id);
        if (cancelled) return;
        if (book) {
          setSession(book);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("[moka] Erro ao carregar livro:", err);
        setNotFound(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Salva mudanças (página, zoom, traduções, notas) com debounce.
  useEffect(() => {
    if (!session || loading) return;
    const t = setTimeout(() => {
      const updated = { ...session, savedAt: Date.now() };
      saveToLibrary(updated, auth.userId).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [session, loading, auth.userId]);

  const handleSelection = (a: SelectionAction) => {
    setAction(a);
    setPanelVisible(true);
  };
  const handleClosePanel = () => setAction(null);
  /** Oculta o painel sem perder a ação (pode reabrir depois). */
  const handleHidePanel = () => setPanelVisible(false);

  const updateSession = (patch: Partial<Session>) =>
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));

  if (loading) {
    return (
      <main className="igot-shell">
        <div className="igot-loading">
          <div className="spinner" />
          <p>{t("err_opening_book")}</p>
        </div>
      </main>
    );
  }

  if (notFound || !session) {
    return (
      <main className="igot-shell">
        <div className="igot-loading">
          <p>{t("err_book_not_found")}</p>
          <button onClick={() => router.push("/")} className="back-btn">
            {t("err_back_shelf")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="igot-shell">
      <div className={`igot-workspace igot-workspace-no-topbar ${action ? "has-panel" : ""}`}>
        <Reader
          book={session.book}
          pdfSource={pdfSource}
          onSelection={handleSelection}
          panelVisible={panelVisible}
          onTogglePanel={() => setPanelVisible((v) => !v)}
          initialChapterIdx={session.chapterIdx}
          initialZoom={session.zoom}
          onChapterChange={(n) => updateSession({ chapterIdx: n })}
          onZoomChange={(z) => updateSession({ zoom: z })}
          onCloseBook={() => router.push("/")}
          auth={auth}
          onOpenSettings={() => setSettingsOpen(true)}
          settingsOpen={settingsOpen}
          onCloseSettings={() => setSettingsOpen(false)}
          onSettingsSaved={() => setConfigReady(hasConfig())}
          configReady={configReady}
          translations={session.translations ?? {}}
          onPageTranslation={(chapIdx, text) => {
            const key = String(chapIdx + 1);
            updateSession({
              translations: { ...(session.translations ?? {}), [key]: text },
            });
          }}
          notes={session.notes ?? []}
          onRemoveNote={(id) =>
            updateSession({
              notes: (session.notes ?? []).filter((n) => n.id !== id),
            })
          }
          onSaveNote={(entry) =>
            updateSession({
              notes: [
                {
                  ...entry,
                  id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  savedAt: Date.now(),
                },
                ...(session.notes ?? []),
              ],
            })
          }
          bookmarks={session.bookmarks ?? []}
          onToggleBookmark={(chapIdx) => {
            const existing = session.bookmarks ?? [];
            const has = existing.some((b) => b.chapterIdx === chapIdx);
            updateSession({
              bookmarks: has
                ? existing.filter((b) => b.chapterIdx !== chapIdx)
                : [...existing, { chapterIdx: chapIdx, savedAt: Date.now() }],
            });
          }}
          onGoToShelf={() => {
            // Avisa a home que viemos clicando em "estante" (não auto-abre livro).
            sessionStorage.setItem("igot.backToEstante", "1");
            router.push("/");
          }}
        />
      </div>
      {/* AIPanel FORA do grid do workspace — não interfere no layout.
          Flutua como overlay independente. */}
      {action && panelVisible && (
        <div className="ai-panel-overlay">
          <AIPanel
            action={action}
            book={session.book}
            onClose={() => { setAction(null); setPanelVisible(false); }}
            onHide={handleHidePanel}
            onSaveNote={(entry) =>
              updateSession({
                notes: [
                  {
                    ...entry,
                    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    savedAt: Date.now(),
                  },
                  ...(session.notes ?? []),
                ],
              })
            }
          />
        </div>
      )}
      <style jsx>{`
        .back-btn {
          margin-top: 16px;
          padding: 8px 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--accent);
          border-radius: 8px;
          cursor: pointer;
        }
      `}</style>
    </main>
  );
}

