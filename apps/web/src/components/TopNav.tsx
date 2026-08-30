"use client";

/**
 * TopNav — o MENU PADRONIZADO da família Moka (obra, ordem do Miguel
 * 30/08 ~17h: "menus grandes no alto, padronizados, TODAS as páginas do
 * mesmo tamanho, e sempre com o OLHINHO pra deixar o menu invisível —
 * no celular o menu tem que ser bem grande").
 *
 * - Mesma barra em todas as páginas: marca + 5 ícones GRANDES + olhinho
 *   + bandeira + engrenagem (slot `right` pra extras da página).
 * - 👁 esconde o menu inteiro (modo leitura limpa — só o olhinho fica,
 *   pra trazer de volta). Preferência salva no aparelho.
 * - Mobile: ícones ainda maiores.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CafezinhoLogo } from "./CafezinhoLogo";
import { LangSwitcher } from "./LangSwitcher";
import { SectionSwitcher, type SectionKey } from "./SectionSwitcher";
import { useI18n } from "./I18nProvider";

const HIDDEN_KEY = "moka.navHidden";

export function TopNav({
  active,
  right,
}: {
  /** Seção ativa (a capa não marca nenhuma). */
  active?: SectionKey;
  /** Extras da página (engrenagem c/ estado, telemetria etc.). */
  right?: ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch { /* sem storage */ }
  }, []);

  const toggle = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
      } catch { /* sem storage */ }
      return next;
    });
  }, []);

  if (hidden) {
    return (
      <div className="topnav topnav-hidden" role="navigation" aria-label={t("sec_nav")}>
        <button
          className="topnav-eye"
          onClick={toggle}
          title={t("nav_show")}
          aria-label={t("nav_show")}
          aria-expanded={false}
        >
          👁️
        </button>
      </div>
    );
  }

  return (
    <div className="topnav" role="navigation" aria-label={t("sec_nav")}>
      <div className="igot-topbar-left">
        <Link href="/" className="brand" title="Moka">
          <CafezinhoLogo size={26} opacity={0.85} /> <span>Moka</span>
        </Link>
        <SectionSwitcher active={active} />
      </div>
      <div className="igot-topbar-actions">
        <button
          className="topnav-eye"
          onClick={toggle}
          title={t("nav_hide")}
          aria-label={t("nav_hide")}
          aria-expanded
        >
          👁️
        </button>
        {right ?? (
          <>
            <LangSwitcher />
            <button
              className="gear"
              onClick={() => router.push("/configuracoes")}
              aria-label={t("settings")}
              title={t("settings")}
            >
              ⚙️
            </button>
          </>
        )}
      </div>
    </div>
  );
}
