"use client";

import { useState } from "react";
import { useI18n } from "./I18nProvider";
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
        await auth.signInWithPassword(mail, senha);
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

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("auth_modal_title")}>
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

      <style jsx>{`
        /* Mobile-first (bug do Miguel, 05/08 — celular): o card é ALTO e, com
           centralização flex, o TOPO (botão do Google) ficava cortado e
           inalcançável. Padrão robusto: overlay rola + card com margin:auto
           (centraliza quando cabe, rola quando não cabe) + altura limitada
           à viewport dinâmica (100dvh lida com a barra do celular). */
        .am-overlay {
          position: fixed; inset: 0; z-index: 1100;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          overflow-y: auto;
          padding: 20px;
        }
        .am-card {
          margin: auto;
          background: var(--bg); border-radius: 16px; width: 100%; max-width: 380px;
          max-height: calc(100vh - 40px); /* fallback pra navegadores antigos */
          max-height: calc(100dvh - 40px);
          overflow-y: auto;
          padding: 22px; display: flex; flex-direction: column; gap: 12px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        }
        .am-head { display: flex; align-items: center; justify-content: space-between; }
        .am-head h2 { margin: 0; font-size: 18px; font-family: var(--font-brand); }
        .am-head button { border: none; background: var(--surface-alt); color: var(--text-muted); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; }
        .am-aviso { margin: 0; padding: 10px 12px; background: #eef7ee; border: 1px solid #2c7a2c33; color: #235c23; border-radius: 10px; font-size: 13.5px; line-height: 1.5; }
        .am-erro { margin: 0; padding: 10px 12px; background: var(--accent-soft); border-radius: 10px; color: var(--accent); font-size: 13.5px; line-height: 1.5; }
        .am-google {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 12px; border-radius: 10px; border: 1px solid var(--border);
          background: var(--surface); color: var(--text); font-size: 15px; font-weight: 700; cursor: pointer;
        }
        .am-google:hover { background: var(--accent-soft); border-color: var(--accent); }
        .am-g { font-weight: 800; color: #4285f4; font-size: 17px; }
        .am-divider { display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 12px; }
        .am-divider::before, .am-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
        form { display: flex; flex-direction: column; gap: 10px; }
        input {
          padding: 12px; border: 1px solid var(--border); border-radius: 10px;
          background: var(--surface); color: var(--text); font-size: 15px;
        }
        input:focus { outline: 2px solid var(--accent-soft); border-color: var(--accent); }
        .am-submit {
          padding: 12px; border: none; border-radius: 10px; cursor: pointer;
          background: var(--accent); color: var(--accent-contrast, #fff);
          font-size: 15px; font-weight: 700;
        }
        .am-submit:disabled { opacity: 0.6; cursor: wait; }
        .am-links { display: flex; justify-content: center; gap: 10px; font-size: 13px; color: var(--text-muted); }
        .am-link { border: none; background: none; color: var(--accent-dark); font-size: 13px; cursor: pointer; padding: 2px 4px; }
        .am-link:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
