"use client";

import Link from "next/link";
import { useI18n } from "./I18nProvider";
import { PAYPAL_DONATE_URL, PIX_KEY, CONTACT_EMAIL } from "@/lib/donate";

/**
 * Rodapé do site (fase GRATUITA — pedido do Miguel, 2026-08-04):
 * em TODAS as páginas públicas, em todos os idiomas —
 *   doação (PayPal mundo · Pix Brasil) + Quem Somos + contato.
 * (Fora só do modo leitura imersivo do Reader — a página do livro é sagrada.)
 */
export function SiteFooter() {
  const { t } = useI18n();

  const copyPix = () => {
    if (PIX_KEY) navigator.clipboard?.writeText(PIX_KEY).catch(() => {});
  };

  return (
    <footer className="site-footer">
      <p className="site-footer-note">{t("footer_donate_note")}</p>
      <div className="site-footer-actions">
        <a
          className="site-footer-btn paypal"
          href={PAYPAL_DONATE_URL}
          target="_blank"
          rel="noreferrer"
        >
          {t("donate_paypal")}
        </a>
        {PIX_KEY && (
          <button className="site-footer-btn pix" onClick={copyPix}>
            {t("donate_pix")}
          </button>
        )}
      </div>
      <nav className="site-footer-links" aria-label="rodapé">
        <Link href="/sobre">{t("footer_about")}</Link>
        <span aria-hidden>·</span>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </nav>
      {/* Convite de feedback (pedido do Miguel, 05/08): bug/elogio/crítica
          em TODA parte — o app é experimental e o feedback corrige. */}
      <a
        className="site-footer-feedback"
        href={`mailto:${CONTACT_EMAIL}?subject=Moka%20%E2%80%94%20bug%2C%20elogio%20ou%20cr%C3%ADtica`}
      >
        {t("footer_feedback")}
      </a>
      {/* Selo do grupo (pedido do Miguel, 05/08): pequenininho, com link,
          em todas as páginas públicas — como nos 8 portais temáticos. */}
      <p className="site-footer-group">
        {t("footer_group")}{" "}
        <a
          href="https://cafezinhomediagroup.vercel.app/"
          target="_blank"
          rel="noreferrer"
        >
          Cafezinho Media Group
        </a>
      </p>
      <style jsx>{`
        .site-footer {
          margin-top: 28px;
          padding: 22px 16px 26px;
          border-top: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .site-footer-note {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
          max-width: 460px;
          line-height: 1.5;
        }
        .site-footer-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .site-footer-btn {
          display: inline-block;
          padding: 9px 18px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          border: 1px solid var(--border);
          transition: var(--transition);
        }
        .site-footer-btn.paypal {
          background: #003087;
          color: #fff;
          border-color: #003087;
        }
        .site-footer-btn.paypal:hover {
          background: #00256b;
        }
        .site-footer-btn.pix {
          background: #32bcad;
          color: #fff;
          border-color: #32bcad;
        }
        .site-footer-btn.pix:hover {
          background: #28a397;
        }
        .site-footer-links {
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 13px;
          color: var(--text-muted);
        }
        .site-footer-links a {
          color: var(--accent-dark);
          text-decoration: none;
        }
        .site-footer-links a:hover {
          text-decoration: underline;
        }
        .site-footer-feedback {
          display: inline-block;
          max-width: 460px;
          padding: 10px 16px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent-dark);
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.5;
          text-decoration: none;
          transition: var(--transition);
        }
        .site-footer-feedback:hover {
          filter: brightness(0.95);
          text-decoration: underline;
        }
        .site-footer-group {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          opacity: 0.85;
        }
        .site-footer-group a {
          color: inherit;
          text-decoration: none;
          border-bottom: 1px dotted currentColor;
        }
      `}</style>
    </footer>
  );
}
