"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { SettingsModal } from "@/components/SettingsModal";
import { SectionSwitcher } from "@/components/SectionSwitcher";
import { LangSwitcher } from "@/components/LangSwitcher";
import { TelemetryIconButton } from "@/components/TelemetryIconButton";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/components/I18nProvider";
import {
  hasConfig,
  loadConfigCache,
  getConfigSync,
  getEntryForVideo,
  getWhisperKey,
  getIngestServer,
  getTxService,
  getTxKey,
} from "@/lib/config";
import { getConta } from "@/lib/moka-conta";
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
  /** Transcrição da casa em andamento (polling) — elapsed em segundos. */
  | { kind: "listening"; elapsed: number }
  | { kind: "saving" }
  | { kind: "error"; message: string; linkHref?: string; linkLabel?: string };

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

/** Resposta do passo transcript/status do /api/ingest. */
type TxData = {
  meta?: VideoMeta;
  transcriptSource?: "captions" | "whisper" | "transkriptor";
  segments?: TranscriptSegment[];
  pending?: boolean;
  orderId?: string;
  cached?: boolean;
  debitado?: number;
  saldo?: number;
  error?: string;
  needsWhisperKey?: boolean;
  needsAccount?: boolean;
  insufficientFunds?: boolean;
};

/** Transcrições em andamento — sobrevivem a sair da página. */
const PENDING_KEY = "mokavideo.pendingJobs";
type PendingJob = { orderId: string; meta: VideoMeta; ts: number; service?: string };

function readPendingJobs(): Record<string, PendingJob> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.localStorage.getItem(PENDING_KEY) ?? "{}",
    ) as Record<string, PendingJob>;
  } catch {
    return {};
  }
}

function loadPendingJob(url: string): PendingJob | null {
  const j = readPendingJobs()[url.trim()];
  // Com mais de 2h, o job morreu do nosso lado — submete de novo.
  if (!j || Date.now() - j.ts > 2 * 3600_000) return null;
  return j;
}

function savePendingJob(
  url: string,
  orderId: string,
  meta: VideoMeta,
  service?: string,
): void {
  if (typeof window === "undefined") return;
  const all = readPendingJobs();
  all[url.trim()] = { orderId, meta, ts: Date.now(), ...(service ? { service } : {}) };
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
}

function clearPendingJob(url: string): void {
  if (typeof window === "undefined") return;
  const all = readPendingJobs();
  delete all[url.trim()];
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
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
  // Serviço de transcrição próprio configurado? (🎨 ⚙️ → 🎬 Moka Vídeo)
  const [txServiceActive, setTxServiceActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConfigCache().then(() => {
      if (!cancelled) {
        setConfigReady(hasConfig());
        setTxServiceActive(Boolean(getTxService()));
      }
    });
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
        // Caminho de leitura: servidor das ⚙️ (se configurado) > o próprio
        // site (legendas ou transcrição da casa). Um endereço errado nas ⚙️
        // NUNCA pode derrubar a leitura (bug do Miguel, 2026-07-22).
        const customServer = getIngestServer();
        let ingestBase = customServer || "";
        let usedPath = customServer ? `servidor (${customServer})` : "site";

        let fellBack = false;
        const downgrade = () => {
          fellBack = true;
          ingestBase = "";
          usedPath = "site";
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
            if (res.status === 404 && customServer && !fellBack) {
              downgrade();
              return doFetch();
            }
            return res;
          } catch (err) {
            if (customServer && !fellBack) {
              downgrade();
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
          // Diagnóstico (caminho usado, fallback) vai pro console — a tela
          // do usuário mostra só a mensagem amigável da API.
          console.debug("[video] meta falhou — caminho:", usedPath, "caiu pro plano B:", fellBack);
          throw new Error(metaData.error ?? "Não consegui ler esse link.");
        }

        // 2) Transcrição — legendas (grátis, instantâneo) ou a casa ouvindo
        //    o áudio (com pontos, pode levar alguns minutos).
        setStage(metaData.hasCaptions ? { kind: "captions" } : { kind: "whisper" });
        const conta = getConta();
        const contaBody = conta
          ? { conta: { email: conta.email, senha: conta.senha } }
          : {};

        // Serviço de transcrição PRÓPRIO (BYOK — ⚙️ → 🎬 Moka Vídeo): quem
        // baixa o vídeo é o serviço escolhido, no IP dele. Vai como header
        // em TODAS as chamadas (transcript e polling de status).
        const txService = getTxService();
        const txKey = txService ? ((await getTxKey()) ?? "") : "";
        const txHeaders: Record<string, string> = {};
        if (txService && txKey) {
          txHeaders["x-tx-service"] = txService;
          txHeaders["x-tx-key"] = txKey;
        }

        // Ficou uma transcrição pendente DESTE link (usuário saiu e voltou)?
        // Retoma o polling em vez de submeter de novo — mas SÓ se o job
        // pertence ao serviço configurado agora (trocou de serviço = submete de novo).
        const pendingJob = loadPendingJob(link);
        const pendingCompatible =
          pendingJob &&
          (!pendingJob.service || !txService || pendingJob.service === txService);
        let txData: TxData;
        if (pendingCompatible && pendingJob) {
          txData = { pending: true, orderId: pendingJob.orderId, meta: pendingJob.meta };
        } else {
          if (pendingJob) clearPendingJob(link);
          // Chave pra transcrever: usa a chave de vídeo (Whisper) SE existir,
          // senão usa a chave OpenAI ATIVA do cofre (mesma de texto).
          // (Antes só usava Whisper separada — agora OpenAI ativa também serve.)
          let whisperKey = (await getWhisperKey()) ?? "";
          if (!whisperKey) {
            // Usa a entry marcada pra vídeo (useForVideo), senão a ativa.
            const videoConfig = getEntryForVideo();
            if (videoConfig) {
              whisperKey = videoConfig.apiKey;
            }
          }
          const txRes = await postIngest(
            { url: link, step: "transcript", ...contaBody },
            {
              ...(whisperKey ? { "x-openai-key": whisperKey } : {}),
              ...txHeaders,
            },
          );
          txData = (await safeJson(txRes)) as TxData;
        }

        // Transcrição em andamento (casa ou serviço próprio) → polling.
        if (txData.pending && txData.orderId) {
          const orderId = txData.orderId;
          savePendingJob(link, orderId, txData.meta ?? metaData.meta, txService || undefined);
          const t0 = Date.now();
          for (;;) {
            setStage({ kind: "listening", elapsed: Math.floor((Date.now() - t0) / 1000) });
            await new Promise((r) => setTimeout(r, 12_000));
            const elapsed = Math.floor((Date.now() - t0) / 1000);
            if (elapsed > 45 * 60) {
              clearPendingJob(link);
              throw new Error(
                txService
                  ? "Seu serviço de transcrição está demorando mais que o normal. " +
                      "Tente de novo mais tarde — o Moka não cobra nada por isso."
                  : "A transcrição está demorando mais que o normal. Tente de novo " +
                      "mais tarde — seus pontos só são descontados quando o texto aparece.",
              );
            }
            const stRes = await postIngest(
              {
                url: link,
                step: "status",
                orderId,
                ...contaBody,
              },
              txHeaders,
            );
            const stData = (await safeJson(stRes)) as TxData;
            if (stData.pending) continue;
            txData = stData;
            break;
          }
        }

        if (!txData.segments) {
          clearPendingJob(link);
          console.debug("[video] transcrição falhou — caminho:", usedPath, "caiu pro plano B:", fellBack);
          if (txData.insufficientFunds) {
            setStage({
              kind: "error",
              message: txData.error ?? "Seus pontos não cobrem esta transcrição.",
              linkHref: "/experimente",
              linkLabel: "☕ Comprar pontos",
            });
            return;
          }
          // Recado da queda (ordem do Miguel 27/08): falhou e NÃO tem serviço
          // próprio configurado? Aponta pras ⚙️ — lá a pessoa cola a chave de
          // um serviço de transcrição (tem opção grátis) e o vídeo passa a
          // ser baixado pelo IP do serviço, imune ao bloqueio.
          if (!txService) {
            setStage({
              kind: "error",
              message:
                (txData.error ?? "Não consegui transcrever o vídeo.") +
                " " +
                t("video_tx_hint"),
              linkHref: "/configuracoes",
              linkLabel: t("video_tx_link"),
            });
            return;
          }
          throw new Error(txData.error ?? "Não consegui transcrever o vídeo.");
        }
        clearPendingJob(link);

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
    [url, busy, router],
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
          <AuthGate />
          <LangSwitcher />
          <button
            className={`gear ${configReady ? "" : "unset"}`}
            onClick={() => router.push("/configuracoes")}
            aria-label="Configurações de IA"
            title="Configurações de IA"
          >
            ⚙️
          </button>
          {/* 📊 Suas IAs e telemetria (pedido do Miguel, 22/08). */}
          <TelemetryIconButton />
        </div>
      </div>

      {/* Herói: cola o link */}
      <section className="hero">
        <h1 className="hero-title">
          {t("video_hero_1")} <em>{t("video_hero_em")}</em>.<br />
          {t("video_hero_2")}
        </h1>
        <p className="hero-sub">{t("video_hero_sub")}</p>

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
        {/* Servidor próprio das ⚙️ (feature avançada — o usuário comum nunca vê) */}
        {getIngestServer() && (
          <p className="ingest-badge">
            🖥️ Lendo através do seu servidor: <strong>{getIngestServer()}</strong>{" "}
            (das ⚙️ — apague lá pra voltar ao automático).
          </p>
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
              {stage.kind === "listening" && (
                <>
                  <strong>Ouvindo o vídeo… 🎧</strong>
                  <span>
                    {stage.elapsed >= 60
                      ? `já faz ${Math.floor(stage.elapsed / 60)} min — vídeo longo demora mais. `
                      : ""}
                    {txServiceActive
                      ? t("video_listening_own")
                      : "Seus pontos só são descontados quando o texto fica pronto."}
                  </span>
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
          <p className="hero-error">
            ⚠️ {stage.message}{" "}
            {stage.linkHref && (
              <Link href={stage.linkHref}>{stage.linkLabel ?? "Saiba mais"}</Link>
            )}
          </p>
        )}

        {!configReady && (
          <div className="config-callout">
            <strong>{t("video_config_first")}</strong>
            <button className="config-callout-btn" onClick={() => router.push("/configuracoes")}>
              {t("video_config_btn")}
            </button>
            <span>{t("video_config_hint")}</span>
          </div>
        )}
      </section>

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
          {/* Link RELATIVO (não absoluto pro mokareader.com): o espelho tem
              que se conter em si mesmo em todas as páginas (Miguel, 22/08). */}
          <Link href="/">
            Moka Reader
          </Link>
        </span>
        <span className="footer-sep">·</span>
        <Link href="/sobre">{t("nav_about")}</Link>
        <span className="footer-sep">·</span>
        <Link href="/ajuda">{t("help_title")}</Link>
      </footer>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setConfigReady(hasConfig())}
        />
      )}

          <SiteFooter />
    </main>
  );
}
