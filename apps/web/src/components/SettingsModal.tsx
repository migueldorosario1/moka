"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  // Portal: o modal é renderizado direto no <body>, ESCAPANDO de qualquer
  // ancestral com transform/filter/contain que criaria containing block e
  // quebraria o overlay (mesma cura do BUG-20260805-MOKA-LOGIN-MODAL-FAIXA-
  // CORTADA, aplicada no AuthModal). Guarda SSR: createPortal só no client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  return createPortal(
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

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </div>,
    document.body,
  );
}
