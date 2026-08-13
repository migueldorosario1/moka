"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  detectUILang,
  setUILang,
  translate,
  type UIStringKey,
} from "@/lib/i18n";
import { installGlobalErrorCapture } from "@/lib/diagnostics";

interface I18nContextValue {
  /** Idioma atual da interface (ex: "pt-BR", "en"). */
  lang: string;
  /** Pega string traduzida. Substitui {var} pelos valores. */
  t: (key: UIStringKey, vars?: Record<string, string | number>) => string;
  /** Troca o idioma da interface (salva no localStorage + re-renderiza). */
  setLang: (lang: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provider de i18n da interface.
 *
 * No boot, detecta o idioma (localStorage → navigator.language → pt-BR).
 * Disponibiliza `t()` pra traduzir strings em qualquer componente filho.
 * Atualiza <html lang> pra acessibilidade.
 *
 * Uso:
 *   const { t, lang, setLang } = useI18n();
 *   <button>{t("save")}</button>
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>("pt-BR");

  // Boot: detecta idioma no cliente (evita hidration mismatch).
  useEffect(() => {
    const detected = detectUILang();
    setLangState(detected);
    // Captura de erros GLOBAIS (pedido Miguel, 13/08): qualquer erro não
    // tratado no app vira um relatório copiável (pro Kimi analisar).
    installGlobalErrorCapture();
  }, []);

  // Atualiza <html lang> quando muda (acessibilidade + SEO).
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback(
    (key: UIStringKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  );

  const setLang = useCallback((newLang: string) => {
    setUILang(newLang);
    setLangState(newLang);
  }, []);

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Hook pra acessar o contexto de i18n. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback se usado fora do provider (não deve acontecer).
    return {
      lang: "pt-BR",
      t: (key) => translate("pt-BR", key),
      setLang: () => {},
    };
  }
  return ctx;
}
