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
        .capa-body {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 36px 24px 64px;
        }
        .capa-logo {
          font-family: var(--font-sans);
          font-size: 56px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--accent-dark);
          line-height: 1;
          margin-bottom: 6px;
        }
        .capa-tagline {
          font-family: var(--font-sans);
          font-size: clamp(19px, 3.2vw, 27px);
          font-weight: 800;
          color: var(--text);
          margin: 0 0 26px;
        }

        /* ── Oferta R$5 em destaque ── */
        .capa-offer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: min(480px, 94vw);
          padding: 30px 26px 26px;
          margin-bottom: 34px;
          background: linear-gradient(160deg, var(--accent-soft), var(--surface));
          border: 2px solid var(--gold);
          border-radius: 22px;
          text-decoration: none;
          color: var(--text);
          box-shadow: 0 8px 30px rgba(255, 210, 0, 0.18);
          position: relative;
          transition: transform 0.15s ease;
        }
        .capa-offer:hover { transform: translateY(-3px); }
        .capa-offer-badge {
          position: absolute;
          top: -13px;
          background: var(--gold);
          color: #3a2c00;
          font-size: 12.5px;
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 999px;
        }
        .capa-offer-price {
          font-family: var(--font-sans);
          font-size: 72px;
          font-weight: 800;
          line-height: 1;
          color: var(--accent-dark);
        }
        .capa-offer-price small { font-size: 26px; font-weight: 700; }
        .capa-offer-desc {
          color: var(--text);
          font-size: 15px;
          line-height: 1.5;
          max-width: 380px;
        }
        .capa-offer-cta {
          margin-top: 8px;
          background: var(--gold);
          color: #3a2c00;
          font-weight: 800;
          font-size: 17px;
          padding: 13px 34px;
          border-radius: 999px;
        }

        /* ── Vídeo ── */
        .capa-video-title {
          font-family: var(--font-sans);
          font-weight: 800;
          font-size: 18px;
          color: var(--text);
          margin: 0 0 12px;
        }
        .capa-video {
          width: min(640px, 94vw);
          aspect-ratio: 16 / 9;
          background: #000;
          border-radius: 16px;
          box-shadow: var(--shadow-sm);
          margin-bottom: 36px;
        }

        /* ── Planos ── */
        .capa-plans-title {
          font-family: var(--font-sans);
          font-weight: 800;
          font-size: 18px;
          color: var(--text);
          margin: 0 0 14px;
        }
        .capa-plans {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 30px;
        }
        .capa-plan {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 210px;
          padding: 18px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          text-decoration: none;
          color: var(--text);
          text-align: center;
        }
        .capa-plan.featured { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
        .capa-plan b { font-size: 16px; font-weight: 800; }
        .capa-plan .price { color: var(--accent-dark); font-weight: 800; font-size: 15px; }
        .capa-plan .desc { color: var(--text-muted); font-size: 12.5px; line-height: 1.45; }
        .capa-plan .soon {
          align-self: center;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          border: 1px dashed var(--border);
          padding: 2px 10px;
          border-radius: 999px;
        }

        /* ── Cards de seção + estante + footer ── */
        .capa-cards {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 24px;
        }
        .capa-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 230px;
          padding: 18px 18px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          text-decoration: none;
          color: var(--text);
          box-shadow: var(--shadow-sm);
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .capa-card:hover { transform: translateY(-2px); border-color: var(--gold); }
        .capa-card b { font-size: 16px; font-weight: 800; }
        .capa-card span { color: var(--text-muted); font-size: 13px; line-height: 1.45; }
        .capa-continue {
          display: inline-block;
          margin-bottom: 12px;
          padding: 12px 22px;
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
          margin-bottom: 30px;
        }
        .capa-shelf:hover { text-decoration: underline; }
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
