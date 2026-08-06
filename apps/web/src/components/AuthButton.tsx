"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
 * Botão de login/logout.
 *
 * Logado: avatar + dropdown com backdrop invisível.
 * O backdrop cobre a tela inteira atrás do dropdown:
 * - Tocar fora = fecha (backdrop recebe o clique)
 * - Tocar no dropdown = funciona normal (sem corrida de eventos)
 * - Tocar em "Sair" = executa logout ANTES de fechar
 *
 * Isso é à prova de iOS/Safari (sem pointerdown/pointerup race condition).
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
  const [dropdownPos, setDropdownPos] = useState({ top: 54, right: 12 });

  // Calcula posição do dropdown baseada na posição real do avatar.
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 6,
      right: Math.max(4, window.innerWidth - rect.right),
    });
  }, []);

  // Atualiza posição ao abrir e em resize/scroll.
  useEffect(() => {
    if (!menuOpen) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [menuOpen, updatePos]);

  if (status === "loading") {
    return (
      <div className="auth-loading" aria-label={t("auth_checking")}>
        <div className="auth-spinner" />
      </div>
    );
  }

  if (status === "anon") {
    // Botão NEUTRO (pedido do Miguel, 05/08): nada de logo do Google aqui —
    // dá pra entrar com e-mail também. O botão do Google vive DENTRO da
    // janela de login (AuthModal).
    return (
      <button className="auth-signin" onClick={onSignIn}>
        <span>{t("auth_signin")}</span>
      </button>
    );
  }

  // Logado: avatar + dropdown com BACKDROP.
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
        <>
          {/* BACKDROP invisível que cobre a tela toda.
              Tocar fora do dropdown = clica no backdrop = fecha.
              Sem race condition (pointerdown vs click). */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99998 }}
            onClick={() => setMenuOpen(false)}
          />
          {/* DROPDOWN com zIndex maior que o backdrop. */}
          <div
            role="menu"
            style={{
              position: "fixed",
              top: `${dropdownPos.top}px`,
              right: `${dropdownPos.right}px`,
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
          </div>
        </>,
        document.fullscreenElement ?? document.body,
      )}
    </div>
  );
}
