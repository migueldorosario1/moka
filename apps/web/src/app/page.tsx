"use client";

import { useEffect, useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { CloseAppButton } from "@/components/CloseAppButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { listLibrary } from "@/lib/repository";
import type { Session } from "@/lib/db";

/**
 * CAPA do Moka (V2.6 — pedido do Miguel 23/07): a home é uma página de
 * boas-vindas que EXPLICA o que é o app — não a estante. A estante virou
 * link (/estante) e o último lido aparece como atalho "continuar lendo".
 */
export default function Capa() {
  const { t } = useI18n();
  const [last, setLast] = useState<Session | null>(null);

  // Último livro lido (atalho "continuar lendo" — best-effort, local).
  useEffect(() => {
    listLibrary(null)
      .then((list) => {
        if (list.length > 0) {
          setLast(
            list.reduce((a, b) => ((b.savedAt ?? 0) > (a.savedAt ?? 0) ? b : a)),
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <main className="igot-shell">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <div className="brand" title="Moka — livros e vídeos">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </div>
        </div>
        <div className="igot-topbar-actions">
          <CloseAppButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body">
        <div className="capa-logo">Moka</div>
        <h1 className="capa-tagline">{t("app_tagline")}</h1>
        <p className="capa-sub">{t("capa_hero_sub")}</p>

        <div className="capa-cards">
          <a className="capa-card" href="/estante">
            <b>{t("capa_books_title")}</b>
            <span>{t("capa_books_desc")}</span>
          </a>
          <a className="capa-card" href="/video">
            <b>{t("capa_videos_title")}</b>
            <span>{t("capa_videos_desc")}</span>
          </a>
        </div>

        {last && (
          <a className="capa-continue" href={`/book/${last.id}`}>
            ▶ {t("capa_continue")}: <b>{last.book.title}</b>
          </a>
        )}

        <a className="capa-shelf" href="/estante">
          📚 {t("capa_shelf")}
        </a>

        <p className="capa-footer">{t("capa_footer")}</p>
      </div>

      <style jsx>{`
        .capa-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px 64px;
        }
        .capa-logo {
          font-family: var(--font-sans);
          font-size: 64px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--accent-dark);
          line-height: 1;
          margin-bottom: 10px;
        }
        .capa-tagline {
          font-family: var(--font-sans);
          font-size: clamp(20px, 3.4vw, 30px);
          font-weight: 800;
          color: var(--text);
          margin: 0 0 12px;
        }
        .capa-sub {
          color: var(--text-muted);
          max-width: 520px;
          margin: 0 0 36px;
          font-size: 16px;
          line-height: 1.55;
        }
        .capa-cards {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 26px;
        }
        .capa-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 264px;
          padding: 24px 22px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          text-decoration: none;
          color: var(--text);
          box-shadow: var(--shadow-sm);
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .capa-card:hover {
          transform: translateY(-3px);
          border-color: var(--gold);
        }
        .capa-card b {
          font-size: 19px;
          font-weight: 800;
        }
        .capa-card span {
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .capa-continue {
          display: inline-block;
          margin-bottom: 14px;
          padding: 13px 24px;
          border-radius: var(--radius-pill);
          background: linear-gradient(180deg, var(--accent), var(--accent-dark));
          color: #fff8ee;
          text-decoration: none;
          font-size: 15px;
          box-shadow: var(--shadow-sm);
          max-width: 90vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .capa-shelf {
          color: var(--accent-dark);
          text-decoration: none;
          font-weight: 700;
          margin-bottom: 34px;
        }
        .capa-shelf:hover {
          text-decoration: underline;
        }
        .capa-footer {
          color: var(--text-muted);
          font-size: 13px;
          max-width: 460px;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}
