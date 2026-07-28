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
const API = "/api/pontos";
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

    </main>
  );
}
