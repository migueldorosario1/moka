/**
 * Doação + contato do Moka (fase GRATUITA — pivô 2026-08-04).
 * O app não cobra nada nesta fase: quem quiser apoiar, doa.
 * PayPal = mundo inteiro · Pix = Brasil.
 */

/** Link de doação PayPal (conta do Miguel — mesmo do botão antigo das ⚙️). */
export const PAYPAL_DONATE_URL =
  "https://www.paypal.com/cgi-bin/webscr?cmd=_donations" +
  "&business=migueldorosario%40gmail.com&item_name=Moka+Reader&currency_code=BRL";

/**
 * Chave Pix da doação (Brasil).
 * ⚠️ PENDENTE MIGUEL (04/08): qual chave Pix usar (e-mail, CNPJ ou aleatória)?
 * Enquanto vazia, o botão Pix fica ESCONDIDO e o rodapé mostra só PayPal.
 */
export const PIX_KEY = "";

/** E-mail de contato público (vai na capa e no rodapé). */
export const CONTACT_EMAIL = "info@mokareader.com";
