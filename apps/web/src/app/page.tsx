"use client";

import { useEffect, useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { CloseAppButton } from "@/components/CloseAppButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { listLibrary } from "@/lib/repository";
import type { Session } from "@/lib/db";

/**
 * CAPA V3 (espelho — pedido do Miguel 23/07): a home VENDE.
 * Ordem: oferta R$5 grande → vídeo do anúncio explicando → preços.
 * O checkout R$5 aponta pro funil real (Pix na API de pontos).
 */
const CHECKOUT_URL = "https://43.156.151.165.sslip.io/experimente";
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
          <CloseAppButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body">
        <p className="capa-kicker">O Cafezinho apresenta</p>
        <div className="capa-logo">Moka</div>
        <h1 className="capa-tagline">{t("app_tagline")}</h1>

        {/* ── OFERTA R$5 — bem grande, o coração da página ── */}
        <a className="capa-offer" href={CHECKOUT_URL} target="_blank" rel="noreferrer">
          <span className="capa-offer-badge">{t("capa_offer_badge")}</span>
          <span className="capa-offer-price">
            <small>R$</small> 5
          </span>
          <span className="capa-offer-desc">{t("capa_offer_desc")}</span>
          <span className="capa-offer-cta">{t("capa_offer_cta")}</span>
        </a>

        {/* ── Vídeo do anúncio: explica o que é ── */}
        <h2 className="capa-video-title">{t("capa_video_title")}</h2>
        <video
          className="capa-video"
          src={VIDEO_URL}
          controls
          playsInline
          preload="metadata"
        />

        {/* ── Preços: os 3 planos explicados ── */}
        <h2 className="capa-plans-title">{t("capa_plans_title")}</h2>
        <div className="capa-plans-rule" />
        <div className="capa-plans">
          <a className="capa-plan featured" href={CHECKOUT_URL} target="_blank" rel="noreferrer">
            <b>🎣 Teste</b>
            <span className="price">R$ 5</span>
            <span className="desc">{t("capa_plan_test_desc")}</span>
          </a>
          <div className="capa-plan">
            <b>⭐ Premium</b>
            <span className="price">R$ 24,90/mês</span>
            <span className="desc">{t("capa_plan_premium_desc")}</span>
            <span className="soon">{t("capa_plan_soon")}</span>
          </div>
          <div className="capa-plan">
            <b>🔑 BYOK</b>
            <span className="price">R$ 15/mês</span>
            <span className="desc">{t("capa_plan_byok_desc")}</span>
            <span className="soon">{t("capa_plan_soon")}</span>
          </div>
        </div>

        {/* ── Entradas do app ── */}
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
        /* ── Financial Times: papel salmão, tinta preta, serifa editorial,
              filetes finos, cantos retos. Elegância por subtração. ── */
        .ft {
          --ft-paper: #fff1e5;
          --ft-paper-deep: #f7e7d7;
          --ft-ink: #191919;
          --ft-ink-soft: #66605a;
          --ft-hairline: #d9c8b8;
          --ft-teal: #0f7680;
          background: var(--ft-paper);
          color: var(--ft-ink);
        }
        .ft :global(.igot-topbar) {
          background: var(--ft-paper);
          border-bottom: 1px solid var(--ft-hairline);
        }
        .capa-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 44px 24px 72px;
          background: var(--ft-paper);
        }
        .capa-kicker {
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 11px;
          font-weight: 700;
          color: var(--ft-teal);
          margin: 0 0 10px;
        }
        .capa-logo {
          font-family: var(--font-brand);
          font-size: 68px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--ft-ink);
          line-height: 1;
          margin-bottom: 8px;
        }
        .capa-tagline {
          font-family: var(--font-brand);
          font-size: clamp(21px, 3.4vw, 30px);
          font-weight: 500;
          color: var(--ft-ink);
          margin: 0 0 34px;
          max-width: 560px;
          line-height: 1.25;
        }

        /* ── Oferta R$5 — bloco editorial, sem grito ── */
        .capa-offer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          width: min(500px, 94vw);
          padding: 34px 30px 30px;
          margin-bottom: 40px;
          background: var(--ft-paper-deep);
          border: 1px solid var(--ft-ink);
          text-decoration: none;
          color: var(--ft-ink);
          position: relative;
        }
        .capa-offer:hover { background: #f5e0cb; }
        .capa-offer-badge {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 11px;
          font-weight: 700;
          color: var(--ft-teal);
        }
        .capa-offer-price {
          font-family: var(--font-brand);
          font-size: 88px;
          font-weight: 600;
          line-height: 1;
          color: var(--ft-ink);
        }
        .capa-offer-price small { font-size: 28px; font-weight: 500; }
        .capa-offer-desc {
          color: var(--ft-ink-soft);
          font-size: 15px;
          line-height: 1.55;
          max-width: 380px;
        }
        .capa-offer-cta {
          margin-top: 10px;
          background: var(--ft-ink);
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 700;
          font-size: 13px;
          padding: 15px 34px;
        }

        /* ── Vídeo ── */
        .capa-video-title {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 22px;
          color: var(--ft-ink);
          margin: 0 0 14px;
        }
        .capa-video {
          width: min(640px, 94vw);
          aspect-ratio: 16 / 9;
          background: #000;
          border: 1px solid var(--ft-ink);
          margin-bottom: 42px;
        }

        /* ── Planos ── */
        .capa-plans-title {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 22px;
          color: var(--ft-ink);
          margin: 0 0 6px;
        }
        .capa-plans-rule {
          width: 64px;
          height: 1px;
          background: var(--ft-ink);
          margin-bottom: 20px;
        }
        .capa-plans {
          display: flex;
          gap: 0;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 36px;
          border: 1px solid var(--ft-hairline);
          background: #fff;
        }
        .capa-plan {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 230px;
          padding: 22px 20px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--ft-hairline);
          text-decoration: none;
          color: var(--ft-ink);
          text-align: center;
        }
        .capa-plan:last-child { border-right: none; }
        .capa-plan b {
          font-family: var(--font-brand);
          font-size: 19px;
          font-weight: 600;
        }
        .capa-plan .price {
          font-family: var(--font-brand);
          color: var(--ft-ink);
          font-weight: 600;
          font-size: 17px;
        }
        .capa-plan .desc { color: var(--ft-ink-soft); font-size: 13px; line-height: 1.5; }
        .capa-plan.featured { background: var(--ft-paper); }
        .capa-plan .soon {
          align-self: center;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 10px;
          font-weight: 700;
          color: var(--ft-ink-soft);
          border: 1px solid var(--ft-hairline);
          padding: 3px 10px;
        }

        /* ── Cards de seção + estante + footer ── */
        .capa-cards {
          display: flex;
          gap: 0;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 26px;
          border: 1px solid var(--ft-hairline);
          background: #fff;
        }
        .capa-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 250px;
          padding: 20px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--ft-hairline);
          text-decoration: none;
          color: var(--ft-ink);
          transition: background 0.15s ease;
        }
        .capa-card:last-child { border-right: none; }
        .capa-card:hover { background: var(--ft-paper); }
        .capa-card b { font-family: var(--font-brand); font-size: 17px; font-weight: 600; }
        .capa-card span { color: var(--ft-ink-soft); font-size: 13px; line-height: 1.5; }
        .capa-continue {
          display: inline-block;
          margin-bottom: 14px;
          padding: 13px 26px;
          background: var(--ft-ink);
          color: #fff;
          text-decoration: none;
          font-size: 14px;
          max-width: 90vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .capa-shelf {
          color: var(--ft-teal);
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 34px;
          border-bottom: 1px solid var(--ft-teal);
          padding-bottom: 1px;
        }
        .capa-shelf:hover { color: var(--ft-ink); border-color: var(--ft-ink); }
        .capa-footer {
          color: var(--ft-ink-soft);
          font-size: 12.5px;
          max-width: 460px;
          line-height: 1.55;
          border-top: 1px solid var(--ft-hairline);
          padding-top: 18px;
        }
      `}</style>
    </main>
  );
}
