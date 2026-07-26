/**
 * Núcleo de internacionalização (i18n) da INTERFACE do igot.
 *
 * SEPARADO do idioma das traduções de IA (getTargetLang em config.ts):
 *   - igot.uiLang     → idioma dos BOTÕES, MENUS, TEXTOS da interface
 *   - igot.targetLang → idioma em que a IA responde (tradução/explicação)
 *
 * Detecção automática na primeira visita:
 *   1. localStorage salvo (preferência do usuário)
 *   2. navigator.language / navigator.languages (idioma do aparelho)
 *   3. fallback: pt-BR
 */

import { UI_STRINGS } from "./ui-strings";
import type { UIStringKey } from "./ui-strings";

// Re-exporta o tipo pra que outros arquivos possam importar de um só lugar.
export type { UIStringKey };

const UI_LANG_KEY = "igot.uiLang";
const DEFAULT_LANG = "pt-BR";

/** Idiomas suportados pela interface, com bandeira + nome nativo. */
export const SUPPORTED_UI_LANGS: Array<{
  code: string;
  flag: string;
  name: string; // nome nativo (English, Português, 中文...)
}> = [
  { code: "pt-BR", flag: "🇧🇷", name: "Português" },
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
  { code: "ru", flag: "🇷🇺", name: "Русский" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "hi", flag: "🇮🇳", name: "हिन्दी" },
];

/** Mapa rápido: code → {flag, name}. */
const LANG_MAP = new Map(SUPPORTED_UI_LANGS.map((l) => [l.code, l]));

/** Lista só dos códigos suportados. */
const SUPPORTED_CODES = new Set(SUPPORTED_UI_LANGS.map((l) => l.code));

/**
 * Normaliza um código de idioma (ex: "pt-BR", "pt", "en-US") pra um dos
 * suportados. Se não achar, faz fallback em duas etapas:
 *   1. só o prefixo (ex: "pt-BR" → "pt", se "pt-BR" não existir)
 *   2. DEFAULT_LANG ("pt-BR")
 */
function normalizeLang(raw: string): string {
  if (SUPPORTED_CODES.has(raw)) return raw;
  // Tenta só o prefixo antes do "-".
  const prefix = raw.split("-")[0];
  if (SUPPORTED_CODES.has(prefix)) return prefix;
  // Alguns mapeamentos especiais.
  if (prefix === "pt") return "pt-BR";
  if (prefix === "zh" || prefix === "zh-CN" || prefix === "zh-TW") return "zh";
  return DEFAULT_LANG;
}

/**
 * Detecta o idioma da interface na primeira visita:
 *   1. localStorage (preferência salva)
 *   2. navigator.language (idioma do aparelho/navegador)
 *   3. fallback pt-BR
 */
export function detectUILang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  // 1. Preferência salva.
  const saved = window.localStorage.getItem(UI_LANG_KEY);
  if (saved && SUPPORTED_CODES.has(saved)) return saved;
  // Fallback padrão soberano Moka: pt-BR
  return DEFAULT_LANG;
}

/** Lê o idioma atual da interface (do localStorage). */
export function getUILang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const saved = window.localStorage.getItem(UI_LANG_KEY);
  if (saved && SUPPORTED_CODES.has(saved)) return saved;
  return DEFAULT_LANG;
}

/** Salva o idioma da interface. */
export function setUILang(lang: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeLang(lang);
  window.localStorage.setItem(UI_LANG_KEY, normalized);
}

/** Info (bandeira + nome) de um idioma, ou undefined se não suportado. */
export function getLangInfo(code: string) {
  return LANG_MAP.get(code);
}

/**
 * Pega uma string traduzida no idioma dado.
 * Substitui placeholders {var} pelos valores em `vars`.
 * Fallback: idioma → en → pt-BR → a própria chave.
 */
export function translate(
  lang: string,
  key: UIStringKey,
  vars?: Record<string, string | number>,
): string {
  const dict = UI_STRINGS[lang] ?? UI_STRINGS[DEFAULT_LANG];
  let text =
    dict[key] ??
    UI_STRINGS.en?.[key] ??
    UI_STRINGS[DEFAULT_LANG]?.[key] ??
    key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
