/**
 * byok-services.ts — transcrição de vídeo com a chave do PRÓPRIO usuário
 * (ordem do Miguel, 27/08/2026: "bota todos esses" nos ⚙️ com explicação).
 *
 * Por quê: o caminho grátis (legendas via innertube) sofre o bot-check do
 * YouTube no IP do servidor. Quando o usuário configura um serviço próprio,
 * QUEM BAIXA O VÍDEO É O SERVIÇO ESCOLHIDO, no IP DELES — o bloqueio sai
 * da nossa jogada e o custo cai na conta do usuário (nada de pontos).
 *
 * Quatro serviços, dois formatos:
 *   Síncronos  (uma chamada devolve o texto):  Supadata, TranscriptAPI
 *   Assíncronos (job → polling do cliente):    Transkriptor, AssemblyAI
 *
 * Segredos: a chave do usuário viaja no header `x-tx-key` do /api/ingest,
 * é usada só na transcrição e NUNCA persistida (mesmo padrão do
 * `x-openai-key` do Whisper).
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";
import {
  tkSubmit,
  tkJobStatus,
  tkSegments,
  tkDuration,
  tkQualityOk,
  type TkSegment,
} from "./transkriptor";

export type TxByokService =
  | "supadata"
  | "transkriptor"
  | "transcriptapi"
  | "assemblyai";

/** Erro com status HTTP amigável — a rota devolve a mensagem pro usuário. */
export class ByokError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Traduz status HTTP do serviço em recado humano (sem tecniquês). */
function txError(service: string, status: number): ByokError {
  if (status === 401 || status === 403) {
    return new ByokError(
      `A chave do ${service} não funcionou — confira se copiou a chave certa ` +
        "(e se a conta está ativa) nas ⚙️ Configurações.",
      401,
    );
  }
  if (status === 402) {
    return new ByokError(
      `Sua conta do ${service} está sem créditos — recarregue lá no site deles. ` +
        "(Nada foi cobrado no Moka.)",
      402,
    );
  }
  if (status === 429) {
    return new ByokError(
      `O ${service} está com limite de uso agora — espere um pouco e tente de novo.`,
      429,
    );
  }
  return new ByokError(
    `O ${service} não conseguiu processar este vídeo agora (erro ${status}). ` +
      "Tente de novo em alguns minutos.",
    status >= 400 && status < 600 ? status : 502,
  );
}

// ─── Supadata (síncrono; Whisper próprio quando o vídeo não tem legenda) ──

interface SupadataContent {
  text?: string;
  offset?: number; // ms
  duration?: number; // ms
}

async function supadataTranscribe(key: string, url: string): Promise<TkSegment[]> {
  // Timeout generoso: vídeo SEM legenda cai no Whisper deles e demora mais.
  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}`,
    { headers: { "x-api-key": key }, signal: AbortSignal.timeout(150_000) },
  );
  if (!res.ok) throw txError("Supadata", res.status);
  const data = (await res.json()) as { content?: SupadataContent[] };
  const segs: TkSegment[] = [];
  for (const s of data.content ?? []) {
    const text = s.text?.trim();
    if (!text) continue;
    segs.push({
      start: (s.offset ?? 0) / 1000,
      end: ((s.offset ?? 0) + (s.duration ?? 0)) / 1000,
      text,
    });
  }
  if (segs.length === 0) {
    throw new ByokError(
      "O Supadata não devolveu transcrição pra este vídeo — tente de novo ou troque o serviço nas ⚙️.",
      422,
    );
  }
  return segs;
}

// ─── TranscriptAPI (síncrono; só puxa legendas EXISTENTES do vídeo) ──────

interface TxApiRow {
  text?: string;
  start?: number | string;
  offset?: number | string;
  duration?: number | string;
  dur?: number | string;
  end?: number | string;
}

/** O formato exato da resposta varia — aceitamos os campos comuns. */
function txApiRows(data: unknown): TxApiRow[] {
  const d = data as Record<string, unknown> | null;
  const candidates = [
    d?.transcript,
    d?.content,
    d?.segments,
    (d?.data as Record<string, unknown> | undefined)?.transcript,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as TxApiRow[];
  }
  return [];
}

async function transcriptapiTranscribe(key: string, url: string): Promise<TkSegment[]> {
  const res = await fetch(
    `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${encodeURIComponent(url)}`,
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) },
  );
  if (!res.ok) throw txError("TranscriptAPI", res.status);
  const rows = txApiRows(await res.json());
  const segs: TkSegment[] = [];
  for (const r of rows) {
    const text = (r.text ?? "").trim();
    if (!text) continue;
    const start = Number(r.start ?? r.offset ?? 0) || 0;
    const dur = Number(r.duration ?? r.dur ?? 0) || 0;
    const end = Number(r.end ?? 0) || start + dur;
    segs.push({ start, end: end > start ? end : start, text });
  }
  if (segs.length === 0) {
    throw new ByokError(
      "Este vídeo não tem legenda — o TranscriptAPI só lê vídeos com legenda. " +
        "Use o Supadata (transcreve áudio) nas ⚙️.",
      422,
    );
  }
  return segs;
}

// ─── Transkriptor (assíncrono; protocolo tor.app já usado pela casa) ─────

async function transkriptorByokStatus(
  key: string,
  orderId: string,
): Promise<ByokPoll> {
  const st = await tkJobStatus(orderId, key);
  if (st === "processing" || st === "unknown") return { pending: true };
  if (st === "failed") return { failed: true };
  const segs = await tkSegments(orderId, key);
  const dur = tkDuration(segs);
  if (segs.length === 0 || !tkQualityOk(segs, dur)) return { failed: true };
  return { segments: segs };
}

// ─── AssemblyAI (assíncrono; o áudio é baixado pelo NOSSO innertube+proxy
//     e enviado pra conta do usuário — US$ 0,37/h, diarização incluída) ──

const AA_BASE = "https://api.assemblyai.com/v2";
// Áudio m4a de bitrate baixo: ~30-45 MB por hora de vídeo.
const AA_MAX_BYTES = 120 * 1024 * 1024;

const aaProxyAgent = process.env.PROXY_RESIDENCIAL_URL?.trim()
  ? new ProxyAgent(process.env.PROXY_RESIDENCIAL_URL.trim())
  : null;

async function aaTubeFetch(url: string, init: Parameters<typeof undiciFetch>[1]) {
  return undiciFetch(url, {
    ...init,
    ...(aaProxyAgent ? { dispatcher: aaProxyAgent } : {}),
  }) as unknown as Response;
}

interface AaPlayerFormat {
  mimeType?: string;
  url?: string;
  bitrate?: number;
  signatureCipher?: string;
  cipher?: string;
}

/** URL do áudio (adaptiveFormats do innertube ANDROID — o mesmo que entrega
 *  as legendas quando a página vem com bot-check). */
async function youtubeAudioUrl(videoId: string): Promise<string | null> {
  try {
    const res = await aaTubeFetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
              androidSdkVersion: 30,
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      playabilityStatus?: { status?: string };
      streamingData?: { adaptiveFormats?: AaPlayerFormat[] };
    };
    if (data.playabilityStatus?.status !== "OK") return null;
    const audio = (data.streamingData?.adaptiveFormats ?? [])
      .filter(
        (f) =>
          (f.mimeType ?? "").startsWith("audio/") &&
          f.url &&
          !f.signatureCipher &&
          !f.cipher,
      )
      // Menor bitrate = menos bytes subidos = mais rápido e mais barato.
      .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0))[0];
    return audio?.url ?? null;
  } catch {
    return null;
  }
}

/** Submete: pega o áudio → upload → cria o transcript. Devolve o id pro polling. */
async function assemblyaiSubmit(key: string, url: string, videoId: string): Promise<string> {
  const audioUrl = await youtubeAudioUrl(videoId);
  if (!audioUrl) {
    throw new ByokError(
      "Não consegui localizar o áudio deste vídeo agora. O Supadata resolve direto " +
        "(ele baixa o vídeo no servidor dele) — vale trocar nas ⚙️.",
      502,
    );
  }
  const audioRes = await aaTubeFetch(audioUrl, { signal: AbortSignal.timeout(120_000) });
  if (!audioRes.ok) {
    throw new ByokError(
      "Não consegui baixar o áudio deste vídeo agora (o YouTube andou bloqueando). " +
        "O Supadata não sofre disso — ele baixa com o IP dele.",
      502,
    );
  }
  const buf = new Uint8Array(await audioRes.arrayBuffer());
  if (buf.byteLength > AA_MAX_BYTES) {
    throw new ByokError(
      "Vídeo longo demais pro caminho do AssemblyAI no Moka — prefira o Supadata pra este.",
      413,
    );
  }

  const upRes = await fetch(`${AA_BASE}/upload`, {
    method: "POST",
    headers: { authorization: key },
    body: buf,
    signal: AbortSignal.timeout(180_000),
  });
  if (!upRes.ok) throw txError("AssemblyAI", upRes.status);
  const { upload_url: uploadUrl } = (await upRes.json()) as { upload_url?: string };
  if (!uploadUrl) throw txError("AssemblyAI", 502);

  const trRes = await fetch(`${AA_BASE}/transcript`, {
    method: "POST",
    headers: { authorization: key, "Content-Type": "application/json" },
    // speaker_labels = diarização (quem falou o quê) — grátis no preço/hora.
    body: JSON.stringify({
      audio_url: uploadUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!trRes.ok) throw txError("AssemblyAI", trRes.status);
  const tr = (await trRes.json()) as { id?: string };
  if (!tr.id) throw txError("AssemblyAI", 502);
  return tr.id;
}

interface AaWord {
  text?: string;
  start?: number | string;
  end?: number | string;
}

interface AaUtterance extends AaWord {
  speaker?: string;
}

/** Agrupa palavras em blocos legíveis (~12s), como o mergeSegments das legendas. */
function aaWordsToSegments(words: AaWord[]): TkSegment[] {
  const segs: TkSegment[] = [];
  let cur: TkSegment | null = null;
  for (const w of words) {
    const text = w.text?.trim();
    const start = Number(w.start ?? 0) || 0;
    const end = Number(w.end ?? start) || start;
    if (!text) continue;
    if (!cur) {
      cur = { start, end, text };
      continue;
    }
    if (end - cur.start > 12) {
      segs.push(cur);
      cur = { start, end, text };
    } else {
      cur = { start: cur.start, end, text: `${cur.text} ${text}` };
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

async function assemblyaiStatus(key: string, id: string): Promise<ByokPoll> {
  const res = await fetch(`${AA_BASE}/transcript/${id}`, {
    headers: { authorization: key },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw txError("AssemblyAI", res.status);
  const d = (await res.json()) as {
    status?: string;
    text?: string;
    words?: AaWord[];
    utterances?: AaUtterance[] | null;
  };
  if (d.status === "error") return { failed: true };
  if (d.status !== "completed") return { pending: true };

  // Melhor formato primeiro: utterances (com falante) > words > texto cru.
  if (d.utterances?.length) {
    const segs: TkSegment[] = [];
    for (const u of d.utterances) {
      const text = u.text?.trim();
      if (!text) continue;
      const start = Number(u.start ?? 0) || 0;
      const end = Number(u.end ?? start) || start;
      segs.push({
        start,
        end,
        text,
        ...(u.speaker ? { speaker: `Falante ${u.speaker}` } : {}),
      });
    }
    if (segs.length) return { segments: segs };
  }
  if (d.words?.length) {
    const segs = aaWordsToSegments(d.words);
    if (segs.length) return { segments: segs };
  }
  if (d.text?.trim()) {
    return { segments: [{ start: 0, end: 0, text: d.text.trim() }] };
  }
  return { failed: true };
}

// ─── Façada usada pela rota /api/ingest ──────────────────────────────────

export type ByokPoll =
  | { pending: true }
  | { failed: true }
  | { segments: TkSegment[] };

export type ByokSubmitResult =
  | { segments: TkSegment[] } // síncrono: já veio o texto
  | { orderId: string }; // assíncrono: cliente faz polling

export async function byokSubmit(
  service: TxByokService,
  key: string,
  url: string,
  videoId: string,
): Promise<ByokSubmitResult> {
  switch (service) {
    case "supadata":
      return { segments: await supadataTranscribe(key, url) };
    case "transcriptapi":
      return { segments: await transcriptapiTranscribe(key, url) };
    case "transkriptor": {
      const orderId = await tkSubmit(url, key);
      if (!orderId) {
        throw new ByokError(
          "O Transkriptor não aceitou o vídeo agora — confira sua assinatura/chave " +
            "(e se a conta tem crédito) nas ⚙️.",
          502,
        );
      }
      return { orderId };
    }
    case "assemblyai":
      return { orderId: await assemblyaiSubmit(key, url, videoId) };
  }
}

export async function byokStatus(
  service: TxByokService,
  key: string,
  ref: string,
): Promise<ByokPoll> {
  switch (service) {
    case "supadata":
    case "transcriptapi":
      // Serviços síncronos não têm polling — o ref guardado não vale nada.
      return { failed: true };
    case "transkriptor":
      return transkriptorByokStatus(key, ref);
    case "assemblyai":
      return assemblyaiStatus(key, ref);
  }
}
