"use client";

import { useEffect, useRef, useState } from "react";
import {
  getConta, setConta, verificarConta, licencaAtiva,
} from "@/lib/moka-conta";
import { useAuth } from "@/lib/auth";

/**
 * ContaButton — o botão de LOGIN da topbar.
 * Suporta entrar com Google (Supabase OAuth) e/ou e-mail + senha de pontos.
 */
export function ContaButton() {
  const { user, signInWithGoogle, signOut: signOutGoogle } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [info, setInfo] = useState<{ email: string; nome: string; saldo: number } | null>(null);
  const [licenca, setLicenca] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Boot: se tiver conta de pontos salva por e-mail/senha.
  useEffect(() => {
    const c = getConta();
    if (!c) return;
    setLoading(true);
    Promise.all([verificarConta(c.email, c.senha), licencaAtiva(c.email, c.senha)])
      .then(([i, lic]) => { setInfo({ email: c.email, nome: i.nome, saldo: i.saldo }); setLicenca(lic); })
      .catch(() => setConta(null))
      .finally(() => setLoading(false));
  }, []);

  // Se logar com o Google, tenta verificar saldo usando o e-mail do Google.
  useEffect(() => {
    if (user?.email && !info) {
      verificarConta(user.email, "")
        .then((i) => setInfo({ email: user.email!, nome: i.nome, saldo: i.saldo }))
        .catch(() => {
          // Usuário do Google ainda sem saldo de pontos cadastrado
          setInfo({ email: user.email!, nome: user.user_metadata?.full_name || user.email!.split("@")[0], saldo: 0 });
        });
    }
  }, [user, info]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const entrarPontos = async () => {
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

  const sair = async () => {
    setConta(null);
    setInfo(null);
    setLicenca(false);
    await signOutGoogle();
    setAberto(false);
  };

  const estaLogado = Boolean(user || info);
  const nomeExibicao = user?.user_metadata?.full_name || info?.nome || user?.email?.split("@")[0] || "Usuário";
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="conta-btn-wrap" ref={ref}>
      <button
        type="button"
        className={`gear ${estaLogado ? "conta-ativa" : ""}`}
        onClick={() => setAberto((o) => !o)}
        aria-label={estaLogado ? `Conta: ${nomeExibicao}` : "Entrar com sua conta"}
        title={estaLogado ? `${nomeExibicao} — ${info ? info.saldo.toLocaleString("pt-BR") + " pts" : "Logado"}` : "Entrar com Google ou Pontos"}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={nomeExibicao} className="avatar-img" />
        ) : estaLogado ? (
          "👤"
        ) : (
          "👤"
        )}
      </button>

      {aberto && (
        <div className="conta-pop" role="dialog" aria-label="Conta do usuário">
          {estaLogado ? (
            <>
              <div className="conta-header">
                {avatarUrl && <img src={avatarUrl} alt="" className="avatar-pop" />}
                <div>
                  <p className="conta-nome"><strong>{nomeExibicao}</strong></p>
                  <p className="conta-email">{user?.email || info?.email}</p>
                </div>
              </div>
              {info && <p className="conta-saldo">🪙 <strong>{info.saldo.toLocaleString("pt-BR")}</strong> pontos</p>}
              {licenca && <p className="conta-lic">💼 licença avançada ativa</p>}
              <a className="conta-link" href="/experimente">⚡ Comprar mais pontos →</a>
              <button type="button" className="conta-sair" onClick={() => void sair()}>Sair da conta</button>
            </>
          ) : (
            <>
              <p className="conta-titulo">🔑 Entrar no Moka</p>
              
              <button
                type="button"
                className="btn-google"
                onClick={() => void signInWithGoogle()}
              >
                <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Entrar com o Google
              </button>

              <div className="conta-divisor"><span>ou com sua conta de pontos</span></div>

              <input
                type="email" placeholder="seu e-mail da compra" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password" placeholder="senha (veio por e-mail)" value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void entrarPontos(); }}
              />
              <button
                type="button" className="conta-entrar"
                onClick={() => void entrarPontos()}
                disabled={loading || !email.trim() || !senha}
              >
                {loading ? "⏳ Entrando…" : "Entrar com e-mail"}
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
        .avatar-img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
        .avatar-pop { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
        .conta-header { display: flex; align-items: center; gap: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
        .conta-pop {
          position: absolute; top: calc(100% + 8px); right: 0; z-index: 900;
          width: 270px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; box-shadow: var(--shadow-lg); padding: 14px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .conta-titulo { font-weight: 700; font-size: 13.5px; margin: 0 0 2px; text-align: center; }
        .conta-nome { margin: 0; font-size: 13.5px; line-height: 1.2; }
        .conta-email { margin: 0; font-size: 11.5px; color: var(--text-muted); }
        .conta-saldo, .conta-lic { margin: 0; font-size: 13.5px; }
        .conta-lic { color: var(--accent-dark); font-size: 12px; }

        .btn-google {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: #ffffff; color: #3c4043; border: 1px solid #dadce0;
          border-radius: 8px; padding: 9px 12px; font-weight: 600; font-size: 13px;
          cursor: pointer; transition: background 0.2s, box-shadow 0.2s;
        }
        .btn-google:hover { background: #f8f9fa; box-shadow: 0 1px 3px rgba(60,64,67,0.15); }
        .google-icon { flex-shrink: 0; }

        .conta-divisor {
          display: flex; align-items: center; text-align: center; margin: 4px 0;
        }
        .conta-divisor::before, .conta-divisor::after {
          content: ''; flex: 1; border-bottom: 1px solid var(--border);
        }
        .conta-divisor span {
          padding: 0 8px; font-size: 11px; color: var(--text-muted); font-weight: 500;
        }

        .conta-pop input {
          padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px;
          background: var(--bg); color: var(--text); font-size: 13px; width: 100%;
          box-sizing: border-box;
        }
        .conta-entrar {
          background: var(--accent); color: #fff8ee; border: none; border-radius: 8px;
          padding: 9px; font-weight: 700; font-size: 13px; cursor: pointer;
        }
        .conta-entrar:disabled { opacity: 0.6; cursor: wait; }
        .conta-erro { color: #b3261e; font-size: 12px; margin: 0; }
        .conta-link { color: var(--accent-dark); font-size: 12px; font-weight: 700; text-decoration: none; text-align: center; }
        .conta-link:hover { text-decoration: underline; }
        .conta-sair {
          background: none; border: 1px solid var(--border); border-radius: 8px;
          padding: 8px; color: var(--text-muted); font-size: 12px; cursor: pointer; margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
