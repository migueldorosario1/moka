"use client";

import { useEffect, useState } from "react";
import type { AIConfig } from "@igot/ai-providers";
import { getConfigSync, loadConfigCache, invalidateConfigCache } from "@/lib/config";
import { useI18n } from "./I18nProvider";
import { SettingsForm } from "./SettingsForm";

interface SettingsModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Modal de Configurações de IA — abre por cima do livro, sem sair da leitura.
 *
 * - Backdrop escuro (clique fora fecha)
 * - Card central reusando o `<SettingsForm>`
 * - Fecha com ESC
 *
 * A config inicial é lida FRESCA a cada abertura (pra refletir um save anterior).
 */
export function SettingsModal({ onClose, onSaved }: SettingsModalProps) {
  const { t } = useI18n();
  const [config, setConfig] = useState<AIConfig | null>(null);

  // Lê a config FRESCA a cada abertura do modal.
  // invalidateConfigCache força reler do localStorage (descriptografando de novo)
  // — assim pega mudanças feitas fora (ex.: outra aba, ou clear anterior).
  useEffect(() => {
    invalidateConfigCache();
    loadConfigCache().then(() => setConfig(getConfigSync()));
  }, []);

  // Fecha com ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="settings-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("set_title")}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="settings-modal-header">
          <h2>{t("set_title")}</h2>
          <button
            className="settings-modal-close"
            onClick={onClose}
            aria-label={t("close")}
          >
            ✕
          </button>
        </header>
        <div className="settings-modal-body">
          <SettingsForm
            initial={config}
            onSaved={() => {
              // Invalida e recarrega pra garantir que o cache reflete o salvo.
              invalidateConfigCache();
              loadConfigCache().then(() => {
                setConfig(getConfigSync());
                onSaved?.();
              });
            }}
          />
        </div>
        <footer className="settings-modal-footer">
          <span className="settings-modal-version">Moka V 2.7.1</span>
          <span className="settings-modal-autosave">{t("set_autosave_note")}</span>
          <button className="settings-modal-done" onClick={onClose}>
            ✓ {t("close")}
          </button>
        </footer>
      </div>

      <style jsx>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(30, 20, 12, 0.4);
          -webkit-backdrop-filter: blur(5px);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          overflow-y: auto;
        }
        .settings-modal {
          background: var(--bg);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-lg);
        }
        .settings-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--bg);
          z-index: 1;
        }
        .settings-modal-header h2 {
          margin: 0;
          font-family: var(--font-brand);
          font-size: 19px;
          font-weight: 600;
        }
        .settings-modal-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          border-top: 1px solid var(--border-soft);
        }
        .settings-modal-version {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 700;
        }
        .settings-modal-autosave {
          flex: 1;
          font-size: 12px;
          color: var(--text-muted);
        }
        .settings-modal-done {
          background: var(--accent);
          color: #fff8ee;
          border: none;
          border-radius: var(--radius-pill);
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .settings-modal-close {
          width: 32px;
          height: 32px;
          border: none;
          background: var(--surface-alt);
          color: var(--text-muted);
          border-radius: 50%;
          font-size: 14px;
          cursor: pointer;
        }
        .settings-modal-close:hover {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .settings-modal-body {
          padding: 24px;
        }
        @media (max-width: 600px) {
          .settings-overlay {
            padding: 0;
          }
          .settings-modal {
            max-height: 100vh;
            height: 100vh;
            border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
