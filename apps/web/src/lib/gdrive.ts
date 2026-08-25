/**
 * gdrive — busca e baixa livros (PDF/EPUB) direto do Google Drive do
 * usuário, subindo pra estante SEM baixar pro computador (pedido do
 * Miguel, 24/08: "pode subir para a estante mesmo sem precisar baixar").
 *
 * Sem OAuth client próprio do Google: usa o MESMO login Google do Moka
 * (Supabase). O token do Google fica na sessão (`provider_token`) quando
 * o login foi feito com o provider Google — desde que o Supabase peça o
 * escopo drive.readonly (Authentication → Providers → Google →
 * Authorized scopes — ação do Miguel no Dashboard; ver Adendo 12 do
 * fórum do espelho). O token expira ~1h; sem ele → re-login (renova com
 * o escopo configurado).
 *
 * Tudo best-effort: erro NUNCA quebra a estante.
 */

import { createClient } from "./supabase/client";

/** Um livro do Drive (só metadados). */
export interface DriveBook {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/** Token OAuth do Google da sessão atual (null = precisa logar de novo). */
export async function getDriveToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const s = data.session as
    | { provider_token?: string | null; provider_access_token?: string | null }
    | null;
  return s?.provider_token ?? s?.provider_access_token ?? null;
}

/** Re-login Google (mesmo fluxo do botão Entrar) — renova o token com escopo. */
export async function reconnectGoogle(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    },
  });
}

/** Lista PDFs/EPUBs do Drive (mais recentes primeiro). 401/403 = sem escopo. */
export async function listDriveBooks(
  token: string,
  query = "",
): Promise<DriveBook[]> {
  const nome = query.replace(/['\\]/g, "");
  const q =
    "(mimeType = 'application/pdf' or name contains '.epub' or name contains '.pdf')" +
    ` and trashed = false${nome ? ` and name contains '${nome}'` : ""}`;
  const url =
    "https://www.googleapis.com/drive/v3/files?q=" +
    encodeURIComponent(q) +
    "&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=50";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("NEED_AUTH");
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  const j = (await res.json()) as { files?: DriveBook[] };
  return j.files ?? [];
}

/** Baixa o conteúdo do livro do Drive — bytes no navegador, nada no disco. */
export async function fetchDriveFile(
  token: string,
  id: string,
): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401 || res.status === 403) throw new Error("NEED_AUTH");
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  return res.arrayBuffer();
}
