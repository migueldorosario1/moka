/**
 * POST /api/ingest — o "estômago" do Moka Video.
 *
 * Recebe o link do vídeo (YouTube, X/Twitter, Instagram, mp4 direto…) e
 * devolve metadados + transcrição com timestamps. Duas etapas (o cliente
 * chama duas vezes, pra mostrar progresso real):
 *
 *   step: "meta"       → yt-dlp -j (rápido): título, canal, duração,
 *                        thumbnail, plataforma, e se há legendas.
 *   step: "transcript" → 1) legendas oficiais/auto (grátis, instantâneo)
 *                        2) fallback: baixa o áudio (yt-dlp) e transcreve
 *                           com Whisper (OpenAI) em pedaços de 10 min.
 *
 * Requisitos do servidor: binários `yt-dlp` e `ffmpeg` no PATH.
 * Privacidade: a chave OpenAI (Whisper) vem no header `x-openai-key`,
 * é usada só na transcrição e nunca persistida. Arquivos temporários
 * são apagados ao final de cada requisição.
 */

import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);

export const runtime = "nodejs";
// Whisper em vídeo longo demora (download + N pedaços). Local não corta;
// em serverless precisaria de plano pago — ver README (deploy em VPS).
export const maxDuration = 300;

const YT_DLP_TIMEOUT = 120_000; // 2 min por chamada yt-dlp
// Pedaços de 5 min: whisper-1 derivava e PULAVA falas em pedaços de 10 min
// (buracos de 13-14s no vídeo do Miguel). Menor = menos deriva, mesma ordem
// de custo. ~1 MB por pedaço, longe do limite de 25 MB.
const WHISPER_CHUNK_SEC = 300;
const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // limite da API: 25 MB

interface YtDlpJson {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  description?: string;
  webpage_url?: string;
  extractor_key?: string;
  upload_date?: string;
  subtitles?: Record<string, Array<{ ext: string; url?: string }>>;
  automatic_captions?: Record<string, Array<{ ext: string; url?: string }>>;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

// ─── yt-dlp helpers ─────────────────────────────────────────────────────

async function ytDlpJson(url: string): Promise<YtDlpJson> {
  const { stdout } = await run(
    "yt-dlp",
    ["-j", "--no-playlist", "--no-warnings", url],
    { timeout: YT_DLP_TIMEOUT, maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as YtDlpJson;
}

function platformOf(info: YtDlpJson, url: string): string {
  const key = (info.extractor_key ?? "").toLowerCase();
  if (key.includes("youtube")) return "youtube";
  if (key.includes("twitter")) return "twitter";
  if (key.includes("instagram")) return "instagram";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtu.be") || host.includes("youtube")) return "youtube";
    if (host.includes("x.com") || host.includes("twitter")) return "twitter";
    if (host.includes("instagram")) return "instagram";
    return host;
  } catch {
    return key || "web";
  }
}

function metaOf(info: YtDlpJson, url: string) {
  return {
    title: info.title ?? "Vídeo sem título",
    channel: info.channel ?? info.uploader ?? "desconhecido",
    durationSec: Math.round(info.duration ?? 0),
    thumbnail: info.thumbnail,
    platform: platformOf(info, url),
    description: info.description?.slice(0, 1200),
    webpageUrl: info.webpage_url ?? url,
    uploadDate: info.upload_date,
  };
}

/** Escolhe a melhor trilha de legendas: manual > automática; pt > en > qualquer. */
function pickCaptionTrack(info: YtDlpJson): { url: string; ext: string } | null {
  const pref = (langs: string[]) => langs;
  const langRank = (lang: string) => {
    const l = lang.toLowerCase();
    if (l.startsWith("pt")) return 0;
    if (l.startsWith("en")) return 1;
    if (l.startsWith("es")) return 2;
    return 3;
  };

  for (const source of [info.subtitles, info.automatic_captions]) {
    if (!source) continue;
    const langs = Object.keys(source).sort((a, b) => langRank(a) - langRank(b));
    for (const lang of pref(langs)) {
      const formats = source[lang] ?? [];
      // json3 é o mais fácil de parsear; vtt como fallback.
      const pick =
        formats.find((f) => f.ext === "json3" && f.url) ??
        formats.find((f) => f.ext === "vtt" && f.url) ??
        formats.find((f) => f.url);
      if (pick?.url) return { url: pick.url, ext: pick.ext };
    }
  }
  return null;
}

// ─── Parsers de legenda ─────────────────────────────────────────────────

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

function parseJson3(text: string): Segment[] {
  const data = JSON.parse(text) as { events?: Json3Event[] };
  const raw: Segment[] = [];
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || ev.tStartMs == null) continue;
    raw.push({
      start: ev.tStartMs / 1000,
      end: (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000,
      text,
    });
  }
  return dedupeRollingSegments(raw);
}

function parseVtt(text: string): Segment[] {
  const toSec = (ts: string) => {
    const m = ts.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
    if (!m) return 0;
    const [, h, min, s, ms] = m;
    return (Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s)) + Number(ms) / 1000;
  };
  const raw: Segment[] = [];
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx < 0) continue;
    const [startTs, endTs] = lines[timeIdx].split("-->");
    const text = lines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    raw.push({ start: toSec(startTs), end: toSec(endTs ?? startTs), text });
  }
  return dedupeRollingSegments(raw);
}

/**
 * Remove a repetição acumulada das legendas automáticas do YouTube (rolagem ASR / VTT).
 * O YouTube envia o bloco anterior repetido com 1-2 palavras novas no final.
 */
function dedupeRollingSegments(raw: Segment[]): Segment[] {
  const cleaned: Segment[] = [];
  let prevText = "";

  for (const s of raw) {
    let t = s.text.trim();
    if (!t) continue;

    if (prevText) {
      if (t === prevText) continue;
      if (t.startsWith(prevText)) {
        t = t.slice(prevText.length).trim();
      } else {
        // Remove sobreposição de palavras entre o final de prevText e o início de t
        const pWords = prevText.split(/\s+/);
        const tWords = t.split(/\s+/);
        let maxOverlap = 0;
        const limit = Math.min(pWords.length, tWords.length);
        for (let len = limit; len > 0; len--) {
          const tail = pWords.slice(-len).join(" ").toLowerCase();
          const head = tWords.slice(0, len).join(" ").toLowerCase();
          if (tail === head) {
            maxOverlap = len;
            break;
          }
        }
        if (maxOverlap > 0) {
          t = tWords.slice(maxOverlap).join(" ").trim();
        }
      }
    }

    if (!t) continue;
    cleaned.push({ start: s.start, end: s.end, text: t });
    prevText = s.text.trim();
  }

  return mergeSegments(cleaned);
}

/**
 * Funde segmentos picados (auto-captions vêm palavra a palavra) em blocos
 * de ~12s ou terminados em pontuação — melhor pra ler e pra exibir.
 */
function mergeSegments(raw: Segment[]): Segment[] {
  const merged: Segment[] = [];
  let cur: Segment | null = null;
  for (const s of raw) {
    if (!cur) {
      cur = { ...s };
      continue;
    }
    const wouldBeLong = s.end - cur.start > 14;
    const endsSentence = /[.!?…]["'»)]?$/.test(cur.text);
    const duplicated = cur.text.endsWith(s.text);
    if ((wouldBeLong || endsSentence) && !duplicated) {
      merged.push(cur);
      cur = { ...s };
    } else if (!duplicated) {
      cur = { start: cur.start, end: s.end, text: `${cur.text} ${s.text}` };
    } else {
      cur.end = s.end;
    }
  }
  if (cur) merged.push(cur);
  return merged;
}

// ─── Whisper (fallback quando não há legendas) ──────────────────────────

async function downloadAudioChunks(url: string, dir: string): Promise<string[]> {
  // 1) Baixa o melhor áudio.
  const audioPath = path.join(dir, "audio_src");
  await run(
    "yt-dlp",
    [
      "-f", "bestaudio/best",
      "--no-playlist",
      "--no-warnings",
      "--retries", "3",
      "--fragment-retries", "3",
      "-o", `${audioPath}.%(ext)s`,
      url,
    ],
    { timeout: YT_DLP_TIMEOUT * 2, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = await readdir(dir);
  const src = files.find((f) => f.startsWith("audio_src."));
  if (!src) throw new Error("yt-dlp não produziu o arquivo de áudio.");

  // 2) Converte pra mp3 mono 16k 24kbps e fatia em pedaços de 10 min.
  //    600s × 24kbps ≈ 1,8 MB por pedaço — longe do limite de 25 MB.
  const outPattern = path.join(dir, "chunk_%03d.mp3");
  await run(
    "ffmpeg",
    [
      "-y",
      "-i", path.join(dir, src),
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "24k",
      "-f", "segment",
      "-segment_time", String(WHISPER_CHUNK_SEC),
      outPattern,
    ],
    { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
  );

  const chunks = (await readdir(dir))
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort();
  if (chunks.length === 0) throw new Error("ffmpeg não fatiou o áudio.");
  return chunks.map((f) => path.join(dir, f));
}

/**
 * Transcreve um pedaço de áudio.
 *
 * Modelo padrão: gpt-4o-transcribe — o whisper-1 PULA FALAS em áudio longo
 * (bug reportado pelo Miguel em 2026-07-22: "cortou muita coisa", com
 * buracos de 13-14s entre trechos). O modelo novo omite bem menos.
 * Ordem de tentativa por modelo: verbose_json (segmentos) → srt (cues).
 * Se o modelo não existir na conta, cai pro próximo da lista.
 */
const TRANSCRIBE_MODELS = ["gpt-4o-transcribe", "whisper-1"] as const;

const TRANSCRIBE_PROMPT =
  "Transcreva o áudio NA ÍNTEGRA, sem omitir nenhuma fala, riso ou " +
  "interjeição relevante. Não resuma, não pule trechos, não invente.";

interface SrtCue { start: number; end: number; text: string }

/** Parser de SRT (fallback quando verbose_json não tem segmentos). */
function parseSrt(srt: string): SrtCue[] {
  const toSec = (ts: string) => {
    const m = ts.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  };
  const cues: SrtCue[] = [];
  for (const block of srt.split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split("-->");
    const text = lines.slice(timeIdx + 1).join(" ").replace(/\s+/g, " ").trim();
    if (text) cues.push({ start: toSec(a), end: toSec(b ?? a), text });
  }
  return cues;
}

async function transcribeOnce(
  buf: Uint8Array,
  fileName: string,
  apiKey: string,
  model: string,
  format: "verbose_json" | "srt",
): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }),
    fileName,
  );
  form.append("model", model);
  form.append("response_format", format);
  form.append("prompt", TRANSCRIBE_PROMPT);
  if (format === "verbose_json") {
    form.append("timestamp_granularities[]", "segment");
  }
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
}

async function whisperChunk(
  filePath: string,
  apiKey: string,
): Promise<Segment[]> {
  const buf = new Uint8Array(await readFile(filePath));
  if (buf.byteLength > WHISPER_MAX_BYTES) {
    throw new Error(`Pedaço de áudio excede ${WHISPER_MAX_BYTES} bytes.`);
  }
  const fileName = path.basename(filePath);
  const errors: string[] = [];

  for (const model of TRANSCRIBE_MODELS) {
    // 1) verbose_json com segmentos (o caminho ideal).
    try {
      const res = await transcribeOnce(buf, fileName, apiKey, model, "verbose_json");
      if (res.ok) {
        const data = (await res.json()) as {
          segments?: Array<{ start: number; end: number; text: string }>;
          text?: string;
        };
        if (data.segments?.length) {
          return data.segments.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text.trim(),
          }));
        }
        if (data.text?.trim()) {
          return [{ start: 0, end: 0, text: data.text.trim() }];
        }
      } else {
        errors.push(`${model}/verbose_json: ${res.status}`);
      }
    } catch (err) {
      errors.push(`${model}/verbose_json: ${String(err).slice(0, 80)}`);
    }

    // 2) SRT (cues com timestamps) — funciona até quando verbose_json falha.
    try {
      const res = await transcribeOnce(buf, fileName, apiKey, model, "srt");
      if (res.ok) {
        const cues = parseSrt(await res.text());
        if (cues.length) return cues;
      } else {
        errors.push(`${model}/srt: ${res.status}`);
      }
    } catch (err) {
      errors.push(`${model}/srt: ${String(err).slice(0, 80)}`);
    }
  }

  throw new Error(`Transcrição falhou em todos os modelos: ${errors.join(" | ")}`);
}

// ─── Caminho serverless (Vercel): sem yt-dlp/ffmpeg ─────────────────────
//
// Na Vercel não existem os binários yt-dlp/ffmpeg. Para o site no ar
// continuar útil, há um caminho 100% HTTP para o YouTube:
//   meta       → oEmbed (título, canal, thumbnail)
//   transcrição→ página do vídeo → captionTracks → timedtext (json3)
// Whisper (download de áudio) NÃO roda em serverless — nesse caso o app
// explica e sugere rodar local. X/Instagram também exigem yt-dlp.

let ytdlpAvailable: boolean | null = null;

async function hasYtDlp(): Promise<boolean> {
  if (process.env.MOKA_DISABLE_YTDLP === "1") return false; // p/ teste local
  if (ytdlpAvailable !== null) return ytdlpAvailable;
  try {
    await run("yt-dlp", ["--version"], { timeout: 5000 });
    ytdlpAvailable = true;
  } catch {
    ytdlpAvailable = false;
  }
  return ytdlpAvailable;
}

/** Extrai o video ID de URLs do YouTube (watch, youtu.be, shorts, embed). */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {
    /* não é URL */
  }
  return null;
}

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Metadados via oEmbed (sem chave, serverless-friendly) — RESISTENTE:
 * se o oEmbed falhar (429, HTML de erro, rede), tenta o <title>/og:title
 * da página do vídeo; se tudo falhar, devolve metadados genéricos em
 * vez de estourar exceção (que virava página HTML de erro → o cliente
 * quebrava com "Unexpected token '<'").
 */
async function youtubeMetaHttp(url: string, videoId: string) {
  let title = "Vídeo do YouTube";
  let channel = "YouTube";
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}&format=json`,
    );
    if (res.ok) {
      const oembed = (await res.json()) as OEmbed;
      if (oembed.title) title = oembed.title;
      if (oembed.author_name) channel = oembed.author_name;
      if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
    }
  } catch {
    // oEmbed indisponível — tenta a página do vídeo
  }

  if (title === "Vídeo do YouTube") {
    try {
      const watch = await fetch(
        `https://www.youtube.com/watch?v=${videoId}&hl=pt`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
        },
      );
      if (watch.ok) {
        const html = await watch.text();
        const og = html.match(/<meta property="og:title" content="([^"]+)"/);
        const tt = html.match(/<title>([^<]+)<\/title>/);
        const raw = og?.[1] ?? tt?.[1]?.replace(/ - YouTube$/, "");
        if (raw) title = raw;
        const ch = html.match(/<meta itemprop="author" content="([^"]+)"/)
          ?? html.match(/"ownerChannelName":"([^"]+)"/);
        if (ch?.[1]) channel = ch[1];
      }
    } catch {
      // segue com genéricos
    }
  }

  return {
    title,
    channel,
    durationSec: 0, // oEmbed não informa duração
    thumbnail,
    platform: "youtube",
    webpageUrl: url,
  };
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string; // "asr" = automática
}

/** Legendas via página do vídeo (captionTracks → timedtext json3). */
async function youtubeCaptionsHttp(videoId: string): Promise<Segment[] | null> {
  const watch = await fetch(
    `https://www.youtube.com/watch?v=${videoId}&hl=pt`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    },
  );
  if (!watch.ok) return null;
  const html = await watch.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) return null;
  let tracks: CaptionTrack[];
  try {
    tracks = JSON.parse(m[1]) as CaptionTrack[];
  } catch {
    return null;
  }
  if (tracks.length === 0) return null;

  const rank = (t: CaptionTrack) => {
    const l = (t.languageCode ?? "").toLowerCase();
    let r = l.startsWith("pt") ? 0 : l.startsWith("en") ? 1 : l.startsWith("es") ? 2 : 3;
    if (t.kind === "asr") r += 10; // prefere manual
    return r;
  };
  const track = [...tracks].sort((a, b) => rank(a) - rank(b))[0];
  if (!track.baseUrl) return null;

  const res = await fetch(`${track.baseUrl}&fmt=json3`);
  if (!res.ok) return null;
  const segments = parseJson3(await res.text());
  return segments.length > 0 ? segments : null;
}

const SERVERLESS_NOTE =
  "No site no ar (Vercel) só é possível ler vídeos do YouTube que tenham " +
  "legendas. Para vídeos sem legenda (Whisper), X/Twitter e Instagram, " +
  "rode o Moka Video local (npm start) ou no servidor com yt-dlp.";

// ─── Handler ────────────────────────────────────────────────────────────

interface IngestBody {
  url?: string;
  step?: "meta" | "transcript";
}

/**
 * CORS aberto: o site no ar (Vercel) pode apontar pra um servidor de
 * ingestão externo (VPS/local com yt-dlp). A rota não guarda nada —
 * só processa e devolve; a chave Whisper viaja no header e morre na
 * requisição.
 *
 * `Access-Control-Allow-Private-Network`: o Chrome exige esse header no
 * preflight quando uma página pública (https) chama uma rede privada
 * (http://localhost) — é o que permite o site no ar ler vídeos através
 * do computador do usuário (o IP da casa dele, que o YouTube não bloqueia).
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-openai-key",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/ingest — sonda de saúde. O site no ar usa pra detectar se há
 * um Moka Video local rodando (localhost:3100) e ler por ele.
 */
export async function GET() {
  return respond({
    ok: true,
    server: "moka-video",
    full: await hasYtDlp(), // true = lê tudo (yt-dlp + Whisper)
    version: "0.4.0",
  });
}

function respond(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let payload: IngestBody;
  try {
    payload = (await req.json()) as IngestBody;
  } catch {
    return respond({ error: "JSON inválido." }, { status: 400 });
  }

  const url = payload.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return respond(
      { error: "Cole um link válido (começando com http:// ou https://)." },
      { status: 400 },
    );
  }
  const step = payload.step ?? "meta";

  // ── Caminho serverless (Vercel, sem yt-dlp): só YouTube, só legendas ──
  // Tudo embrulhado em try/catch: erro vira JSON amigável, NUNCA página
  // HTML de erro (que quebrava o cliente com "Unexpected token '<'").
  if (!(await hasYtDlp())) {
    try {
      const videoId = youtubeId(url);
      if (!videoId) {
        return respond({ error: SERVERLESS_NOTE }, { status: 501 });
      }
      const meta = await youtubeMetaHttp(url, videoId);
      if (step === "meta") {
        // Confirma se há legendas já na etapa meta (barato e evita surpresa).
        const caps = await youtubeCaptionsHttp(videoId).catch(() => null);
        return respond({ meta, hasCaptions: caps != null });
      }
      const segments = await youtubeCaptionsHttp(videoId).catch(() => null);
      if (!segments) {
        return respond(
          { error: SERVERLESS_NOTE, needsWhisperKey: false, meta },
          { status: 428 },
        );
      }
      return respond({ meta, transcriptSource: "captions", segments });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return respond(
        {
          error:
            "O YouTube não deixou o servidor ler este vídeo agora. " +
            "Tente de novo em alguns minutos — ou rode o Moka Video no " +
            "computador (localhost), onde a leitura é completa. " +
            `(${message.slice(0, 120)})`,
        },
        { status: 502 },
      );
    }
  }

  // ── Caminho completo (local/VPS): yt-dlp + ffmpeg ─────────────────────
  const dir = await mkdtemp(path.join(tmpdir(), "moka-video-"));
  try {
    // Etapa 1 — metadados.
    const info = await ytDlpJson(url);
    const meta = metaOf(info, url);
    const captionTrack = pickCaptionTrack(info);

    if (step === "meta") {
      return respond({
        meta,
        hasCaptions: captionTrack != null,
      });
    }

    // Etapa 2 — transcrição.
    // 2a) Legendas oficiais/automáticas (grátis, instantâneo).
    if (captionTrack) {
      const res = await fetch(captionTrack.url);
      if (res.ok) {
        const raw = await res.text();
        const segments =
          captionTrack.ext === "json3" ? parseJson3(raw) : parseVtt(raw);
        if (segments.length > 0) {
          return respond({
            meta,
            transcriptSource: "captions",
            segments,
          });
        }
      }
    }

    // 2b) Whisper (chave OpenAI do usuário no header — ou, num servidor
    // próprio, a OPENAI_API_KEY do ambiente como fallback: assim a versão
    // local do Miguel lê qualquer vídeo sem precisar configurar nada).
    const openaiKey =
      req.headers.get("x-openai-key")?.trim() ||
      process.env.OPENAI_API_KEY?.trim();
    if (!openaiKey) {
      return respond(
        {
          error:
            "Este vídeo não tem legendas disponíveis. Para o Moka transcrever " +
            "o áudio com Whisper, configure uma chave OpenAI nas ⚙️ Configurações.",
          needsWhisperKey: true,
          meta,
        },
        { status: 428 },
      );
    }

    const chunkPaths = await downloadAudioChunks(url, dir);
    const segments: Segment[] = [];
    for (let i = 0; i < chunkPaths.length; i++) {
      const part = await whisperChunk(chunkPaths[i], openaiKey);
      const offset = i * WHISPER_CHUNK_SEC;
      segments.push(
        ...part.map((s) => ({
          start: s.start + offset,
          end: s.end > 0 ? s.end + offset : 0,
          text: s.text,
        })),
      );
    }

    if (segments.length === 0) {
      return respond(
        { error: "A transcrição veio vazia — o vídeo tem áudio falado?", meta },
        { status: 422 },
      );
    }

    return respond({
      meta,
      transcriptSource: "whisper",
      segments: mergeSegments(segments),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Erros comuns do yt-dlp com mensagem amigável.
    const friendly =
      /Unsupported URL/i.test(message)
        ? "Esse link não é suportado (ainda). YouTube, X/Twitter e Instagram funcionam melhor."
        : /Private video|login required|Sign in/i.test(message)
          ? "Este vídeo é privado ou exige login — o Moka só lê conteúdo público."
          : /Video unavailable|404/i.test(message)
            ? "Vídeo indisponível — confira se o link está certo e público."
            : message.slice(0, 400);
    return respond({ error: friendly }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
