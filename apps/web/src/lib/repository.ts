/**
 * Repository adapter — decide entre NUVEM (Supabase) e LOCAL (IndexedDB).
 *
 * Contrato: quem chama (o hook useSession) não sabe nem liga pra onde os
 * dados vão. Se o usuário tá logado (userId presente), grava/lê no Supabase.
 * Se deslogado, cai no IndexedDB local (fallback que sempre funciona).
 *
 * O pdfSource (Uint8Array do PDF bruto) NUNCA vai pra nuvem — é grande e
 * o usuário reabre o arquivo em outro dispositivo. Sincronizamos só o
 * `book` (ParsedBook — texto estruturado) + progresso + traduções + notas.
 */

import type { ParsedBook } from "@igot/parser";
import {
  saveSession,
  loadSession,
  clearSession,
  clearLibrary,
  listAllBooks,
  getBookById,
  saveBookToLibrary,
  deleteBookFromLibrary,
  type Session,
  type SavedNote,
} from "./db";
import { createClient } from "./supabase/client";

/** O que vai pra nuvem (tudo exceto pdfSource binário). */
export interface CloudBook {
  id: string;
  title: string;
  file_name: string;
  file_size: number;
  source_format: string;
  book: ParsedBook;
  chapter_idx: number;
  zoom: number;
  translations: Record<string, string>;
  notes: SavedNote[];
  saved_at: number;
}

/** Converte a Session local (IndexedDB) pro modelo de nuvem (sem pdfSource). */
export function sessionToCloud(session: Session, cloudId?: string): CloudBook {
  return {
    id: cloudId ?? `book-${Date.now()}`,
    title: session.book.title,
    file_name: session.fileName,
    file_size: session.fileSize,
    source_format: session.book.sourceFormat,
    book: session.book,
    chapter_idx: session.chapterIdx,
    zoom: session.zoom,
    translations: session.translations ?? {},
    notes: session.notes ?? [],
    saved_at: session.savedAt,
  };
}

/**
 * Salva o livro atual.
 * - Logado → upsert no Supabase (tabela `books`).
 * - Deslogado → IndexedDB (key "current").
 */
export async function saveBook(
  session: Session,
  userId: string | null,
  cloudId?: string,
): Promise<string | undefined> {
  // Sempre grava local também (fallback offline + cache).
  await saveSession(session).catch((err) =>
    console.warn("Falha ao gravar local:", err),
  );

  if (!userId) return undefined; // deslogado: só local

  const supabase = createClient();
  const row = sessionToCloud(session, cloudId);
  const { data, error } = await supabase
    .from("books")
    .upsert(
      {
        ...(cloudId ? { id: cloudId } : {}),
        user_id: userId,
        title: row.title,
        file_name: row.file_name,
        file_size: row.file_size,
        source_format: row.source_format,
        book: row.book,
        chapter_idx: row.chapter_idx,
        zoom: row.zoom,
        translations: row.translations,
        notes: row.notes,
        saved_at: row.saved_at,
      },
      { onConflict: cloudId ? "id" : undefined },
    )
    .select("id")
    .single();

  if (error) {
    console.warn("Falha ao gravar na nuvem:", error.message);
    return cloudId;
  }
  return data?.id;
}

/**
 * Carrega o último livro do usuário.
 * - Logado → busca o mais recente da nuvem.
 * - Deslogado → IndexedDB.
 */
export async function loadBook(
  userId: string | null,
): Promise<{ session: Session; cloudId?: string } | null> {
  if (!userId) {
    const local = await loadSession();
    return local ? { session: local } : null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("saved_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    // Nuvem vazia ou erro → cai pro local.
    const local = await loadSession();
    return local ? { session: local } : null;
  }

  // Reconstrói a Session a partir do row da nuvem (sem pdfSource —
  // o usuário reabre o arquivo se quiser renderizar o PDF nativo).
  const session: Session = {
    id: "current",
    fileName: data.file_name,
    fileSize: data.file_size,
    book: data.book as ParsedBook,
    pdfSource: null,
    chapterIdx: data.chapter_idx ?? 0,
    zoom: data.zoom ?? 1,
    savedAt: data.saved_at ?? Date.now(),
    translations: data.translations ?? {},
    notes: data.notes ?? [],
  };
  return { session, cloudId: data.id };
}

/** Remove o livro atual (local + nuvem se logado). */
export async function deleteBook(
  userId: string | null,
  cloudId?: string,
): Promise<void> {
  await clearSession().catch((err) => console.warn("Falha ao limpar local:", err));
  if (!userId || !cloudId) return;
  const supabase = createClient();
  await supabase.from("books").delete().eq("id", cloudId);
}

// ─── Biblioteca (múltiplos livros) ───────────────────────────────────────

/**
 * Lista todos os livros da estante (sem pdfSource — leve, só pra grid).
 * Logado → Supabase. Deslogado → IndexedDB.
 */
export async function listLibrary(userId: string | null): Promise<Session[]> {
  // Sempre carrega LOCAL primeiro (tem chapters + pdfSource válidos).
  const localBooks = await listAllBooks().catch(() => []);

  if (!userId) {
    return localBooks;
  }

  // Logado: busca da nuvem e FAZ MERGE com local.
  // Prioriza o `book` LOCAL (tem chapters completos), mas pega progresso/
  // notas/marcadores da nuvem se forem mais recentes.
  const supabase = createClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("saved_at", { ascending: false });

  if (error || !data) return localBooks;

  // Mapa dos livros locais por ID (pra merge rápido).
  const localById = new Map(localBooks.map((b) => [b.id, b]));

  const merged: Session[] = data.map((row: Record<string, unknown>) => {
    const id = row.id as string;
    const local = localById.get(id);

    // Se tem cópia local VÁLIDA (com chapters), usa ela como base.
    if (local && local.book?.chapters?.length > 0) {
      return {
        ...local,
        // Pegamos da nuvem só o que faz sentido sincronizar:
        chapterIdx: (row.chapter_idx as number) ?? local.chapterIdx,
        zoom: (row.zoom as number) ?? local.zoom,
        savedAt: (row.saved_at as number) ?? local.savedAt,
        translations: (row.translations as Record<string, string>) ?? local.translations ?? {},
        notes: (row.notes as SavedNote[]) ?? local.notes ?? [],
        bookmarks: (row.bookmarks as Array<{ chapterIdx: number; savedAt: number }>) ?? local.bookmarks ?? [],
      };
    }

    // Senão, usa o da nuvem (pode ter chapters incompletos, mas é o que tem).
    return {
      id,
      fileName: row.file_name as string,
      fileSize: row.file_size as number,
      book: row.book as ParsedBook,
      pdfSource: null,
      chapterIdx: row.chapter_idx as number,
      zoom: row.zoom as number,
      savedAt: row.saved_at as number,
      translations: (row.translations as Record<string, string>) ?? {},
      notes: (row.notes as SavedNote[]) ?? [],
      bookmarks: (row.bookmarks as Array<{ chapterIdx: number; savedAt: number }>) ?? [],
      coverImage: row.cover_image as string | undefined,
    };
  });

  // Adiciona livros locais que NÃO tão na nuvem (novos, ainda não sincronizados).
  for (const local of localBooks) {
    if (!merged.some((m) => m.id === local.id)) {
      merged.push(local);
    }
  }

  return merged;
}

/** Pega um livro específico pelo ID (com pdfSource pra renderizar PDF). */
export async function getBook(id: string): Promise<Session | null> {
  // Sempre tenta local primeiro (pdfSource só tá local).
  const local = await getBookById(id).catch(() => null);
  return local;
}

/** Salva livro na biblioteca (estante). */
export async function saveToLibrary(session: Session, userId?: string | null): Promise<void> {
  await saveBookToLibrary(session).catch((err) =>
    console.warn("Falha ao salvar na estante local:", err),
  );
  if (!userId) return;
  // Também sincroniza pra nuvem (sem pdfSource).
  const supabase = createClient();
  await supabase.from("books").upsert({
    id: session.id,
    user_id: userId,
    title: session.book.title,
    file_name: session.fileName,
    file_size: session.fileSize,
    source_format: session.book.sourceFormat,
    book: session.book,
    chapter_idx: session.chapterIdx,
    zoom: session.zoom,
    translations: session.translations ?? {},
    notes: session.notes ?? [],
    bookmarks: session.bookmarks ?? [],
    saved_at: session.savedAt,
  });
}

/**
 * Remove livro da biblioteca (local + nuvem + legado).
 * Marca flag de migração pra evitar recriação.
 */
export async function removeFromLibrary(id: string, userId?: string | null): Promise<void> {
  await deleteBookFromLibrary(id).catch(() => {});
  // Marca migração como feita — senão o livro legado recria o que acabou de excluir.
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("igot.migrated", "1");
  }
  if (!userId) return;
  const supabase = createClient();
  await supabase.from("books").delete().eq("id", id);
}

/**
 * Limpa TODA a estante — local (IndexedDB) + nuvem (Supabase) + legado.
 * É a função que o botão "Limpar tudo" chama. Garante que nada volta.
 */
export async function clearAllBooks(userId?: string | null): Promise<void> {
  // 1. Limpa IndexedDB (store 'books' + 'sessions' + flag migração).
  await clearLibrary();

  // 2. Limpa Supabase (nuvem) se logado.
  if (userId) {
    try {
      const supabase = createClient();
      await supabase.from("books").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (err) {
      console.warn("Falha ao limpar nuvem:", err);
    }
  }
}
