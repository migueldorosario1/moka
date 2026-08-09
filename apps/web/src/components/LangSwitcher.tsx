"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "./I18nProvider";
import { SUPPORTED_UI_LANGS, getLangInfo } from "@/lib/i18n";

/**
 * Seletor de idioma da interface.
 *
 * Mostra a bandeira do idioma atual. Ao clicar, abre um dropdown com todos
 * os 12 idiomas suportados (bandeira + nome nativo). Ao escolher, troca
 * instantaneamente toda a interface.
 *
 * Compacto: só a bandeira (+ nome em telas largas).
 */
export function LangSwitcher({ compact = true }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getLangInfo(lang) ?? SUPPORTED_UI_LANGS[0];

  // Fecha ao clicar/tocar fora.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        type="button"
        className="lang-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        title={current.name}
      >
        <span className="lang-flag">{current.flag}</span>
        {!compact && <span className="lang-name">{current.name}</span>}
      </button>
      {open && (
        <div className="lang-dropdown" role="menu">
          {SUPPORTED_UI_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-option ${l.code === lang ? "active" : ""}`}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              role="menuitem"
            >
              <span className="lang-flag">{l.flag}</span>
              <span>{l.name}</span>
              {l.code === lang && <span className="lang-check">✓</span>}
            </button>
          ))}
        </div>
      )}
      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </div>
  );
}
