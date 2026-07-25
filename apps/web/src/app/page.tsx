"use client";

import { useEffect, useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { ContaButton } from "@/components/ContaButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { listLibrary } from "@/lib/repository";
import type { Session } from "@/lib/db";

/**
 * CAPA V3 (espelho — pedido do Miguel 23/07): a home VENDE.
 * Ordem: oferta R$5 grande → vídeo do anúncio explicando → preços.
 * O checkout R$5 aponta pro funil real (Pix na API de pontos).
 */
// (a compra agora é interna: /experimente — doc 15)
const VIDEO_URL =
  "https://pub-7c53d388419e4d44b17eace540ae7e22.r2.dev/moka/anuncio/moka_anuncio_bbc.mp4";

export default function Capa() {
  const { t } = useI18n();
  const [last, setLast] = useState<Session | null>(null);

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
    <main className="igot-shell ft">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <div className="brand" title="Moka — livros e vídeos">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </div>
        </div>
        <div className="igot-topbar-actions">
          <ContaButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body">
        <p className="capa-kicker">O Cafezinho apresenta</p>
        <div className="capa-logo">Moka</div>
        <h1 className="capa-tagline">{t("app_tagline")}</h1>

        {/* ── V3: os 2 caminhos — pontos (IA da casa) × licença (BYOK) ── */}
        <div className="capa-paths">
          <a className="capa-path" href="/experimente">
            <b>{t("capa_path_points_title")}</b>
            <span>{t("capa_path_points_desc")}</span>
          </a>
          <a className="capa-path" href="/experimente?plano=avancado">
            <b>{t("capa_path_adv_title")}</b>
            <span>{t("capa_path_adv_desc")}</span>
          </a>
        </div>

        {/* ── Vídeo do anúncio: explica o que é ── */}
        <h2 className="capa-video-title">{t("capa_video_title")}</h2>
        <video
          className="capa-video"
          src={VIDEO_URL}
          controls
          playsInline
          preload="metadata"
        />

        {/* ── O que os pontos compram (equivalências honestas) ── */}
        <h2 className="capa-plans-title">{t("capa_how_title")}</h2>
        <div className="capa-plans-rule" />
        <div className="capa-plans">
          <div className="capa-plan">
            <b>🎬 30 pts</b>
            <span className="desc">1 {t("exp_videos")} (resumo)</span>
          </div>
          <div className="capa-plan">
            <b>📖 40 pts</b>
            <span className="desc">1 {t("exp_books")} (resumo)</span>
          </div>
          <div className="capa-plan">
            <b>🌍 80 pts</b>
            <span className="desc">1 {t("exp_translations")} (livro inteiro)</span>
          </div>
          <div className="capa-plan">
            <b>🎧 40 pts</b>
            <span className="desc">1 {t("exp_audios")} (10 min)</span>
          </div>
        </div>
        <p className="capa-plans-note">{t("capa_plans_note")}</p>

        {/* ── Entradas do app ── */}
        <div className="capa-cards">
          <a className="capa-card" href="/estante">
            <b>📖 {t("capa_shelf_books")}</b>
            <span>{t("capa_books_desc")}</span>
          </a>
          <a className="capa-card" href="/video">
            <b>🎬 {t("capa_shelf_videos")}</b>
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
        /* ─── Porcelana, Café & Cobre (Refinado FT Editorial) ─────────────
           Legibilidade sagrada: fundo claro porcelana, texto espresso profundo,
           acentos em cobre queimado, crema e teal editorial. ─── */
        .ft {
          --ft-paper: #faf8f5;
          --ft-paper-warm: #f6efe3;
          --ft-paper-deep: #eee3d1;
          --ft-surface: #fffcf5;
          --ft-ink: #2b2015;
          --ft-ink-soft: #7c6856;
          --ft-hairline: #e3d6c1;
          --ft-hairline-soft: #ede3d2;
          --ft-teal: #0f7680;
          --ft-copper: #a35d2f;
          --ft-copper-dark: #7e4522;
          --ft-crema: #f3e4d0;
          --ft-gold: #c2955c;

          background: linear-gradient(180deg, var(--ft-paper) 0%, var(--ft-paper-warm) 100%);
          color: var(--ft-ink);
          min-height: 100vh;
        }
        .ft :global(.igot-topbar) {
          background: rgba(250, 248, 245, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--ft-hairline-soft);
          box-shadow: 0 1px 4px rgba(43, 32, 21, 0.03);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .capa-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 48px 24px 80px;
          max-width: 900px;
          margin: 0 auto;
        }
        .capa-kicker {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 11px;
          font-weight: 700;
          color: var(--ft-copper);
          background: var(--ft-crema);
          border: 1px solid rgba(163, 93, 47, 0.2);
          padding: 4px 14px;
          border-radius: 999px;
          margin: 0 0 14px;
        }
        .capa-logo {
          font-family: var(--font-brand);
          font-size: clamp(54px, 8vw, 76px);
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--ft-ink);
          line-height: 1;
          margin-bottom: 12px;
        }
        .capa-tagline {
          font-family: var(--font-brand);
          font-size: clamp(21px, 3.4vw, 30px);
          font-weight: 500;
          color: var(--ft-ink);
          margin: 0 0 38px;
          max-width: 620px;
          line-height: 1.28;
        }

        /* ── Os 2 Caminhos (Cards principais) ── */
        .capa-paths {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 48px;
          width: 100%;
          max-width: 720px;
        }
        .capa-path {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
          min-width: 280px;
          max-width: 340px;
          padding: 28px 24px;
          text-decoration: none;
          color: var(--ft-ink);
          background: var(--ft-surface);
          border: 1px solid var(--ft-hairline);
          border-radius: 14px;
          box-shadow: 0 2px 8px rgba(43, 32, 21, 0.04);
          transition: all 0.2s cubic-bezier(0.25, 0.6, 0.3, 1);
          text-align: left;
          position: relative;
          overflow: hidden;
        }
        .capa-path::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--ft-copper), var(--ft-gold));
          opacity: 0.8;
        }
        .capa-path:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(43, 32, 21, 0.08);
          border-color: var(--ft-copper);
          background: #fff;
        }
        .capa-path b {
          font-family: var(--font-brand);
          font-size: 21px;
          font-weight: 600;
          color: var(--ft-ink);
        }
        .capa-path span {
          color: var(--ft-ink-soft);
          font-size: 14px;
          line-height: 1.55;
        }

        /* ── Vídeo do anúncio ── */
        .capa-video-title {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 24px;
          color: var(--ft-ink);
          margin: 0 0 16px;
        }
        .capa-video {
          width: min(680px, 94vw);
          aspect-ratio: 16 / 9;
          background: #1c1510;
          border: 1px solid var(--ft-hairline);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(43, 32, 21, 0.12);
          margin-bottom: 54px;
          overflow: hidden;
        }

        /* ── Planos e Equivalências ── */
        .capa-plans-title {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 24px;
          color: var(--ft-ink);
          margin: 0 0 8px;
        }
        .capa-plans-rule {
          width: 50px;
          height: 2px;
          background: linear-gradient(90deg, var(--ft-copper), var(--ft-gold));
          margin-bottom: 24px;
          border-radius: 2px;
        }
        .capa-plans {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          width: 100%;
          max-width: 800px;
          margin-bottom: 24px;
        }
        .capa-plan {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 24px 20px;
          background: var(--ft-surface);
          border: 1px solid var(--ft-hairline);
          border-radius: 12px;
          text-decoration: none;
          color: var(--ft-ink);
          text-align: center;
          box-shadow: 0 2px 6px rgba(43, 32, 21, 0.03);
          transition: all 0.18s ease;
        }
        .capa-plan:hover {
          transform: translateY(-2px);
          border-color: var(--ft-copper);
          box-shadow: 0 6px 18px rgba(43, 32, 21, 0.07);
          background: #fff;
        }
        .capa-plan b {
          font-family: var(--font-brand);
          font-size: 20px;
          font-weight: 600;
          color: var(--ft-ink);
        }
        .capa-plan .desc {
          color: var(--ft-ink-soft);
          font-size: 13.5px;
          line-height: 1.5;
        }
        .capa-plans-note {
          color: var(--ft-ink-soft);
          font-size: 13px;
          margin: 0 0 44px;
        }

        /* ── Cards de Entrada (Estante / Vídeo) ── */
        .capa-cards {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          width: 100%;
          max-width: 600px;
          margin-bottom: 30px;
        }
        .capa-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          min-width: 240px;
          padding: 22px 20px;
          background: var(--ft-surface);
          border: 1px solid var(--ft-hairline);
          border-radius: 12px;
          text-decoration: none;
          color: var(--ft-ink);
          text-align: left;
          box-shadow: 0 2px 6px rgba(43, 32, 21, 0.03);
          transition: all 0.18s ease;
        }
        .capa-card:hover {
          background: #fff;
          border-color: var(--ft-copper);
          box-shadow: 0 6px 18px rgba(43, 32, 21, 0.07);
          transform: translateY(-2px);
        }
        .capa-card b {
          font-family: var(--font-brand);
          font-size: 18px;
          font-weight: 600;
          color: var(--ft-ink);
        }
        .capa-card span {
          color: var(--ft-ink-soft);
          font-size: 13.5px;
          line-height: 1.5;
        }

        /* ── Botões de Ação Final ── */
        .capa-continue {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          padding: 14px 28px;
          background: linear-gradient(135deg, var(--ft-ink) 0%, #1a1410 100%);
          color: var(--ft-surface);
          text-decoration: none;
          font-size: 14.5px;
          font-weight: 500;
          border-radius: 999px;
          box-shadow: 0 4px 14px rgba(43, 32, 21, 0.15);
          transition: all 0.18s ease;
          max-width: 90vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .capa-continue:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(43, 32, 21, 0.22);
          background: var(--ft-copper-dark);
        }
        .capa-shelf {
          color: var(--ft-teal);
          text-decoration: none;
          font-weight: 700;
          font-size: 14.5px;
          margin-bottom: 38px;
          padding: 6px 16px;
          border: 1px solid rgba(15, 118, 128, 0.25);
          border-radius: 8px;
          transition: all 0.15s ease;
          background: rgba(15, 118, 128, 0.04);
        }
        .capa-shelf:hover {
          color: var(--ft-ink);
          border-color: var(--ft-ink);
          background: rgba(43, 32, 21, 0.05);
        }
        .capa-footer {
          color: var(--ft-ink-soft);
          font-size: 12.5px;
          max-width: 480px;
          line-height: 1.6;
          border-top: 1px solid var(--ft-hairline-soft);
          padding-top: 22px;
          width: 100%;
        }
      `}</style>
    </main>
  );
}
