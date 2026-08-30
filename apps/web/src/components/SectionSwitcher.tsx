"use client";

import Link from "next/link";

/**
 * Seletor de seções do Moka unificado — A FAMÍLIA COMPLETA (obra MOKA).
 *
 * 📖 Reader (livros) · 🎬 Vídeo · 🧠 Memória · 💬 Harness · ✍️ Writer
 *
 * Ordem do Miguel (30/08 ~15h): "ícones grandes" de reader, vídeo, memória,
 * harness e writer, todos do lado — botões GRANDES por natureza (DSC-019).
 */
export type SectionKey = "reader" | "video" | "memoria" | "harness" | "writer";

const SECTIONS: Array<{ key: SectionKey; href: string; icon: string; title: string; label: string }> = [
  { key: "reader", href: "/estante", icon: "📖", title: "Moka Reader — seus livros", label: "Livros" },
  { key: "video", href: "/video", icon: "🎬", title: "Moka Video — leia vídeos", label: "Vídeos" },
  { key: "memoria", href: "/memoria", icon: "🧠", title: "Moka Memória — tudo que você leu e viu", label: "Memória" },
  { key: "harness", href: "/harness", icon: "💬", title: "Moka Harness — converse com sua memória", label: "Harness" },
  { key: "writer", href: "/writer", icon: "✍️", title: "Moka Writer — seu estúdio de escrever", label: "Writer" },
];

export function SectionSwitcher({ active }: { active: SectionKey }) {
  return (
    <nav className="section-switch" aria-label="Seções do Moka">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`section-switch-btn ${active === s.key ? "active" : ""}`}
          title={s.title}
          aria-label={s.label}
          aria-current={active === s.key ? "page" : undefined}
        >
          {s.icon}
        </Link>
      ))}
    </nav>
  );
}
