"use client";

import { useEffect, useRef, useState } from "react";
import {
  getConta, setConta, verificarConta, licencaAtiva,
} from "@/lib/moka-conta";

/**
 * ContaButton — o botão de LOGIN da topbar (pedido do Miguel, V3:
 * "login/logout do lado da bandeirinha"). Mostra 👤; logado mostra os
 * pontos. No popover: entrar com e-mail+senha da compra ou sair.
 */
export function ContaButton() {
  const [aberto, setAberto] = useState(false);
  const [info, setInfo] = useState<{ email: string; nome: string; saldo: number } | null>(null);
  const [licenca, setLicenca] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Boot: restaura a conta salva.
  useEffect(() => {
    const c = getConta();
    if (!c) return;
    setLoading(true);
    Promise.all([verificarConta(c.email, c.senha), licencaAtiva(c.email, c.senha)])
      .then(([i, lic]) => { setInfo({ email: c.email, nome: i.nome, saldo: i.saldo }); setLicenca(lic); })
      .catch(() => setConta(null))
      .finally(() => setLoading(false));
  }, []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const entrar = async () => {
    setErro("");
    setLoading(true);
    try {
      const [i, lic] = await Promise.all([
        verificarConta(email.trim(), senha),
        licencaAtiva(email.trim(), senha),
      ]);
      setConta({ email: email.trim(), senha });
      setInfo({ email: email.trim(), nome: i.nome, saldo: i.saldo });
      setLicenca(lic);
      setSenha("");
      setAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const sair = () => {
    setConta(null);
    setInfo(null);
    setLicenca(false);
    setAberto(false);
  };

  return (
    <div className="conta-btn-wrap" ref={ref}>
      <button
        type="button"
        className={`gear ${info ? "conta-ativa" : ""}`}
        onClick={() => setAberto((o) => !o)}
        aria-label={info ? `Conta: ${info.nome}` : "Entrar com sua conta de pontos"}
        title={info ? `${info.nome} — ${info.saldo.toLocaleString("pt-BR")} pts` : "Entrar (pontos)"}
      >
        {info ? "🪙" : "👤"}
      </button>

      {aberto && (
        <div className="conta-pop" role="dialog" aria-label="Conta de pontos">
          {info ? (
            <>
              <p className="conta-nome">✅ <strong>{info.nome}</strong></p>
              <p className="conta-saldo">🪙 <strong>{info.saldo.toLocaleString("pt-BR")}</strong> pontos</p>
              {licenca && <p className="conta-lic">💼 licença avançada ativa</p>}
              <a className="conta-link" href="/experimente">⚡ Comprar mais pontos →</a>
              <button type="button" className="conta-sair" onClick={sair}>Sair da conta</button>
            </>
          ) : (
            <>
              <p className="conta-titulo">🔑 Entrar com sua conta de pontos</p>
              <input
                type="email" placeholder="seu e-mail da compra" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password" placeholder="senha (veio por e-mail)" value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void entrar(); }}
              />
              <button
                type="button" className="conta-entrar"
                onClick={() => void entrar()}
                disabled={loading || !email.trim() || !senha}
              >
                {loading ? "⏳ Entrando…" : "Entrar"}
              </button>
              {erro && <p className="conta-erro">{erro}</p>}
              <a className="conta-link" href="/experimente">Ainda não tem pontos? Compre aqui →</a>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .conta-btn-wrap { position: relative; }
        .conta-ativa { outline: 2px solid var(--gold); outline-offset: 1px; }
        .conta-pop {
          position: absolute; top: calc(100% + 8px); right: 0; z-index: 900;
          width: 260px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; box-shadow: var(--shadow-lg); padding: 14px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .conta-titulo { font-weight: 700; font-size: 13px; margin: 0; }
        .conta-nome, .conta-saldo, .conta-lic { margin: 0; font-size: 14px; }
        .conta-lic { color: var(--accent-dark); font-size: 12.5px; }
        .conta-pop input {
          padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
          background: var(--bg); color: var(--text); font-size: 13.5px; width: 100%;
        }
        .conta-entrar {
          background: var(--accent); color: #fff8ee; border: none; border-radius: 8px;
          padding: 10px; font-weight: 700; font-size: 13.5px; cursor: pointer;
        }
        .conta-entrar:disabled { opacity: 0.6; cursor: wait; }
        .conta-erro { color: #b3261e; font-size: 12.5px; margin: 0; }
        .conta-link { color: var(--accent-dark); font-size: 12.5px; font-weight: 700; text-decoration: none; }
        .conta-link:hover { text-decoration: underline; }
        .conta-sair {
          background: none; border: 1px solid var(--border); border-radius: 8px;
          padding: 8px; color: var(--text-muted); font-size: 12.5px; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
