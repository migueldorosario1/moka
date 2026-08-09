"use client";

import Link from "next/link";
import { useI18n } from "./I18nProvider";
import { PAYPAL_DONATE_URL, PIX_KEY, PIX_HOLDER, CONTACT_EMAIL } from "@/lib/donate";

/**
 * Rodapé do site (fase GRATUITA — pedido do Miguel, 2026-08-04):
 * em TODAS as páginas públicas, em todos os idiomas —
 *   doação (PayPal mundo · Pix Brasil) + Quem Somos + contato.
 * (Fora só do modo leitura imersivo do Reader — a página do livro é sagrada.)
 */
export function SiteFooter() {
  const { t } = useI18n();

  const copyPix = () => {
    if (!PIX_KEY) return;
    // Confirmação visível: é doação — a pessoa precisa saber o que copiou.
    navigator.clipboard?.writeText(PIX_KEY).then(() => {
      alert(`PIX copiado!\n\nChave: ${PIX_KEY}\nNome: ${PIX_HOLDER}`);
    }).catch(() => {
      alert(`PIX: ${PIX_KEY}\nNome: ${PIX_HOLDER}`);
    });
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
      {/* Convite de feedback (pedido do Miguel, 05/08; ordem 09/08: elogio
          PRIMEIRO): elogio/sugestão/crítica/bug em TODA parte — o feedback
          melhora o app. */}
      <a
        className="site-footer-feedback"
        href={`mailto:${CONTACT_EMAIL}?subject=Moka%20%E2%80%94%20elogio%2C%20sugest%C3%A3o%2C%20cr%C3%ADtica%20ou%20bug`}
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
      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </footer>
  );
}
