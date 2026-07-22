"use client";

import { useEffect } from "react";

/**
 * Ping de VISITA do Painel de Sócios — 1x por dia por aparelho.
 *
 * Fica na home do app: cada visitante (logado ou não) conta UMA visita
 * por dia. O hash do aparelho é aleatório e anônimo (guardado no
 * localStorage) — não rastreia pessoa, só aparelho/dia.
 */
export function VisitPing() {
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const last = localStorage.getItem("moka.visitDay");
      if (last === today) return;

      let hash = localStorage.getItem("moka.deviceHash");
      if (!hash) {
        hash = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("moka.deviceHash", hash);
      }

      fetch("/api/metrics/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "visit", deviceHash: hash }),
      }).catch(() => {});
      localStorage.setItem("moka.visitDay", today);
    } catch {
      // métrica nunca atrapalha o app
    }
  }, []);
  return null;
}
