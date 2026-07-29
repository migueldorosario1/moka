"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";

/**
 * BackButton — o botão "← Voltar" (pedido do Miguel, 29/07: "o botão fechar
 * tá sem sentido, melhor ter o botão voltar pra página anterior").
 * Volta no histórico; se não houver, vai pra capa.
 */
export function BackButton() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="gear"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      aria-label={t("back")}
      title={t("back")}
      style={{ fontSize: "18px", lineHeight: 1 }}
    >
      ←
    </button>
  );
}
