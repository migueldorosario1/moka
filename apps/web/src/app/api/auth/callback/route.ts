/**
 * GET /api/auth/callback
 *
 * Recebe o redirect do Google OAuth. O Supabase vem com um `code` na query
 * string; trocamos por sessão (setando os cookies HttpOnly) e mandamos
 * o usuário de volta pra home.
 *
 * Esse é o fluxo padrão de PKCE do Supabase com @supabase/ssr.
 *
 * IMPORTANTE: o `requestUrl.origin` aqui é o domínio do Supabase (porque
 * é o Supabase que faz o redirect final), NÃO o domínio do nosso app.
 * Por isso usamos o header `x-forwarded-host` / referer pra achar a
 * origem certa (igot-taupe.vercel.app). Cai pra "/" se não achar.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createClient();
    // Troca o code por sessão (seta os cookies automaticamente).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Link expirado/já usado: avisa na página de destino em vez de
      // jogar a pessoa na home sem explicação (relato do Miguel, 05/08).
      const next = requestUrl.searchParams.get("next");
      const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      const alvo = destino.startsWith("/auth/") ? `${destino}?erro=1` : destino;
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") ?? "https";
      const origin = siteUrl ? siteUrl.replace(/\/$/, "") : `${proto}://${host}`;
      return NextResponse.redirect(`${origin}${alvo}`);
    }
  }

  // Descobre a URL pública do app pra onde voltar.
  // 1. Variável de ambiente explícita (mais confiável em produção).
  // 2. Headers da Vercel (x-forwarded-host).
  // 3. Fallback: requestUrl.origin.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const fwdHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");

  let origin: string;
  if (siteUrl) {
    origin = siteUrl.replace(/\/$/, "");
  } else if (fwdHost) {
    origin = `${proto}://${fwdHost}`;
  } else {
    origin = requestUrl.origin.includes("localhost")
      ? requestUrl.origin
      : `https://${host}`;
  }

  // NUNCA redireciona pra localhost quando em produção.
  if (origin.includes("localhost") && process.env.NODE_ENV === "production") {
    origin = "https://mokareader.com";
  }

  // Destino pós-login: `next` (ex.: /auth/atualizar-senha no fluxo
  // "esqueci a senha") — só caminhos internos, senão cai na home.
  const next = requestUrl.searchParams.get("next");
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return NextResponse.redirect(`${origin}${destino}`);
}
