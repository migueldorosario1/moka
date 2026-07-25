"use client";

import { useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { ContaButton } from "@/components/ContaButton";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";

/**
 * /experimente — compra de pontos do V3 (doc 15).
 * Valor livre (mínimo R$40 = 400 pts), estimativa viva, Pix na hora via
 * API de pontos (Tencent). Mesma estética FT-sofisticada da capa.
 */
const API = "https://43.156.151.165.sslip.io";
const TAXA = 0.1; // R$ por ponto (doc 15, opção A)

type Etapa = "form" | "pix" | "ok";

export default function Experimente() {
  const { t } = useI18n();
  const [pontos, setPontos] = useState(400);
  const [etapa, setEtapa] = useState<Etapa>("form");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [pix, setPix] = useState<{
    compra_id: number; qr_code: string; qr_code_base64: string;
    ticket_url: string; senha_inicial: string | null; pontos: number;
  } | null>(null);
  const [copiou, setCopiou] = useState(false);

  const preco = (pontos * TAXA).toFixed(2).replace(".", ",");
  const estimativa = [
    `${Math.floor(pontos / 30)} ${t("exp_videos")}`,
    `${Math.floor(pontos / 40)} ${t("exp_books")}`,
    `${Math.floor(pontos / 80)} ${t("exp_translations")}`,
  ].join(" · ");

  async function gerarPix(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setGerando(true);
    try {
      const r = await fetch(`${API}/compras/criar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), nome: nome.trim(), pontos_custom: pontos }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "erro ao gerar o Pix");
      setPix(d);
      setEtapa("pix");
      // polling até confirmar (webhook + reconciliação no servidor)
      const timer = setInterval(async () => {
        try {
          const s = await fetch(
            `${API}/compras/status?compra_id=${d.compra_id}&email=${encodeURIComponent(email.trim())}`,
          );
          const sd = await s.json();
          if (sd.status === "pago") {
            clearInterval(timer);
            setEtapa("ok");
          }
        } catch { /* próximo ciclo */ }
      }, 4000);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setGerando(false);
    }
  }

  return (
    <main className="exp">
      <div className="igot-topbar exp-topbar">
        <div className="igot-topbar-left">
          <a className="brand" href="/">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </a>
        </div>
        <div className="igot-topbar-actions">
          <ContaButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="exp-body">
        <p className="exp-kicker">Moka</p>
        <h1 className="exp-title">{t("capa_path_points_title")}</h1>
        <p className="exp-sub">{t("exp_sub")}</p>

        {etapa === "form" && (
          <form className="exp-form" onSubmit={gerarPix}>
            <label className="exp-label">{t("exp_howmuch")}</label>
            <div className="exp-slider-row">
              <input
                type="range" min={400} max={10000} step={100} value={pontos}
                onChange={(e) => setPontos(parseInt(e.target.value, 10))}
              />
              <div className="exp-pontos">{pontos.toLocaleString("pt-BR")} pts</div>
            </div>
            <div className="exp-preco">R$ {preco}</div>
            <div className="exp-estimativa">≈ {estimativa}</div>

            <input
              type="email" required placeholder={t("exp_email")}
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="text" required placeholder={t("exp_name")}
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
            <button className="exp-cta" type="submit" disabled={gerando}>
              {gerando ? t("exp_generating") : t("exp_button")}
            </button>
            {erro && <p className="exp-erro">⚠️ {erro}</p>}
          </form>
        )}

        {etapa === "pix" && pix && (
          <div className="exp-pix">
            <p className="exp-pix-title">{t("exp_pix_title")}</p>
            <textarea className="exp-cola" readOnly rows={3} value={pix.qr_code} />
            <button
              className="exp-cta"
              onClick={async () => {
                await navigator.clipboard.writeText(pix.qr_code);
                setCopiou(true);
              }}
            >
              {copiou ? t("exp_copied") : t("exp_copy")}
            </button>
            {pix.qr_code_base64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="exp-qr" src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code Pix" />
            )}
            {pix.ticket_url && (
              <a className="exp-link" href={pix.ticket_url} target="_blank" rel="noreferrer">
                abrir a página oficial do pagamento ↗
              </a>
            )}
            <p className="exp-aguardando">{t("exp_waiting")}</p>
          </div>
        )}

        {etapa === "ok" && pix && (
          <div className="exp-ok">
            <h2>{t("exp_success")}</h2>
            <p>{t("exp_success_pts", { n: pix.pontos })}</p>
            {pix.senha_inicial && (
              <>
                <p className="exp-sub">{t("exp_password")}</p>
                <div className="exp-senha">{pix.senha_inicial}</div>
              </>
            )}
            <a className="exp-cta exp-cta-link" href={`${API}/painel`} target="_blank" rel="noreferrer">
              {t("exp_panel")}
            </a>
          </div>
        )}
      </div>

      <style jsx>{`
        .exp { min-height: 100vh; background: #fff6ee; color: #1a1a1a; }
        .exp-topbar { background: #fff6ee; border-bottom: 1px solid #d9c8b8; }
        .exp-body {
          max-width: 520px; margin: 0 auto; padding: 44px 22px 64px;
          display: flex; flex-direction: column; align-items: center; text-align: center;
        }
        .exp-kicker {
          text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px;
          font-weight: 700; color: #0f7680; margin-bottom: 10px;
        }
        .exp-title { font-family: var(--font-brand); font-weight: 600; font-size: 30px; margin: 0 0 10px; }
        .exp-sub { color: #66605a; font-size: 14.5px; line-height: 1.55; margin-bottom: 26px; }
        .exp-form { display: flex; flex-direction: column; gap: 12px; width: 100%; }
        .exp-label { font-size: 13px; font-weight: 700; text-align: left; }
        .exp-slider-row { display: flex; align-items: center; gap: 14px; }
        .exp-slider-row input[type="range"] { flex: 1; accent-color: #0f7680; }
        .exp-pontos { font-weight: 800; font-variant-numeric: tabular-nums; }
        .exp-preco { font-family: var(--font-brand); font-size: 44px; font-weight: 600; }
        .exp-estimativa { color: #66605a; font-size: 13px; margin-bottom: 8px; }
        .exp-form input {
          padding: 13px 14px; border: 1px solid #d9c8b8; background: #fff;
          font-size: 15px; color: #1a1a1a; border-radius: 2px;
        }
        .exp-cta {
          background: #1a1a1a; color: #fff; border: none; padding: 15px;
          text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
          font-size: 13px; cursor: pointer; border-radius: 2px;
        }
        .exp-cta:disabled { opacity: 0.6; cursor: wait; }
        .exp-erro { color: #b3261e; font-size: 13.5px; }
        .exp-pix { display: flex; flex-direction: column; gap: 12px; width: 100%; align-items: center; }
        .exp-pix-title { font-weight: 700; font-size: 15px; }
        .exp-cola {
          width: 100%; font-size: 12px; padding: 12px; border: 1px solid #d9c8b8;
          background: #fff; color: #1a1a1a; resize: none; border-radius: 2px;
        }
        .exp-qr { width: 200px; height: 200px; border: 1px solid #d9c8b8; }
        .exp-link { color: #0f7680; font-size: 13px; }
        .exp-aguardando { color: #0f7680; font-weight: 700; font-size: 14px; }
        .exp-ok h2 { font-family: var(--font-brand); font-weight: 600; margin-bottom: 8px; }
        .exp-senha {
          font-size: 22px; font-weight: 800; background: #f7e7d7; border: 1px solid #1a1a1a;
          padding: 12px 18px; margin: 10px 0 18px; letter-spacing: 1px;
        }
        .exp-cta-link { display: inline-block; text-decoration: none; padding: 15px 30px; }
      `}</style>
    </main>
  );
}
