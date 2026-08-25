"use client";

import { useRouter } from "next/navigation";

/**
 * 🏆 Atalho pro Mural das IAS — página PRÓPRIA (pedido do Miguel, 24/08:
 * mural separado da telemetria, com ícone na primeira página). Fica ao
 * lado do 📊 nas topbars.
 */
export function MuralIconButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="gear tele-gear"
      onClick={() => router.push("/mural-das-ias")}
      aria-label="Mural das IAs"
      title="Mural das IAs"
    >
      🏆
    </button>
  );
}
