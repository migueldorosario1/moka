"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "./AuthModal";
import { getUILang } from "@/lib/i18n";

/**
 * RequireAuth — exige LOGIN pra usar o app (decisão do Miguel, 13/08/2026):
 *   "a gente só pode permitir que usuários logados utilizem o aplicativo.
 *    até para a gente ter os dados necessários para melhorar ele."
 *   "bota um aviso: o Moka é gratuito, mas você precisa estar logado p/ usar."
 *
 * Envolva as páginas de USO (estante, leitura). Não-logado → aviso + botão
 * que abre a AuthModal (Google OU e-mail). Logado → mostra o conteúdo.
 *
 * i18n: o aviso é autocontido (mapa interno de 12 idiomas) — não mexe no
 * ui-strings.ts gigante. Cai em pt-BR se o idioma não estiver no mapa.
 */

const STRINGS: Record<string, { title: string; sub: string; cta: string }> = {
  "pt-BR": { title: "O Moka é gratuito", sub: "mas você precisa estar logado para utilizar.", cta: "Entrar ou criar conta" },
  en: { title: "Moka is free", sub: "but you need to be signed in to use it.", cta: "Sign in or create account" },
  es: { title: "Moka es gratuito", sub: "pero necesitas iniciar sesión para usarlo.", cta: "Iniciar sesión o crear cuenta" },
  fr: { title: "Moka est gratuit", sub: "mais vous devez être connecté pour l'utiliser.", cta: "Se connecter ou créer un compte" },
  de: { title: "Moka ist kostenlos", sub: "aber du musst angemeldet sein, um es zu nutzen.", cta: "Anmelden oder Konto erstellen" },
  it: { title: "Moka è gratuito", sub: "ma devi aver effettuato l'accesso per usarlo.", cta: "Accedi o crea un account" },
  ru: { title: "Moka бесплатен", sub: "но для использования нужно войти.", cta: "Войти или создать аккаунт" },
  zh: { title: "Moka 是免费的", sub: "但您需要登录才能使用。", cta: "登录或创建账户" },
  ja: { title: "Mokaは無料です", sub: "ただし、利用にはログインが必要です。", cta: "ログインまたはアカウント作成" },
  ko: { title: "Moka는 무료입니다", sub: "하지만 사용하려면 로그인이 필요합니다.", cta: "로그인 또는 계정 만들기" },
  ar: { title: "Moka مجاني", sub: "لكنك تحتاج إلى تسجيل الدخول لاستخدامه.", cta: "تسجيل الدخول أو إنشاء حساب" },
  hi: { title: "Moka मुफ़्त है", sub: "लेकिन इसे उपयोग करने के लिए आपको लॉग इन होना होगा।", cta: "साइन इन करें या खाता बनाएँ" },
};

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const s = STRINGS[getUILang()] ?? STRINGS["pt-BR"];

  if (auth.status === "loading") {
    return (
      <main className="igot-shell">
        <div className="igot-loading">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  if (auth.status !== "authed") {
    return (
      <main className="igot-shell">
        <div className="require-auth">
          <div className="require-auth-card">
            <div className="require-auth-logo" aria-hidden>☕</div>
            <h2 className="require-auth-title">{s.title}</h2>
            <p className="require-auth-sub">{s.sub}</p>
            <button type="button" className="require-auth-cta" onClick={() => setOpen(true)}>
              {s.cta}
            </button>
          </div>
        </div>
        {open && <AuthModal auth={auth} onClose={() => setOpen(false)} />}
      </main>
    );
  }

  return <>{children}</>;
}
