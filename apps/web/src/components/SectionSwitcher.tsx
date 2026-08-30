"use client";

import Link from "next/link";

/**
 * Seletor de seções do Moka unificado (V 2.0 — fusão Reader + Video).
 *
 * Fica no topo, ao lado da marca: 📖 livros · 🎬 vídeos · 🧠 memória.
 * Um app só, como pediu o Miguel: "íconezinho de vídeo e íconezinho de livro".
 * 🧠 MOKA MEMÓRIA entrou na OBRA MOKA (30/08/2026, DSC-019: módulo com
 * ícone próprio).
 */
export function SectionSwitcher({
  active,
}: {
  active: "reader" | "video" | "memoria";
}) {
  return (
    <nav className="section-switch" aria-label="Seções do Moka">
      <Link
        href="/estante"
        className={`section-switch-btn ${active === "reader" ? "active" : ""}`}
        title="Moka Reader — seus livros"
        aria-label="Livros"
        aria-current={active === "reader" ? "page" : undefined}
      >
        📖
      </Link>
      <Link
        href="/video"
        className={`section-switch-btn ${active === "video" ? "active" : ""}`}
        title="Moka Video — leia vídeos"
        aria-label="Vídeos"
        aria-current={active === "video" ? "page" : undefined}
      >
        🎬
      </Link>
      <Link
        href="/memoria"
        className={`section-switch-btn ${active === "memoria" ? "active" : ""}`}
        title="Moka Memória — tudo que você leu e viu"
        aria-label="Memória"
        aria-current={active === "memoria" ? "page" : undefined}
      >
        🧠
      </Link>
    </nav>
  );
}
