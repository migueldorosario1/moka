/**
 * transkriptor.ts — motor de transcrição da casa (Moka Video, Fase 1).
 *
 * Roda SÓ no servidor (API routes). Fluxo:
 *   1. submit()        — entrega a URL do vídeo pro Transkriptor baixar e
 *                        transcrever nos servidores DELES (o bloqueio de IP
 *                        do YouTube é problema deles, não nosso).
 *   2. getJob()        — status rápido via /files/{order_id} (~2s).
 *   3. getSegments()   — segmentos com timestamps + falantes (diarização).
 *
 * A memória server-side (cache cross-usuário + fila) fica na API de pontos
 * (Tencent, SQLite) via /transcricao/job — ver motorGetJob/motorUpsertJob.
 * Vídeo já transcrito NUNCA é re-submetido: custo zero pra nós.
 *
 * Segredos: TRANSKRIPTOR_API_KEY e MOKA_MOTOR_KEY vivem só no servidor
 * (Vercel env) — nunca vão pro cliente.
 */

const TK_BASE = "https://api.tor.app/developer";
// O gateway de pontos é alcançado pelo MESMO domínio do site (rewrite da
// Vercel → Tencent): TLS válido garantido e o cliente nunca vê o backend.
const PONTOS_BASE =
  process.env.PONTOS_BASE_URL ?? "https://www.mokareader.com/api/pontos";

/** Segmento no formato do Moka (start/end em SEGUNDOS; speaker opcional). */
export interface TkSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TkJob {
  video_id: string;
  order_id: string;
  url: string;
  titulo: string;
  status: "processing" | "completed" | "failed";
  segments_json: string;
  duracao_s: number;
  chars: number;
}

export function transkriptorEnabled(): boolean {
  // FASE GRATUITA (pivô do Miguel, 2026-08-04): a transcrição da casa
  // (Transkriptor com a NOSSA chave — custo nosso por minuto) fica DESLIGADA
  // por padrão. Religa na Fase 2 com MOKA_CASA_TRANSCRICAO=1 no env da Vercel
  // — todo o caminho (cache, fila, débito) fica intacto esperando.
  if (process.env.MOKA_CASA_TRANSCRICAO !== "1") return false;
  return Boolean(process.env.TRANSKRIPTOR_API_KEY?.trim()) && motorEnabled();
}

export function motorEnabled(): boolean {
  return Boolean(process.env.MOKA_MOTOR_KEY?.trim());
}

function tkHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.TRANSKRIPTOR_API_KEY?.trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Submete a URL pra transcrição. Retorna o order_id (ou "" se falhou). */
export async function tkSubmit(url: string): Promise<string> {
  const res = await fetch(`${TK_BASE}/transcription/url`, {
    method: "POST",
    headers: tkHeaders(),
    // Sem "language": o serviço detecta o idioma sozinho (objetivo do Moka:
    // qualquer língua do mundo). service Standard = melhor custo.
    body: JSON.stringify({ url, service: "Standard" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return "";
  const body = (await res.json()) as { order_id?: string; body?: { order_id?: string } };
  return body.order_id ?? body.body?.order_id ?? "";
}

interface TkFileItem {
  order_id?: string;
  status?: string;
  file_name?: string;
}

/** Status rápido de UM job (endpoint unitário, ~2s — a lista completa é lenta). */
export async function tkJobStatus(
  orderId: string,
): Promise<"processing" | "completed" | "failed" | "unknown"> {
  try {
    const res = await fetch(`${TK_BASE}/files/${orderId}`, {
      headers: tkHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return "unknown";
    const item = (await res.json()) as TkFileItem;
    const s = (item.status ?? "").toLowerCase();
    if (s === "completed") return "completed";
    if (s === "failed" || s === "error") return "failed";
    return "processing";
  } catch {
    return "unknown"; // timeout/instabilidade deles — o polling tenta de novo
  }
}

interface TkContentSeg {
  text?: string;
  StartTime?: number; // milissegundos
  EndTime?: number;
  Speaker?: string;
}

/** Busca os segmentos prontos, mapeados pro formato do Moka. */
export async function tkSegments(orderId: string): Promise<TkSegment[]> {
  const res = await fetch(`${TK_BASE}/files/${orderId}/content`, {
    headers: tkHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    content?: TkContentSeg[];
    body?: { content?: TkContentSeg[] };
  };
  const raw = data.content ?? data.body?.content ?? [];
  const segs: TkSegment[] = [];
  for (const s of raw) {
    const text = (s.text ?? "").trim();
    if (!text) continue;
    segs.push({
      start: (s.StartTime ?? 0) / 1000,
      end: (s.EndTime ?? 0) / 1000,
      text,
      ...(s.Speaker ? { speaker: s.Speaker } : {}),
    });
  }
  return segs;
}

/** Duração estimada do vídeo = maior `end` dos segmentos (segundos). */
export function tkDuration(segs: TkSegment[]): number {
  return segs.reduce((max, s) => Math.max(max, s.end), 0);
}

/**
 * Gate anti-alucinação (regra dos agentes Cafezinho): texto bom fica entre
 * 600–900 chars/min; abaixo de 100 chars/min é ruído/VAD alucinando.
 */
export function tkQualityOk(segs: TkSegment[], durationSec: number): boolean {
  if (durationSec <= 0) return segs.length > 0;
  const chars = segs.reduce((n, s) => n + s.text.length, 0);
  return chars / (durationSec / 60) >= 100;
}

// ─── Memória server-side (API de pontos na Tencent) ─────────────────────

function motorHeaders(): Record<string, string> {
  return { "x-moka-motor-key": process.env.MOKA_MOTOR_KEY?.trim() ?? "" };
}

export async function motorGetJob(query: {
  videoId?: string;
  orderId?: string;
}): Promise<TkJob | null> {
  const q = query.videoId
    ? `video_id=${encodeURIComponent(query.videoId)}`
    : `order_id=${encodeURIComponent(query.orderId ?? "")}`;
  try {
    const res = await fetch(`${PONTOS_BASE}/transcricao/job?${q}`, {
      headers: motorHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { found?: boolean; job?: TkJob };
    return data.found && data.job ? data.job : null;
  } catch {
    return null;
  }
}

export async function motorUpsertJob(job: {
  videoId: string;
  orderId?: string;
  url?: string;
  titulo?: string;
  status: "processing" | "completed" | "failed";
  segments?: TkSegment[];
  duracaoS?: number;
}): Promise<void> {
  try {
    await fetch(`${PONTOS_BASE}/transcricao/job`, {
      method: "POST",
      headers: { ...motorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        video_id: job.videoId,
        order_id: job.orderId ?? "",
        url: job.url ?? "",
        titulo: job.titulo ?? "",
        status: job.status,
        segments_json: job.segments ? JSON.stringify(job.segments) : "",
        duracao_s: job.duracaoS ?? 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // cache falhar NÃO pode derrubar a leitura — só perdemos a memória
  }
}

// ─── Pontos: saldo e débito (gateway da casa) ───────────────────────────

export interface ContaPontos {
  email: string;
  senha: string;
}

export async function motorSaldo(conta: ContaPontos): Promise<number | null> {
  try {
    const res = await fetch(
      `${PONTOS_BASE}/painel/saldo?email=${encodeURIComponent(conta.email)}&senha=${encodeURIComponent(conta.senha)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { saldo_pontos?: number };
    return typeof data.saldo_pontos === "number" ? data.saldo_pontos : null;
  } catch {
    return null;
  }
}

/** Faixas de preço por duração (tabela precos_acoes — cadastrada 2026-08-01). */
export const TIER_LIMITS = [
  { maxSec: 15 * 60, acao: "transcricao_video_15min", pontos: 20, rotulo: "até 15 min" },
  { maxSec: 60 * 60, acao: "transcricao_video_1h", pontos: 45, rotulo: "até 1 hora" },
  { maxSec: 3 * 3600, acao: "transcricao_video_3h", pontos: 110, rotulo: "até 3 horas" },
] as const;

export function tierFor(durationSec: number) {
  return TIER_LIMITS.find((t) => durationSec <= t.maxSec) ?? null;
}

export const TIER_MIN_PONTOS = TIER_LIMITS[0].pontos;
export const VIDEO_MAX_SEC = TIER_LIMITS[TIER_LIMITS.length - 1].maxSec;

export interface DebitResult {
  ok: boolean;
  debitado?: number;
  saldo?: number;
  insufficient?: boolean;
}

/** Debita a faixa da conta do usuário via /consumir do gateway. */
export async function motorDebit(
  conta: ContaPontos,
  acao: string,
  recursoRef: string,
  custoUsd: number,
): Promise<DebitResult> {
  try {
    const res = await fetch(`${PONTOS_BASE}/consumir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: conta.email,
        senha: conta.senha,
        acao,
        recurso_ref: recursoRef,
        custo_usd: custoUsd,
        llm_usada: "transkriptor",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 402) return { ok: false, insufficient: true };
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { debitado?: number; saldo_pontos?: number };
    return { ok: true, debitado: data.debitado, saldo: data.saldo_pontos };
  } catch {
    return { ok: false };
  }
}
