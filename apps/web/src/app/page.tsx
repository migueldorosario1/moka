"use client";

import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { AuthGate } from "@/components/AuthGate";
import { useI18n } from "@/components/I18nProvider";

/**
 * CAPA — fase GRATUITA (pivô do Miguel, 2026-08-04):
 * nada de preços/pontos — o Moka é grátis e roda com a chave de IA do
 * próprio usuário (BYOK). Rodapé com doação + Quem Somos + contato.
 * Login Google em DESTAQUE: é o que faz a biblioteca syncar entre
 * aparelhos (e cria o vínculo com o leitor — pedido do Miguel).
 * (A versão de vendas com pontos está no backup pré-pivô / tag
 * `pre-pivot-pago-v4.3` — volta na Fase 2.)
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
          {/* QA-CHANGE (Kimi 3, 2026-08-05): "Quem somos" saiu das Configurações
              e veio para o início da página (pedido do Miguel) — link direto /sobre */}
          <Link href="/sobre" className="topbar-about" title="Quem somos — Saiba mais">
            👥 {t("nav_about")}
          </Link>
          <AuthGate />
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body">
        <p className="capa-kicker">{t("capa_kicker")}</p>
        <div className="capa-logo">MOKA</div>
        <h1 className="capa-tagline">{t("app_tagline")}</h1>

        {/* ── FASE GRATUITA: BYOK é o único caminho (e é grátis) ── */}
        <div className="capa-paths">
          <Link className="capa-path" href="/estante">
            <b>🆓 {t("free_title")}</b>
            <span>{t("free_desc")}</span>
          </Link>
          <Link className="capa-path" href="/tutorial">
            <b>🔑 {t("byok_get_key")}</b>
            <span>{t("byok_cost")}</span>
          </Link>
        </div>

        {/* Login Google = biblioteca em qualquer aparelho (pedido do Miguel) */}
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {t("capa_login_benefit")}
        </p>

        {/* ── Ilustração Editorial de Destaque ── */}
        <img
          className="capa-hero-img"
          src="/moka_hero_editorial.png"
          alt="Moka — Inteligência de Leitura e Vídeos"
        />

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

        <p className="capa-footer">{t("byok_video_note")}</p>
      </div>

      <SiteFooter />
    </main>
  );
}
