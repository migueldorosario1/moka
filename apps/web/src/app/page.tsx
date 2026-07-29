"use client";

import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { ContaButton } from "@/components/ContaButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";

/**
 * CAPA V3 (espelho — pedido do Miguel 23/07): a home VENDE.
 * Ordem: oferta R$5 grande → vídeo do anúncio explicando → preços.
 * O checkout R$5 aponta pro funil real (Pix na API de pontos).
 */
export default function Capa() {
  const { t } = useI18n();

  return (
    <main className="igot-shell ft">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <Link href="/" className="brand" title="MOKA — Ir para página central">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>MOKA</span>
          </Link>
        </div>
        <div className="igot-topbar-actions">
          <ContaButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body">
        <p className="capa-kicker">{t("capa_kicker")}</p>
        <div className="capa-logo">MOKA</div>
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

        {/* Teste R$5 — SEMPRE visível onde há oferta (regra do Miguel, 29/07) */}
        <a className="capa-test-link" href="/experimente?modo=teste">
          🎣 {t("capa_test_link")}
        </a>

        {/* ── Ilustração Editorial de Destaque ── */}
        <img
          className="capa-hero-img"
          src="/moka_hero_editorial.png"
          alt="Moka — Inteligência de Leitura e Vídeos"
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

        {/* ── Entradas do app (Estante & Videoteca) ── */}
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

        <p className="capa-footer">{t("capa_footer")}</p>
      </div>

    </main>
  );
}
