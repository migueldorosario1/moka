"use client";

import { useEffect, useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { SectionSwitcher } from "@/components/SectionSwitcher";
import { LangSwitcher } from "@/components/LangSwitcher";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/lib/auth";

interface Summary {
  visitsToday: number;
  visitsTotal: number;
  installs: number;
  subscribers: number;
  partnersTotal: number;
  partners: Array<{ position: number; name: string; created_at: string }>;
  myPosition: number | null;
}

/**
 * 🤝 Painel de Sócios — transparência do Moka (pedido do Miguel).
 *
 * Os primeiros 200 sócios acompanham AO VIVO: visitas do site, instalações
 * do app, assinantes pagantes e a lista de sócios. Login com a conta
 * Google (a mesma do Moka). Os números se registram sozinhos:
 *  - visita → ping 1x/dia por aparelho (home do app)
 *  - instalação → evento appinstalled do PWA
 *  - assinantes → tabela subscriptions (sprint de pagamento)
 */
export default function SociosPage() {
  const auth = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "authed") return;
    fetch("/api/metrics/summary")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Summary;
      })
      .then(setData)
      .catch((err) => setError(String(err)));
  }, [auth.status]);

  return (
    <main className="igot-shell">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <a className="brand" href="/">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </a>
          <SectionSwitcher active="reader" />
        </div>
        <div className="igot-topbar-actions">
          <LangSwitcher />
          <AuthButton
            status={auth.status}
            userName={auth.user?.user_metadata?.full_name ?? null}
            userEmail={auth.user?.email ?? null}
            avatarUrl={auth.user?.user_metadata?.avatar_url ?? null}
            onSignIn={auth.signInWithGoogle}
            onSignOut={auth.signOut}
          />
        </div>
      </div>

      <div className="socios-page">
        <header className="socios-header">
          <h1>🤝 Painel de Sócios</h1>
          <p>
            Os 200 sócios fundadores do Moka acompanham aqui, ao vivo e com
            transparência total, o crescimento do aplicativo: visitas,
            instalações, assinantes e investidores.
          </p>
        </header>

        {auth.status === "loading" && (
          <div className="igot-loading">
            <div className="spinner" />
          </div>
        )}

        {auth.status === "anon" && (
          <div className="socios-login">
            <p>
              🔒 O painel é exclusivo pra sócios e investidores.
              Entre com a sua conta Google pra ver os números.
            </p>
            <AuthButton
              status="anon"
              onSignIn={auth.signInWithGoogle}
              onSignOut={auth.signOut}
            />
          </div>
        )}

        {auth.status === "authed" && data && (
          <>
            {data.myPosition && (
              <p className="socios-mine">
                ☕ Você é o sócio <strong>#{data.myPosition}</strong> de{" "}
                {data.partnersTotal}. Obrigado por acreditar!
              </p>
            )}

            <div className="socios-grid">
              <div className="socios-card">
                <span className="socios-number">{data.visitsToday}</span>
                <span className="socios-label">visitas hoje</span>
              </div>
              <div className="socios-card">
                <span className="socios-number">{data.visitsTotal}</span>
                <span className="socios-label">visitas no total</span>
              </div>
              <div className="socios-card">
                <span className="socios-number">{data.installs}</span>
                <span className="socios-label">instalações do app</span>
              </div>
              <div className="socios-card">
                <span className="socios-number">{data.subscribers}</span>
                <span className="socios-label">assinantes pagantes</span>
              </div>
            </div>

            <section className="socios-partners">
              <h2>
                Sócios fundadores{" "}
                <span className="socios-count">
                  {data.partners.length} de {data.partnersTotal}
                </span>
              </h2>
              {data.partners.length === 0 ? (
                <p className="socios-empty">
                  A lista está sendo montada — o sócio #1 já tem nome:{" "}
                  <strong>Miguel do Rosário</strong>, fundador. ☕
                </p>
              ) : (
                <ol className="socios-list">
                  {data.partners.map((p) => (
                    <li key={p.position}>
                      <span className="socios-pos">#{p.position}</span>
                      <span className="socios-name">{p.name}</span>
                      <span className="socios-date">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="socios-note">
                ℹ️ As vagas de sócio são limitadas a 200 e o retorno é
                proporcional à ordem de entrada — quem chega primeiro,
                participa mais. (Estrutura final com assessoria jurídica —
                ver /sobre.)
              </p>
            </section>
          </>
        )}

        {auth.status === "authed" && error && (
          <p className="socios-empty">⚠️ Não consegui ler os números ({error}).</p>
        )}

        {auth.status === "authed" && !data && !error && (
          <div className="igot-loading">
            <div className="spinner" />
          </div>
        )}
      </div>

      <style jsx>{`
        .socios-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 32px 20px 80px;
          overflow-y: auto;
        }
        .socios-header h1 {
          font-family: var(--font-brand);
          font-size: 28px;
          margin: 0 0 8px;
        }
        .socios-header p {
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0 0 24px;
        }
        .socios-login {
          background: var(--surface);
          border: 1px solid var(--gold);
          border-radius: var(--radius-lg);
          padding: 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          font-size: 15.5px;
          line-height: 1.6;
        }
        .socios-mine {
          background: var(--accent-soft);
          border: 1px solid var(--gold);
          border-radius: var(--radius-pill);
          padding: 10px 18px;
          text-align: center;
          font-size: 15px;
          margin-bottom: 20px;
        }
        .socios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin-bottom: 32px;
        }
        .socios-card {
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          padding: 18px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .socios-number {
          font-family: var(--font-brand);
          font-size: 32px;
          font-weight: 700;
          color: var(--accent-dark);
          font-variant-numeric: tabular-nums;
        }
        .socios-label {
          font-size: 13px;
          color: var(--text-muted);
          text-align: center;
        }
        .socios-partners h2 {
          font-family: var(--font-brand);
          font-size: 20px;
          margin: 0 0 14px;
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .socios-count {
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--accent);
          font-weight: 600;
        }
        .socios-empty {
          color: var(--text-muted);
          line-height: 1.6;
        }
        .socios-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .socios-list li {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius);
          padding: 10px 14px;
        }
        .socios-pos {
          font-weight: 700;
          color: var(--accent);
          min-width: 42px;
          font-variant-numeric: tabular-nums;
        }
        .socios-name {
          flex: 1;
          font-weight: 600;
        }
        .socios-date {
          font-size: 12.5px;
          color: var(--text-muted);
        }
        .socios-note {
          margin-top: 16px;
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.55;
        }
      `}</style>
    </main>
  );
}
