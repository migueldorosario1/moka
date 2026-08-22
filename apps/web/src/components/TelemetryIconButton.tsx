"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { tt } from "@/lib/telemetry-strings";

/**
 * 📊 Atalho pra página "Suas IAs" (/telemetria) — fica DO LADO da engrenagem
 * ⚙️ nas topbars (pedido do Miguel, 22/08: "tem que vir um ícone lá em cima,
 * telemetria grande... tem que estar entre os ícones, em toda parte").
 */
export function TelemetryIconButton() {
  const router = useRouter();
  const { lang } = useI18n();
  return (
    <button
      type="button"
      className="gear tele-gear"
      onClick={() => router.push("/telemetria")}
      aria-label={tt(lang, "tele_nav")}
      title={tt(lang, "tele_nav")}
    >
      📊
    </button>
  );
}
