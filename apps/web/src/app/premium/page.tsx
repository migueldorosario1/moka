"use client";

import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { LlmPriceRanking } from "@/components/LlmPriceRanking";
import { useI18n } from "@/components/I18nProvider";

/**
 * /premium — FASE GRATUITA (pivô 2026-08-04): antes era a vitrine de
 * assinatura (café tiers). Agora é a página de CUSTOS: o 🏆 Ranking de
 * Preços das IAs — quanto custa usar cada IA com a SUA chave (BYOK).
 * A vitrine antiga está preservada (backup local + tag pré-pivô).
 */
export default function PremiumPage() {
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
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body" style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ textAlign: "center", color: "var(--text-muted)", margin: "0 0 4px" }}>
          🆓 {t("free_title")}
        </p>
        <LlmPriceRanking />
      </div>

      <SiteFooter />
    </main>
  );
}
