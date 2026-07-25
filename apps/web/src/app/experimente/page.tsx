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

type Modo = "pontos" | "teste" | "avancado";

const MODOS: Record<Modo, { titulo: string; preco: string; desc: string }> = {
  pontos: { titulo: "⚡ Pontos", preco: "", desc: "" },
  teste: {
    titulo: "🎣 Teste",
    preco: "R$ 5",
    desc: "200 pontos na hora, pra experimentar tudo — sem compromisso.",
  },
  avancado: {
    titulo: "💼 Licença avançada",
    preco: "R$ 50",
    desc: "6 meses usando a SUA chave de IA (BYOK), com painel de gastos.",
  },
};

export default function Experimente() {
  const { t } = useI18n();
  const [modo, setModo] = useState<Modo>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("plano") === "avancado"
      ? "avancado"
      : "pontos",
  );
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
      const corpo =
        modo === "teste"
          ? { email: email.trim(), nome: nome.trim(), pacote: "r5_200" }
          : modo === "avancado"
            ? { email: email.trim(), nome: nome.trim(), pacote: "avancado_6m" }
            : { email: email.trim(), nome: nome.trim(), pontos_custom: pontos };
      const r = await fetch(`${API}/compras/criar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
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
            <div className="exp-modos">
              {(["pontos", "teste", "avancado"] as Modo[]).map((m) => (
                <button
                  key={m} type="button"
                  className={`exp-modo ${modo === m ? "ativo" : ""}`}
                  onClick={() => setModo(m)}
                >
                  {MODOS[m].titulo}
                </button>
              ))}
            </div>

            {modo === "pontos" && (
              <>
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
              </>
            )}
            {modo !== "pontos" && (
              <>
                <div className="exp-preco">{MODOS[modo].preco}</div>
                <div className="exp-estimativa">{MODOS[modo].desc}</div>
              </>
            )}

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
        .exp {
          min-height: 100vh;
          background: linear-gradient(180deg, #faf8f5 0%, #f6efe3 100%);
          color: #2b2015;
        }
        .exp-topbar {
          background: rgba(250, 248, 245, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid #ede3d2;
        }
        .exp-body {
          max-width: 540px;
          margin: 0 auto;
          padding: 48px 24px 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .exp-kicker {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 11px;
          font-weight: 700;
          color: #a35d2f;
          background: #f3e4d0;
          border: 1px solid rgba(163, 93, 47, 0.2);
          padding: 4px 14px;
          border-radius: 999px;
          margin-bottom: 12px;
        }
        .exp-title {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 32px;
          margin: 0 0 10px;
          color: #2b2015;
        }
        .exp-sub {
          color: #7c6856;
          font-size: 15px;
          line-height: 1.55;
          margin-bottom: 28px;
        }
        .exp-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          background: #fffcf5;
          border: 1px solid #e3d6c1;
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 4px 16px rgba(43, 32, 21, 0.05);
        }
        .exp-label {
          font-size: 13.5px;
          font-weight: 700;
          text-align: left;
          color: #2b2015;
        }
        .exp-slider-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .exp-slider-row input[type="range"] {
          flex: 1;
          accent-color: #a35d2f;
        }
        .exp-pontos {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: #a35d2f;
          font-size: 16px;
        }
        .exp-preco {
          font-family: var(--font-brand);
          font-size: 46px;
          font-weight: 600;
          color: #2b2015;
          line-height: 1;
          margin: 6px 0 2px;
        }
        .exp-estimativa {
          color: #7c6856;
          font-size: 13.5px;
          margin-bottom: 10px;
        }
        .exp-modos {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .exp-modo {
          flex: 1;
          padding: 10px 8px;
          background: #faf8f5;
          border: 1px solid #e3d6c1;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 8px;
          color: #7c6856;
          transition: all 0.15s ease;
        }
        .exp-modo.ativo {
          border-color: #a35d2f;
          color: #2b2015;
          background: #f3e4d0;
          box-shadow: 0 1px 4px rgba(43, 32, 21, 0.06);
        }
        .exp-form input[type="email"],
        .exp-form input[type="text"] {
          padding: 14px 16px;
          border: 1px solid #e3d6c1;
          background: #faf8f5;
          font-size: 15px;
          color: #2b2015;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .exp-form input:focus {
          border-color: #a35d2f;
          background: #fff;
        }
        .exp-cta {
          background: linear-gradient(135deg, #a35d2f 0%, #7e4522 100%);
          color: #fffcf5;
          border: none;
          padding: 16px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(163, 93, 47, 0.25);
          transition: all 0.18s ease;
          margin-top: 4px;
        }
        .exp-cta:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(163, 93, 47, 0.35);
        }
        .exp-cta:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .exp-erro {
          color: #b3261e;
          font-size: 13.5px;
        }
        .exp-pix {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          align-items: center;
          background: #fffcf5;
          border: 1px solid #e3d6c1;
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 4px 16px rgba(43, 32, 21, 0.05);
        }
        .exp-pix-title {
          font-weight: 700;
          font-size: 16px;
          color: #2b2015;
        }
        .exp-cola {
          width: 100%;
          font-size: 12.5px;
          padding: 14px;
          border: 1px solid #e3d6c1;
          background: #faf8f5;
          color: #2b2015;
          resize: none;
          border-radius: 8px;
          font-family: var(--font-mono);
        }
        .exp-qr {
          width: 210px;
          height: 210px;
          border: 1px solid #e3d6c1;
          border-radius: 12px;
          padding: 8px;
          background: #fff;
        }
        .exp-link {
          color: #0f7680;
          font-size: 13.5px;
          text-decoration: none;
          font-weight: 500;
        }
        .exp-link:hover {
          text-decoration: underline;
        }
        .exp-aguardando {
          color: #0f7680;
          font-weight: 700;
          font-size: 14.5px;
        }
        .exp-ok {
          background: #fffcf5;
          border: 1px solid #e3d6c1;
          border-radius: 16px;
          padding: 32px 24px;
          width: 100%;
          box-shadow: 0 4px 16px rgba(43, 32, 21, 0.05);
        }
        .exp-ok h2 {
          font-family: var(--font-brand);
          font-weight: 600;
          margin-bottom: 8px;
          color: #2b2015;
        }
        .exp-senha {
          font-size: 24px;
          font-weight: 800;
          background: #f3e4d0;
          border: 1px solid #a35d2f;
          color: #2b2015;
          padding: 14px 20px;
          margin: 12px 0 20px;
          letter-spacing: 1px;
          border-radius: 10px;
          font-family: var(--font-mono);
        }
        .exp-cta-link {
          display: inline-block;
          text-decoration: none;
          padding: 15px 30px;
        }
      `}</style>
    </main>
  );
}
