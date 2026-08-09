"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter } from "@/components/SiteFooter";
import { LlmPriceRanking } from "@/components/LlmPriceRanking";
import { SettingsForm } from "@/components/SettingsForm";
import { A11yControls } from "@/components/A11yControls";
import { useI18n } from "@/components/I18nProvider";
import type { AIConfig } from "@igot/ai-providers";
import {
  getConfigSync,
  loadConfigCache,
  invalidateConfigCache,
  hasConfig,
} from "@/lib/config";

/**
 * /configuracoes — a "casa" das chaves de IA do usuário (pedido do Miguel,
 * 2026-08-09). Antes era um pop-up (SettingsModal) que vivia dentro de cada
 * página — confuso e com bug de "menu some ao fechar". Agora é uma PÁGINA
 * própria, larga e respirável, onde o usuário:
 *   - vê TODAS as suas chaves cadastradas (lista, com ativar/testar/editar/remover);
 *   - adiciona quantas quiser (de provedores diferentes) e escolhe qual está em uso;
 *   - confere o ranking de preço e qualidade das IAs (componente LlmPriceRanking);
 *   - configura idioma da interface, tradução e fala.
 *
 * Reusa o <SettingsForm> (que já tem tudo: campo de chave, olhinho 👁, botão
 * Atualizar, lista de entries, seção de vídeo/Whisper). O ganho é o PALCO:
 * página larga (não 560px de modal) + ranking integrado + sem pop-up.
 */
export default function ConfiguracoesPage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [configReady, setConfigReady] = useState(false);

  // Lê a config FRESCA no boot da página (descriptografa o cofre).
  useEffect(() => {
    invalidateConfigCache();
    loadConfigCache().then(() => {
      setConfig(getConfigSync());
      setConfigReady(hasConfig());
    });
  }, []);

  // Quando salva uma chave, recarrega o cache e o estado "pronto".
  const handleSaved = () => {
    invalidateConfigCache();
    loadConfigCache().then(() => {
      setConfig(getConfigSync());
      setConfigReady(hasConfig());
    });
  };

  return (
    <main className="igot-shell">
      {/* TopBar — mesmo padrão das páginas-ferramenta, sem engrenagem
          (a própria página É a configuração). */}
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <Link href="/estante" className="brand" title="Voltar à estante">
            <CafezinhoLogo size={26} opacity={0.85} /> <span>Moka</span>
          </Link>
          <span className="cfg-topbar-label">⚙️ {t("settings")}</span>
        </div>
        <div className="igot-topbar-actions">
          <AuthGate />
          <LangSwitcher />
        </div>
      </div>

      {/* Corpo largo e respirável */}
      <div className="cfg-body">
        <div className="cfg-container">
          <header className="cfg-header">
            <h1 className="cfg-title">⚙️ {t("cfg_page_title")}</h1>
            <p className="cfg-intro">{t("cfg_intro")}</p>
          </header>

          {/* ♿ Acessibilidade — tema (claro/escuro/contraste/sépia) + tamanho
              de fonte da interface. Pedido do Miguel 09/08. */}
          <A11yControls />

          <section className="cfg-section">
            <h2 className="cfg-section-title">{t("cfg_keys_section")}</h2>
            <SettingsForm initial={config} onSaved={handleSaved} />
          </section>

          <section className="cfg-section">
            <h2 className="cfg-section-title">{t("cfg_ranking_section")}</h2>
            <LlmPriceRanking />
          </section>
        </div>
      </div>

      <SiteFooter />

      <style jsx>{`
        .cfg-topbar-label {
          font-family: var(--font-brand);
          font-size: 15px;
          font-weight: 600;
          color: var(--text-muted);
          margin-left: 4px;
        }
        .cfg-body {
          flex: 1;
          overflow-y: auto;
          background: var(--bg);
        }
        .cfg-container {
          max-width: 760px;
          margin: 0 auto;
          padding: 28px 20px 40px;
        }
        .cfg-header {
          margin-bottom: 24px;
        }
        .cfg-title {
          font-family: var(--font-brand);
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 10px;
          color: var(--text);
        }
        .cfg-intro {
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-muted);
          margin: 0;
          max-width: 640px;
        }
        .cfg-section {
          margin-bottom: 32px;
        }
        .cfg-section-title {
          font-family: var(--font-brand);
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 14px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-soft);
          color: var(--text);
        }
        @media (max-width: 600px) {
          .cfg-container {
            padding: 18px 14px 32px;
          }
          .cfg-title {
            font-size: 22px;
          }
          .cfg-intro {
            font-size: 14px;
          }
        }
      `}</style>
    </main>
  );
}
