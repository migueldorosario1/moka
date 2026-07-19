"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AuthStatus } from "@/lib/auth";
import { useI18n } from "./I18nProvider";

interface AuthButtonProps {
  status: AuthStatus;
  userName?: string | null;
  avatarUrl?: string | null;
  onSignIn: () => void;
  onSignOut: () => Promise<void> | void;
}

/**
 * Botão de login/logout no TopBar.
 *
 * - Carregando: pequeno spinner
 * - Deslogado: "Entrar com Google" (com logo)
 * - Logado: avatar (foto do Google) + dropdown com nome e "Sair"
 *
 * Dropdown renderizado via createPortal(document.body) pra escapar de
 * qualquer overflow:hidden do header do Reader.
 */
export function AuthButton({
  status,
  userName,
  avatarUrl,
  onSignIn,
  onSignOut,
}: AuthButtonProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora (verifica trigger E dropdown).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (status === "loading") {
    return (
      <div className="auth-loading" aria-label={t("auth_checking")}>
        <div className="auth-spinner" />
      </div>
    );
  }

  if (status === "anon") {
    return (
      <button className="auth-signin" onClick={onSignIn}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        <span>{t("auth_signin")}</span>
      </button>
    );
  }

  // Logado: avatar + dropdown via PORTAL.
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } catch (err) {
      console.error("[moka-auth] Falha no logout:", err);
    }
    setSigningOut(false);
    setMenuOpen(false);
  };

  return (
    <div className="auth-user" ref={triggerRef} style={{ position: "relative" }}>
      <button
        className="auth-avatar-btn"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={t("auth_account_menu")}
        title={userName ?? t("auth_user")}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="auth-avatar" />
        ) : (
          <span className="auth-avatar-fallback">
            {(userName ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      {menuOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={{
            position: "fixed",
            top: "54px",
            right: "12px",
            zIndex: 99999,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            padding: "10px",
            minWidth: "180px",
          }}
        >
          <div style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
            marginBottom: "8px",
            wordBreak: "break-word",
          }}>
            {userName ?? t("auth_user")}
          </div>
          <button
            onClick={handleSignOut}
            role="menuitem"
            disabled={signingOut}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              color: "var(--accent)",
              padding: "10px 8px",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: signingOut ? "wait" : "pointer",
              textAlign: "left",
              opacity: signingOut ? 0.5 : 1,
            }}
          >
            {signingOut ? "..." : t("auth_signout")}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
