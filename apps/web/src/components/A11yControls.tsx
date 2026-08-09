"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import type { UIStringKey } from "@/lib/ui-strings";

/**
 * A11yControls — controle de acessibilidade (tema + tamanho de fonte).
 * Pedido do Miguel (09/08): "modo escuro com letra branca", "tamanho de
 * fonte grande pra quem enxerga pouco", "mudar a cor".
 *
 * Tema: claro (padrão) / escuro / alto contraste / sépia.
 * Fonte: slider de 0.85 a 1.4 (aplica --ui-font-scale no :root).
 *
 * Persistência: localStorage (moka.theme, moka.uiFontScale).
 * Aplicação imediata: data-theme no <html> + variável CSS.
 */

const THEME_KEY = "moka.theme";
const FONT_KEY = "moka.uiFontScale";

type Theme = "light" | "dark" | "contrast" | "sepia";

const THEMES: { id: Theme; icon: string; labelKey: UIStringKey }[] = [
  { id: "light", icon: "☀️", labelKey: "a11y_light" },
  { id: "dark", icon: "🌙", labelKey: "a11y_dark" },
  { id: "contrast", icon: "⚫", labelKey: "a11y_contrast" },
  { id: "sepia", icon: "📜", labelKey: "a11y_sepia" },
];

export function A11yControls() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("light");
  const [fontScale, setFontScale] = useState(1);
  const [mounted, setMounted] = useState(false);

  // Boot: lê preferências salvas e aplica.
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const savedTheme = (localStorage.getItem(THEME_KEY) as Theme) || "light";
    const savedFont = Number(localStorage.getItem(FONT_KEY)) || 1;
    setTheme(savedTheme);
    setFontScale(savedFont >= 0.85 && savedFont <= 1.4 ? savedFont : 1);
  }, []);

  // Aplica tema no <html> quando muda.
  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    if (theme === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, mounted]);

  // Aplica escala de fonte no :root quando muda.
  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    document.documentElement.style.setProperty("--ui-font-scale", String(fontScale));
    localStorage.setItem(FONT_KEY, String(fontScale));
  }, [fontScale, mounted]);

  if (!mounted) return null;

  return (
    <div className="a11y-controls" role="group" aria-label={t("a11y_title")}>
      <div className="a11y-row">
        <span className="a11y-label">{t("a11y_theme")}</span>
        <div className="a11y-themes">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`a11y-theme-btn ${theme === th.id ? "active" : ""}`}
              onClick={() => setTheme(th.id)}
              aria-pressed={theme === th.id}
              title={t(th.labelKey)}
            >
              {th.icon}
            </button>
          ))}
        </div>
      </div>
      <div className="a11y-row">
        <span className="a11y-label">
          {t("a11y_font")} <strong>A</strong>
          <span className="a11y-font-val">{Math.round(fontScale * 100)}%</span>
          <strong style={{ fontSize: "1.3em" }}>A</strong>
        </span>
        <input
          type="range"
          min={0.85}
          max={1.4}
          step={0.05}
          value={fontScale}
          onChange={(e) => setFontScale(Number(e.target.value))}
          className="a11y-font-slider"
          aria-label={t("a11y_font")}
        />
      </div>
    </div>
  );
}
