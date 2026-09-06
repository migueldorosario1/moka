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

  // NÃO fecha mais por clique fora (bug do Miguel, 06/09 — "a caixa de login
  // ficou fechando, não está estável"): fechava no meio da digitação quando o
  // toque/clique caía fora do pop. Agora fecha só pelo ✕ ou pelo botão da
  // topbar. O ref continua ancorando o pop ao botão.

  // Login feito pela OUTRA porta (AuthModal com fallback de pontos) refaz a
  // verificação aqui na hora, sem recarregar a página.
  useEffect(() => {
    const recarrega = () => {
      const c = getConta();
      if (!c) return;
      setLoading(true);
      Promise.all([verificarConta(c.email, c.senha), licencaAtiva(c.email, c.senha)])
        .then(([i, lic]) => { setInfo({ email: c.email, nome: i.nome, saldo: i.saldo }); setLicenca(lic); })
        .catch(() => setConta(null))
        .finally(() => setLoading(false));
    };
    window.addEventListener("moka-conta-mudou", recarrega);
    return () => window.removeEventListener("moka-conta-mudou", recarrega);
  }, []);

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
                <button type="button" className="conta-fechar" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
              </div>
              {info && <p className="conta-saldo">🪙 <strong>{info.saldo.toLocaleString("pt-BR")}</strong> pontos</p>}
              {licenca && <p className="conta-lic">💼 licença avançada ativa</p>}
              <a className="conta-link" href="/experimente">⚡ Comprar mais pontos →</a>
              <button type="button" className="conta-sair" onClick={() => void sair()}>Sair da conta</button>
            </>
          ) : (
            <>
              <div className="conta-head">
                <p className="conta-titulo">🔑 Entrar no Moka</p>
                <button type="button" className="conta-fechar" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
              </div>
              
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

      {/* CSS migrado para globals.css — cura FOUC (era <style jsx>) */}
    </div>
  );
}
