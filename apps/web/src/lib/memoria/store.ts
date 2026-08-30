/**
 * MOKA MEMÓRIA — persistência local-first (IndexedDB) + busca instantânea.
 *
 * Segue o padrão do lib/db.ts da casa: API nativa do navegador, SEM
 * dependências externas, timeout de segurança no open (5s), versão nova
 * (3) que só ADICIONA stores — nunca quebra o que já existe
 * (sessions/books continuam intactos).
 *
 * Multi-memórias (DSC-019): perfis nomeados; a ativa fica no localStorage.
 * A v1 é LOCAL-FIRST (parecer DSC-014 camada 1): nada sai do aparelho.
 */

import type { MemoriaHit, MemoriaMeta, MemoriaObject } from "./types";
import { normalizeText } from "./markdown";

const DB_NAME = "igot";
const DB_VERSION = 3;
const OBJ_STORE = "memoria";
const META_STORE = "memoria_metas";
const ACTIVE_KEY = "moka.memoria.ativa";
const DEFAULT_MEMORIA_ID = "principal";
const DEFAULT_MEMORIA_NOME = "Principal";

// ─── IndexedDB ────────────────────────────────────────────────────────────

function openMemoriaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB não disponível neste navegador."));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timeout ao abrir IndexedDB (5s)."));
      }
    }, 5000);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Idempotente: recria o que faltar (banho novo OU upgrade v1/v2).
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions");
      }
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(OBJ_STORE)) {
        db.createObjectStore(OBJ_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      }
    };
    req.onerror = () => {
      if (!settled) {
        settled = true;
        reject(req.error ?? new Error("Erro ao abrir IndexedDB."));
      }
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro na transação."));
  });
}

// ─── Memórias (perfis) ────────────────────────────────────────────────────

/** Garante que a memória "Principal" exista (idempotente). */
export async function ensureDefaultMemoria(): Promise<MemoriaMeta> {
  const db = await openMemoriaDB();
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  const existing = await new Promise<MemoriaMeta | undefined>((resolve) => {
    const r = store.get(DEFAULT_MEMORIA_ID);
    r.onsuccess = () => resolve(r.result as MemoriaMeta | undefined);
    r.onerror = () => resolve(undefined);
  });
  if (existing) {
    await txDone(tx).catch(() => undefined);
    db.close();
    return existing;
  }
  const meta: MemoriaMeta = {
    id: DEFAULT_MEMORIA_ID,
    nome: DEFAULT_MEMORIA_NOME,
    createdAt: Date.now(),
  };
  store.put(meta);
  await txDone(tx);
  db.close();
  return meta;
}

export async function listMemorias(): Promise<MemoriaMeta[]> {
  await ensureDefaultMemoria();
  const db = await openMemoriaDB();
  const metas = await new Promise<MemoriaMeta[]>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const r = tx.objectStore(META_STORE).getAll();
    r.onsuccess = () => resolve((r.result as MemoriaMeta[]) ?? []);
    r.onerror = () => reject(r.error ?? new Error("Erro ao listar memórias."));
  });
  db.close();
  return metas.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createMemoria(nome: string): Promise<MemoriaMeta> {
  const clean = nome.trim().slice(0, 60);
  if (!clean) throw new Error("Nome vazio.");
  const meta: MemoriaMeta = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nome: clean,
    createdAt: Date.now(),
  };
  const db = await openMemoriaDB();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put(meta);
  await txDone(tx);
  db.close();
  return meta;
}

export async function deleteMemoria(memoriaId: string): Promise<void> {
  if (memoriaId === DEFAULT_MEMORIA_ID) {
    throw new Error("A memória Principal não pode ser excluída.");
  }
  const db = await openMemoriaDB();
  // Tira os objetos do perfil…
  const tx = db.transaction(OBJ_STORE, "readwrite");
  const store = tx.objectStore(OBJ_STORE);
  const all = await new Promise<MemoriaObject[]>((resolve) => {
    const r = store.getAll();
    r.onsuccess = () => resolve((r.result as MemoriaObject[]) ?? []);
    r.onerror = () => resolve([]);
  });
  for (const o of all) {
    if (o.memoriaId === memoriaId) store.delete(o.id);
  }
  await txDone(tx);
  // …e o perfil.
  const tx2 = db.transaction(META_STORE, "readwrite");
  tx2.objectStore(META_STORE).delete(memoriaId);
  await txDone(tx2);
  db.close();
  if (getActiveMemoriaId() === memoriaId) setActiveMemoriaId(DEFAULT_MEMORIA_ID);
}

export function getActiveMemoriaId(): string {
  if (typeof localStorage === "undefined") return DEFAULT_MEMORIA_ID;
  return localStorage.getItem(ACTIVE_KEY) || DEFAULT_MEMORIA_ID;
}

export function setActiveMemoriaId(id: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ACTIVE_KEY, id);
  }
}

// ─── Objetos ──────────────────────────────────────────────────────────────

function newId(): string {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Salva objeto novo (gera id) — retorna o objeto persistido. */
export async function putMemoriaObject(
  obj: Omit<MemoriaObject, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<MemoriaObject> {
  const now = Date.now();
  const full: MemoriaObject = {
    ...obj,
    id: obj.id ?? newId(),
    createdAt: now,
    updatedAt: now,
  };
  const db = await openMemoriaDB();
  const tx = db.transaction(OBJ_STORE, "readwrite");
  tx.objectStore(OBJ_STORE).put(full);
  await txDone(tx);
  db.close();
  return full;
}

/** Atualiza objeto existente (mantém createdAt). */
export async function updateMemoriaObject(obj: MemoriaObject): Promise<void> {
  const db = await openMemoriaDB();
  const tx = db.transaction(OBJ_STORE, "readwrite");
  tx.objectStore(OBJ_STORE).put({ ...obj, updatedAt: Date.now() });
  await txDone(tx);
  db.close();
}

export async function listMemoriaObjects(memoriaId: string): Promise<MemoriaObject[]> {
  const db = await openMemoriaDB();
  const all = await new Promise<MemoriaObject[]>((resolve, reject) => {
    const tx = db.transaction(OBJ_STORE, "readonly");
    const r = tx.objectStore(OBJ_STORE).getAll();
    r.onsuccess = () => resolve((r.result as MemoriaObject[]) ?? []);
    r.onerror = () => reject(r.error ?? new Error("Erro ao listar objetos."));
  });
  db.close();
  return all
    .filter((o) => o.memoriaId === memoriaId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteMemoriaObject(id: string): Promise<void> {
  const db = await openMemoriaDB();
  const tx = db.transaction(OBJ_STORE, "readwrite");
  tx.objectStore(OBJ_STORE).delete(id);
  await txDone(tx);
  db.close();
}

// ─── Busca instantânea (client-side) ──────────────────────────────────────

/**
 * Busca AND de termos (sem acento/minúsculo) em título+tags+resumo+corpo.
 * Score: título (10) > tags (7) > resumo (4) > corpo (1 por ocorrência).
 * Devolve snippet ao redor do 1º match do corpo.
 */
export function searchMemoria(objetos: MemoriaObject[], query: string): MemoriaHit[] {
  const q = normalizeText(query.trim());
  if (!q) {
    return objetos.map((obj) => ({ obj, snippet: obj.body.slice(0, 160), score: 0 }));
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: MemoriaHit[] = [];
  for (const obj of objetos) {
    const title = normalizeText(obj.title);
    const tags = normalizeText(obj.tags.join(" "));
    const summary = normalizeText(obj.summary ?? "");
    const body = normalizeText(obj.body);
    let score = 0;
    let allMatch = true;
    let firstIdx = -1;
    for (const term of terms) {
      let termScore = 0;
      if (title.includes(term)) termScore += 10;
      if (tags.includes(term)) termScore += 7;
      if (summary.includes(term)) termScore += 4;
      const idx = body.indexOf(term);
      if (idx >= 0) {
        termScore += 1 + Math.min(3, countOccurrences(body, term) - 1);
        if (firstIdx < 0) firstIdx = idx;
      }
      if (termScore === 0) {
        allMatch = false;
        break;
      }
      score += termScore;
    }
    if (!allMatch) continue;
    hits.push({ obj, snippet: makeSnippet(obj.body, firstIdx), score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i >= 0) {
    count += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function makeSnippet(body: string, normIdx: number): string {
  // O índice vem do texto NORMALIZADO; aproximamos no original pela janela
  // de caracteres (mesma ordem, então o offset é compatível na prática).
  const start = Math.max(0, (normIdx < 0 ? 0 : normIdx) - 60);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 160).trim()}…`;
}
