"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { SettingsModal } from "@/components/SettingsModal";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SectionSwitcher } from "@/components/SectionSwitcher";
import { ContaButton } from "@/components/ContaButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/components/I18nProvider";
import {
  hasConfig,
  loadConfigCache,
  getWhisperKey,
  getIngestServer,
  probeLocalIngest,
  getLocalNetPermission,
  ingestBaseAuto,
} from "@/lib/config";
import {
  listVideos,
  findVideoByUrl,
  saveVideo,
  deleteVideo,
  clearAllVideos,
  formatTime,
  type VideoRecord,
  type VideoMeta,
  type TranscriptSegment,
} from "@/lib/video/db";

/** Etapas do processamento, exibidas em tempo real pro usuário. */
type Stage =
  | { kind: "idle" }
  | { kind: "meta" }
  | { kind: "captions" }
  | { kind: "whisper" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

const PLATFORM_ICON: Record<string, string> = {
  youtube: "▶️",
  twitter: "🐦",
  instagram: "📸",
};

/**
 * Lê a resposta da API com segurança: se não vier JSON (ex.: página de
 * erro HTML da infra), devolve mensagem amigável em vez de estourar
 * "Unexpected token '<'" na cara do usuário.
 */
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      error: res.ok
        ? "Resposta inesperada do servidor. Tente de novo."
        : `O servidor tropeçou (${res.status}). Tente de novo em alguns minutos — ou use o Moka Video no computador.`,
    };
  }
}

/**
 * Home do Moka Video = cola o link + videoteca.
 *
 * O campo de link é o protagonista (como o Uploader do Moka Reader):
 * colou, o Moka "assiste" por você. Abaixo, os vídeos já lidos viram
 * cards na prateleira — local-first, tudo no IndexedDB do navegador.
 */
export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const auth = useAuth();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [configReady, setConfigReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Servidor de leitura ativo: "local" (seu computador), "custom" (das ⚙️) ou null (o próprio site). */
  const [ingestMode, setIngestMode] = useState<"local" | "custom" | null>(null);
  /** Permissão "Local Network Access" do navegador (Chrome a bloqueia por padrão). */
  const [lnaState, setLnaState] = useState<"granted" | "denied" | "prompt" | "unknown" | null>(null);

  /** Tenta ligar o motor local (dispara o pedido de permissão do Chrome se for "prompt"). */
  const tryEnableLocal = useCallback(async () => {
    const ok = await probeLocalIngest(true);
    if (ok) {
      setIngestMode("local");
      setLnaState("granted");
    } else {
      setLnaState(await getLocalNetPermission());
    }
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadConfigCache().then(() => {
      if (!cancelled) setConfigReady(hasConfig());
    });
    // Auto-detecta o Moka Video local (lê pelo IP da casa do usuário).
    if (getIngestServer()) {
      setIngestMode("custom");
    } else {
      (async () => {
        const ok = await probeLocalIngest();
        if (cancelled) return;
        if (ok) {
          setIngestMode("local");
          setLnaState("granted");
        } else {
          setLnaState(await getLocalNetPermission());
        }
      })();
    }
    listVideos()
      .then((list) => {
        if (!cancelled) setVideos(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = stage.kind !== "idle" && stage.kind !== "error";

  /** Cola da área de transferência direto no campo (conveniência mobile). */
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // permissão negada — o usuário cola manualmente
    }
  }, []);

  /** Pipeline: link → metadados → transcrição → salva → abre a análise. */
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const link = url.trim();
      if (!link || busy) return;
      setStage({ kind: "meta" });

      try {
        // Já foi lido? Abre direto (dedupe por URL normalizada).
        const existing = await findVideoByUrl(link).catch(() => null);
        if (existing) {
          router.push(`/video/${existing.id}`);
          return;
        }

        // 1) Metadados (rápido).
        // Resolve o caminho de leitura: servidor das ⚙️ > motor local > site.
        // Re-sonda o motor local a cada leitura (antes era só na abertura
        // da página — info velha causava "servidor tropeçou (404)").
        const customServer = getIngestServer();
        let mode: "local" | "custom" | null = customServer ? "custom" : null;
        if (!customServer) {
          const localOk = await probeLocalIngest(true);
          mode = localOk ? "local" : null;
          if (mode !== ingestMode) setIngestMode(mode);
        }
        let ingestBase = ingestBaseAuto(mode === "local");
        let usedPath =
          mode === "custom" ? `servidor (${customServer})` : mode === "local" ? "computador" : "site";

        /** POST /api/ingest com fallback em cadeia: servidor das ⚙️ quebrado
            → motor local → próprio site. Um endereço errado salvo nas ⚙️
            NUNCA pode derrubar a leitura (bug do Miguel, 2026-07-22). */
        let fellBack = false;
        const downgrade = async () => {
          fellBack = true;
          const localOk = customServer ? await probeLocalIngest(true) : false;
          if (localOk) {
            ingestBase = ingestBaseAuto(true);
            usedPath = "computador";
          } else {
            ingestBase = "";
            usedPath = "site";
          }
        };
        const postIngest = async (
          body: Record<string, unknown>,
          headers: Record<string, string> = {},
        ) => {
          const doFetch = () =>
            fetch(`${ingestBase}/api/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify(body),
            });
          try {
            const res = await doFetch();
            // Servidor configurado respondendo 404 = endereço errado nas ⚙️.
            if (res.status === 404 && mode !== null && !fellBack) {
              await downgrade();
              return doFetch();
            }
            return res;
          } catch (err) {
            if (mode !== null && !fellBack) {
              await downgrade();
              return doFetch();
            }
            throw err;
          }
        };

        const metaRes = await postIngest({ url: link, step: "meta" });
        const metaData = (await safeJson(metaRes)) as {
          meta?: VideoMeta;
          hasCaptions?: boolean;
          error?: string;
        };
        if (!metaRes.ok || !metaData.meta) {
          throw new Error(
            (metaData.error ?? "Não consegui ler esse link.") +
              ` (caminho: ${usedPath}${fellBack ? " — o servidor das ⚙️ falhou e eu caí pro plano B" : ""})`,
          );
        }

        // 2) Transcrição — legendas (instantâneo) ou Whisper (demora mais).
        setStage(metaData.hasCaptions ? { kind: "captions" } : { kind: "whisper" });
        const whisperKey = (await getWhisperKey()) ?? "";
        const txRes = await postIngest(
          { url: link, step: "transcript" },
          whisperKey ? { "x-openai-key": whisperKey } : {},
        );
        const txData = (await safeJson(txRes)) as {
          meta?: VideoMeta;
          transcriptSource?: "captions" | "whisper";
          segments?: TranscriptSegment[];
          error?: string;
          needsWhisperKey?: boolean;
        };
        if (!txRes.ok || !txData.segments) {
          const base = txData.error ?? "Não consegui transcrever o vídeo.";
          const hint =
            usedPath === "site"
              ? " Dica: abra http://localhost:3100 direto no navegador — lá a leitura é completa."
              : "";
          throw new Error(
            `${base} (caminho: ${usedPath}${fellBack ? " — o servidor das ⚙️ falhou e eu caí pro plano B" : ""})${hint}`,
          );
        }

        // 3) Salva na videoteca e abre.
        setStage({ kind: "saving" });
        const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const record: VideoRecord = {
          id,
          url: link,
          meta: txData.meta ?? metaData.meta,
          transcriptSource: txData.transcriptSource ?? "captions",
          segments: txData.segments,
          analyses: {},
          createdAt: Date.now(),
          savedAt: Date.now(),
        };
        await saveVideo(record);
        router.push(`/video/${id}`);
      } catch (err) {
        setStage({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [url, busy, router, ingestMode],
  );

  return (
    <main className="igot-shell">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <Link href="/" className="brand" title="Moka — Ir para página central">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </Link>
          <SectionSwitcher active="video" />
        </div>
        <div className="igot-topbar-actions">
          <ContaButton />
          <LangSwitcher />
          <button
            className={`gear ${configReady ? "" : "unset"}`}
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações de IA"
            title="Configurações de IA"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Herói: cola o link */}
      <section className="hero">
        <h1 className="hero-title">
          {t("video_hero_1")} <em>{t("video_hero_em")}</em>.<br />
          {t("video_hero_2")}
        </h1>
        <p className="hero-sub">{t("video_hero_sub")}</p>
        <p className="hero-install-note">{t("video_install_note")}</p>

        <form className="link-form" onSubmit={handleSubmit}>
          <input
            type="url"
            className="link-input"
            placeholder={t("video_input_ph")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <button
            type="submit"
            className="link-submit"
            disabled={busy || !url.trim()}
            title="Ler o vídeo"
          >
            {busy ? t("video_reading") : t("video_read")}
          </button>
        </form>
        <button className="paste-btn" onClick={handlePasteFromClipboard} disabled={busy}>
          {t("video_paste")}
        </button>

        {/* Selo: o site está lendo através do computador do usuário
            (o IP da casa dele — que o YouTube não bloqueia). */}
        {ingestMode === "local" && (
          <p className="ingest-badge">
            🖥️ <strong>Leitura turbinada:</strong> achei o Moka Video rodando no
            seu computador — vou ler por ele, usando a internet da sua casa
            (o YouTube não bloqueia).
          </p>
        )}
        {ingestMode === "custom" && (
          <p className="ingest-badge">
            🖥️ Lendo através do seu servidor: <strong>{getIngestServer()}</strong>{" "}
            (das ⚙️ — apague lá pra voltar ao automático).
          </p>
        )}

        {/* Chrome bloqueia site→localhost até o usuário permitir
            ("Local Network Access"). Guia claro, sem tecniquês. */}
        {!ingestMode && lnaState === "prompt" && (
          <div className="lna-card">
            <strong>🔓 Falta uma permissão do navegador</strong>
            <span>
              O Chrome precisa da sua autorização pra o site conversar com o
              motor do Moka no seu computador. Toque no botão — o Chrome vai
              perguntar; escolha <strong>“Permitir”</strong>.
            </span>
            <button className="lna-btn" onClick={() => void tryEnableLocal()}>
              🔓 Permitir ligação com meu computador
            </button>
          </div>
        )}
        {!ingestMode && lnaState === "denied" && (
          <div className="lna-card">
            <strong>🔒 O navegador bloqueou a ligação com seu computador</strong>
            <span>
              Em alguma tentativa anterior, o acesso foi negado. Pra liberar:
              clique no <strong>cadeado 🔒</strong> ao lado do endereço do site
              → <strong>Configurações do site</strong> →{" "}
              <strong>Acesso à rede local</strong> → <strong>Permitir</strong>{" "}
              — e depois recarregue esta página.
            </span>
            <button className="lna-btn" onClick={() => void tryEnableLocal()}>
              ↻ Já liberei — tentar de novo
            </button>
          </div>
        )}

        {/* Progresso por etapa (real: o cliente chama a API em duas fases) */}
        {stage.kind !== "idle" && stage.kind !== "error" && (
          <div className="stage-card">
            <div className="spinner" />
            <div className="stage-text">
              {stage.kind === "meta" && (
                <>
                  <strong>{t("video_step_connect")}</strong>
                  <span>lendo título, canal e duração</span>
                </>
              )}
              {stage.kind === "captions" && (
                <>
                  <strong>{t("video_step_captions")}</strong>
                  <span>o vídeo tem legendas — é rapidinho</span>
                </>
              )}
              {stage.kind === "whisper" && (
                <>
                  <strong>{t("video_step_transcribe")}</strong>
                  <span>sem legendas — o Moka está ouvindo o vídeo (pode levar alguns minutos)</span>
                </>
              )}
              {stage.kind === "saving" && (
                <>
                  <strong>{t("video_step_save")}</strong>
                  <span>quase lá</span>
                </>
              )}
            </div>
          </div>
        )}
        {stage.kind === "error" && (
          <p className="hero-error">⚠️ {stage.message}</p>
        )}

        {!configReady && (
          <div className="config-callout">
            <strong>{t("video_config_first")}</strong>
            <button className="config-callout-btn" onClick={() => setSettingsOpen(true)}>
              {t("video_config_btn")}
            </button>
            <span>
              (é o botão de engrenagem lá em cima, no canto direito — a chave
              fica só no seu navegador)
            </span>
          </div>
        )}
      </section>

      <InstallPrompt />

      {/* Videoteca */}
      <section className="shelf">
        {loading ? (
          <div className="igot-loading">
            <div className="spinner" />
          </div>
        ) : videos.length > 0 ? (
          <>
            <div className="shelf-header">
              <h2 className="shelf-title">{t("video_shelf")}</h2>
              <button
                className="clear-shelf-btn"
                onClick={async () => {
                  if (confirm(t("video_clear_confirm", { n: videos.length }))) {
                    await clearAllVideos();
                    setVideos([]);
                  }
                }}
                title={t("video_clear_all")}
              >
                {t("video_clear_all")}
              </button>
            </div>
            <div className="shelf-grid">
              {videos.map((v) => (
                <div key={v.id} className="video-card-wrapper">
                  <Link href={`/video/${v.id}`} className="video-card">
                    <div className="video-thumb">
                      {v.meta.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.meta.thumbnail} alt="" />
                      ) : (
                        <div className="video-thumb-placeholder">
                          <span>{PLATFORM_ICON[v.meta.platform] ?? "🎬"}</span>
                        </div>
                      )}
                      <span className="video-duration">
                        {formatTime(v.meta.durationSec)}
                      </span>
                      <span className="video-platform">
                        {PLATFORM_ICON[v.meta.platform] ?? "🎬"}
                      </span>
                    </div>
                    <div className="video-info">
                      <h3 className="video-title">{v.meta.title}</h3>
                      <p className="video-channel">{v.meta.channel}</p>
                      <p className="video-flags">
                        {v.transcriptSource === "captions" ? t("video_captions") : t("video_whisper")}
                        {Object.keys(v.analyses).length > 0 &&
                          ` · ${Object.keys(v.analyses).length} análise${Object.keys(v.analyses).length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </Link>
                  <button
                    className="video-delete-btn"
                    title={t("video_remove_title")}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm(t("video_remove_confirm", { title: v.meta.title }))) {
                        await deleteVideo(v.id);
                        setVideos((prev) => prev.filter((x) => x.id !== v.id));
                      }
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <footer className="home-footer">
        <CafezinhoLogo size={16} opacity={0.5} />
        <span>
          Moka Video — um produto Cafezinho, irmão do{" "}
          <a href="https://www.mokareader.com" target="_blank" rel="noreferrer">
            Moka Reader
          </a>
        </span>
        <span className="footer-sep">·</span>
        <Link href="/sobre">Quem somos</Link>
        <span className="footer-sep">·</span>
        <Link href="/socios">🤝 Sócios</Link>
        <span className="footer-sep">·</span>
        <Link href="/ajuda">Ajuda</Link>
      </footer>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setConfigReady(hasConfig())}
        />
      )}

    </main>
  );
}
