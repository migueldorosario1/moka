/**
 * Banco local (IndexedDB) — a "videoteca" do Moka Video.
 *
 * Local-first, como o Moka Reader: cada vídeo processado vira um registro
 * com metadados, transcrição (segmentos com timestamps) e as análises já
 * geradas (explicação, resumos, personagens, contexto, crítica). Nada sai
 * do dispositivo.
 */

export interface TranscriptSegment {
  /** Início em segundos. */
  start: number;
  /** Fim em segundos (0 se desconhecido). */
  end: number;
  text: string;
}

export interface VideoMeta {
  title: string;
  channel: string;
  durationSec: number;
  thumbnail?: string;
  platform: string; // "youtube" | "twitter" | "instagram" | ...
  description?: string;
  webpageUrl: string;
  uploadDate?: string;
}

/** Tipos de análise que a IA produz sobre a transcrição. */
export type AnalysisKind =
  | "quick"       // ⚡ explicação rápida
  | "characters"  // 👥 personagens
  | "politics"    // 🏛️ contexto político
  | "critique"    // 🖊️ crítica
  | `summary-${number}`; // 📖 resumo de N minutos

/** Uma pergunta & resposta do usuário sobre o vídeo (❓ Perguntar). */
export interface AskRecord {
  q: string;
  a: string;
  at: number;
}

export interface VideoRecord {
  id: string;
  url: string;
  meta: VideoMeta;
  /** De onde veio o texto: legendas oficiais/auto ou Whisper. */
  transcriptSource: "captions" | "whisper";
  segments: TranscriptSegment[];
  /** Análises já geradas, cacheadas pra não gastar token de novo. */
  analyses: Partial<Record<AnalysisKind, string>>;
  /** Perguntas já feitas sobre o vídeo (material salvo automaticamente). */
  asks?: AskRecord[];
  createdAt: number;
  savedAt: number;
}

const DB_NAME = "moka-video";
const STORE = "videos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lista todos os vídeos (mais recentes primeiro). */
export async function listVideos(): Promise<VideoRecord[]> {
  const db = await openDb();
  const all = await tx(db, "readonly", (s) => s.getAll() as IDBRequest<VideoRecord[]>);
  db.close();
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

/** Busca um vídeo pelo id. */
export async function getVideo(id: string): Promise<VideoRecord | null> {
  const db = await openDb();
  const rec = await tx(db, "readonly", (s) => s.get(id) as IDBRequest<VideoRecord | undefined>);
  db.close();
  return rec ?? null;
}

/** Procura um vídeo já processado pela URL (dedupe). */
export async function findVideoByUrl(url: string): Promise<VideoRecord | null> {
  const all = await listVideos();
  const norm = normalizeUrl(url);
  return all.find((v) => normalizeUrl(v.url) === norm) ?? null;
}

/** Salva (upsert) um vídeo. */
export async function saveVideo(rec: VideoRecord): Promise<void> {
  rec.savedAt = Date.now();
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.put(rec));
  db.close();
}

/** Remove um vídeo. */
export async function deleteVideo(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.delete(id));
  db.close();
}

/** Limpa a videoteca INTEIRA (com confirmação na UI). */
export async function clearAllVideos(): Promise<void> {
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.clear());
  db.close();
}

/** Normaliza URL pra dedupe (tira tracking, www, trailing slash). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hostname = u.hostname.replace(/^www\./, "");
    // YouTube: manter só o v=.
    const v = u.searchParams.get("v");
    if (v && (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be"))) {
      return `youtube:${v}`;
    }
    if (u.hostname === "youtu.be") {
      return `youtube:${u.pathname.slice(1)}`;
    }
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

/** Texto corrido da transcrição (sem timestamps), pra mandar pra IA. */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");
}

/** Formata segundos → "12:34" ou "1:02:34". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
