"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "./I18nProvider";
import { setConta, verificarConta } from "@/lib/moka-conta";
import type { useAuth } from "@/lib/auth";

type Auth = ReturnType<typeof useAuth>;
type Mode = "login" | "signup" | "forgot";

interface AuthModalProps {
  auth: Auth;
  onClose: () => void;
}

/** Traduz os erros comuns do Supabase pra pt-BR de gente. */
function friendlyError(msg: string, fallback: string): string {
  if (/invalid login credentials/i.test(msg)) return fallback;
  if (/user already registered|already been registered/i.test(msg))
    return "Esse e-mail já tem conta — toca em Entrar (ou em Esqueci a senha).";
  if (/password should be at least/i.test(msg))
    return "A senha precisa de pelo menos 6 caracteres.";
  if (/unable to validate email|invalid email/i.test(msg))
    return "Confere o e-mail digitado — parece inválido.";
  if (/rate limit|too many requests/i.test(msg))
    return "Muitas tentativas seguidas — espera um minutinho e tenta de novo.";
  return msg;
}

/**
 * Janela de cadastro/login do Moka — DUAS portas (pedido do Miguel, 05/08):
 *   1. Google (um toque)
 *   2. E-mail comum + senha — com confirmação por e-mail ("clique, chega no
 *      e-mail e você confirma") e "Esqueci a senha" (link por e-mail).
 * Por que importa: biblioteca syncada entre aparelhos + canal de e-mail
 * com o leitor (newsletter).
 */
export function AuthModal({ auth, onClose }: AuthModalProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setErro("");
    setAviso("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErro(friendlyError(e instanceof Error ? e.message : String(e), t("auth_wrong")));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const mail = email.trim().toLowerCase();
    if (!mail || (mode !== "forgot" && senha.length < 6)) {
      if (mode !== "forgot" && senha.length < 6) setErro(t("auth_password_short"));
      return;
    }
    if (mode === "login") {
      await run(async () => {
        try {
          await auth.signInWithPassword(mail, senha);
        } catch (eCloud) {
          // PORTA DUPLA (bug do Miguel, 06/09): contas de pontos/teste (incl. a
          // do revisor do Google) vivem no gateway Tencent, não no Supabase.
          // Se a porta cloud recusar, tenta a MESMA credencial no gateway —
          // assim o revisor entra por qualquer porta que tocar.
          const info = await verificarConta(mail, senha).catch(() => null);
          if (!info) throw eCloud;
          setConta({ email: mail, senha });
          window.dispatchEvent(new Event("moka-conta-mudou"));
        }
        onClose();
      });
    } else if (mode === "signup") {
      await run(async () => {
        const r = await auth.signUpWithPassword(mail, senha);
        if (r.needsConfirmation) {
          setAviso(t("auth_check_email"));
          setMode("login");
          setSenha("");
        } else {
          onClose();
        }
      });
    } else {
      await run(async () => {
        await auth.resetPassword(mail);
        setAviso(t("auth_reset_sent"));
        setMode("login");
      });
    }
  };

  // PORTAL pro <body> (bug "probleminha meio grave" do Miguel, 05/08 — print
  // mostrava a janela virando uma FAIXA cortada no topo): renderizado inline
  // dentro da topbar, o `position: fixed` do overlay quebrava por algum
  // ancestral (transform/filter cria containing block) — o overlay cobria
  // só uma faixa do topo e o card ficava cortado. Renderizando via portal
  // no body, o overlay cobre a viewport INTEIRA sempre, em qualquer página.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fecha só por ✕ ou Esc. Clique no escuro NÃO fecha (bug do Miguel, 06/09:
  // a caixa "ficou fechando" sozinha no meio do teste de login).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="am-overlay">
      <div className="am-card" role="dialog" aria-label={t("auth_modal_title")}>
        <header className="am-head">
          <h2>{t("auth_modal_title")}</h2>
          <button onClick={onClose} aria-label={t("close")} title={t("close")}>✕</button>
        </header>

        {aviso && <p className="am-aviso">{aviso}</p>}
        {erro && <p className="am-erro">⚠️ {erro}</p>}

        <button
          className="am-google"
          onClick={() => {
            onClose();
            void auth.signInWithGoogle();
          }}
        >
          <span className="am-g">G</span> {t("auth_google")}
        </button>

        <div className="am-divider"><span>{t("auth_or_email")}</span></div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="email"
            required
            placeholder={t("auth_email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder={t("auth_password")}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          )}
          <button className="am-submit" type="submit" disabled={busy}>
            {busy
              ? "⏳"
              : mode === "login"
                ? t("auth_btn_login")
                : mode === "signup"
                  ? t("auth_btn_signup")
                  : t("auth_reset_btn")}
          </button>
        </form>

        <div className="am-links">
          {mode === "login" && (
            <>
              <button className="am-link" onClick={() => { setMode("forgot"); setErro(""); }}>
                {t("auth_forgot")}
              </button>
              <span>·</span>
              <button className="am-link" onClick={() => { setMode("signup"); setErro(""); }}>
                {t("auth_btn_signup")}
              </button>
            </>
          )}
          {mode !== "login" && (
            <button className="am-link" onClick={() => { setMode("login"); setErro(""); }}>
              {t("auth_have_account")}
            </button>
          )}
        </div>
      </div>

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </div>,
    document.body,
  );
}
