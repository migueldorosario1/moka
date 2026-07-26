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
      <style jsx>{`
        .lang-switcher {
          position: relative;
          flex-shrink: 0;
          z-index: 1000;
        }
        .lang-switcher-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          width: ${compact ? "42px" : "auto"};
          height: 42px;
          padding: ${compact ? "0" : "0 12px"};
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: 10px;
          font-size: 18px;
          cursor: pointer;
          transition: all 150ms ease;
          justify-content: center;
        }
        .lang-switcher-btn:hover {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .lang-switcher-btn:active {
          transform: scale(0.92);
        }
        .lang-flag {
          font-size: 18px;
          line-height: 1;
        }
        .lang-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
        }
        .lang-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 180px;
          max-height: 320px;
          overflow-y: auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.18);
          z-index: 9999;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .lang-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: var(--text);
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          text-align: left;
          transition: background 100ms ease;
        }
        .lang-option:hover {
          background: var(--accent-soft);
        }
        .lang-option.active {
          background: var(--accent-soft);
          font-weight: 600;
        }
        .lang-check {
          margin-left: auto;
          color: var(--accent);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
