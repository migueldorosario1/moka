"use client";

import { useState } from "react";
import {
  PLAN_PRICES,
  PLAN_DETAILS,
  getPlan,
  activatePlan,
  deactivatePlan,
  type PlanTier,
} from "@/lib/subscription";

/**
 * Página /premium — vitrine de assinatura do Moka.
 *
 * 3 planos com nomes de café:
 *   ☕ Free       — BYOK (grátis)
 *   🥛 Cappuccino — IA inclusa + voz neural (plano principal)
 *   ☕ Espresso   — Tudo + Dante (agente educacional)
 */
export default function PremiumPage() {
  const [plan, setPlan] = useState<PlanTier>(getPlan().tier);
  const [selectedTier, setSelectedTier] = useState<"cappuccino" | "espresso">("cappuccino");
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");

  const handleSubscribe = () => {
    const days = period === "monthly" ? 30 : period === "quarterly" ? 90 : 365;
    activatePlan(selectedTier, days);
    setPlan(selectedTier);
  };

  const handleCancel = () => {
    deactivatePlan();
    setPlan("free");
  };

  return (
    <main className="premium-page">
      <div className="premium-card">
        <a href="/" className="premium-back">← Moka</a>

        <div className="premium-header">
          <span className="premium-logo">☕</span>
          <h1>Moka Premium</h1>
          <p className="premium-subtitle">
            A melhor experiência de leitura com IA. Escolha seu café.
          </p>
        </div>

        {plan !== "free" ? (
          <div className="premium-active">
            <div className="premium-badge">
              {PLAN_DETAILS[plan].emoji} Você é {PLAN_DETAILS[plan].name}
            </div>
            <p>Aproveite todos os recursos inclusos. Obrigado por apoiar o Moka!</p>
            <button className="btn-cancel" onClick={handleCancel}>
              Cancelar assinatura
            </button>
          </div>
        ) : (
          <>
            {/* Comparação dos 3 planos */}
            <div className="plans-grid">
              {(["free", "cappuccino", "espresso"] as const).map((tier) => {
                const d = PLAN_DETAILS[tier];
                return (
                  <div
                    key={tier}
                    className={`plan-card plan-${tier} ${d.highlight ? "highlighted" : ""}`}
                  >
                    {d.highlight && <div className="plan-badge">⭐ Mais popular</div>}
                    {tier === "espresso" && <div className="plan-badge-edu">🎓 Educação</div>}
                    <span className="plan-emoji">{d.emoji}</span>
                    <h2>{d.name}</h2>
                    <p className="plan-tagline">{d.tagline}</p>
                    {tier === "free" && <p className="plan-price">Grátis</p>}
                    {tier === "cappuccino" && (
                      <p className="plan-price">{PLAN_PRICES.cappuccino[period].price}<span className="plan-period">{PLAN_PRICES.cappuccino[period].period}</span></p>
                    )}
                    {tier === "espresso" && (
                      <p className="plan-price">{PLAN_PRICES.espresso[period].price}<span className="plan-period">{PLAN_PRICES.espresso[period].period}</span></p>
                    )}
                    <ul className="plan-features">
                      {d.features.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                    {tier === "free" && (
                      <button className="btn-plan btn-current" disabled>
                        Seu plano atual
                      </button>
                    )}
                    {tier === "cappuccino" && (
                      <button
                        className="btn-plan"
                        onClick={() => { setSelectedTier("cappuccino"); setTimeout(handleSubscribe, 100); }}
                      >
                        Assinar Cappuccino
                      </button>
                    )}
                    {tier === "espresso" && (
                      <button
                        className="btn-plan btn-espresso"
                        onClick={() => { setSelectedTier("espresso"); setTimeout(handleSubscribe, 100); }}
                      >
                        Assinar Espresso
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Seletor de período */}
            <div className="period-selector">
              {(["monthly", "quarterly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  className={`period-btn ${period === p ? "active" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  <span className="period-label">
                    {p === "monthly" ? "Mensal" : p === "quarterly" ? "Trimestral" : "Anual"}
                  </span>
                  {p === "yearly" && <span className="period-save">Economize 33%</span>}
                </button>
              ))}
            </div>

            <p className="subscribe-note">
              Cancele quando quiser. Pagamento processado pelo Google Play / App Store.
            </p>
          </>
        )}

        {/* Dante — destaque do Espresso */}
        <div className="dante-section">
          <div className="dante-avatar">🎭</div>
          <div className="dante-info">
            <h3>Conheça Dante</h3>
            <p>
              No plano <strong>Espresso</strong>, Dante é o seu tutor de leitura pessoal.
              Ele lê o livro para você — com voz e imagem — explica os trechos difíceis,
              faz perguntas e conversa sobre a história.
            </p>
            <p>
              Ideal para <strong>educação</strong>: crianças que estão aprendendo a ler,
              estudantes que precisam de ajuda com textos difíceis, e qualquer pessoa
              que quer companhia enquanto lê.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="premium-faq">
          <h3>Perguntas frequentes</h3>
          <details>
            <summary>Preciso de uma chave de API no Cappuccino ou Espresso?</summary>
            <p>Não! Nesses planos a IA é inclusa. Você não configura nada — só assina e usa.</p>
          </details>
          <details>
            <summary>Posso continuar usando o plano Free?</summary>
            <p>Sim! O plano Free é gratuito para sempre, com sua própria chave de API.</p>
          </details>
          <details>
            <summary>O que é o Dante?</summary>
            <p>Dante é um agente educacional disponível no plano Espresso. Ele lê o livro em voz alta (com vídeo), explica conceitos e conversa com você sobre o texto. Perfeito para educação.</p>
          </details>
          <details>
            <summary>Qual a diferença entre Cappuccino e Espresso?</summary>
            <p>O Cappuccino já tem IA inclusa, voz neural e biblioteca na nuvem. O Espresso adiciona o Dante (agente com vídeo), IA mais avançada e foco em educação.</p>
          </details>
          <details>
            <summary>Meus livros ficam salvos na nuvem?</summary>
            <p>Sim! No Cappuccino e Espresso, sua biblioteca sincroniza entre dispositivos. EPUBs sincronizam completo; PDFs até 50 MB cada.</p>
          </details>
        </div>

        <div className="premium-footer">
          <p>
            <strong>Moka</strong> — Leia qualquer coisa. Entenda tudo.<br />
            Um produto do Cafezinho Media Group — Niterói, RJ — Brasil
          </p>
        </div>
      </div>

      <style>{`
        .premium-page { min-height: 100vh; background: var(--bg); padding: 40px 20px; }
        .premium-card { max-width: 900px; margin: 0 auto; background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 48px 40px; box-shadow: var(--shadow); }
        .premium-back { color: var(--accent); text-decoration: none; font-size: 14px; }
        .premium-header { text-align: center; margin: 24px 0 40px; }
        .premium-logo { font-size: 48px; display: block; margin-bottom: 8px; }
        .premium-header h1 { font-family: var(--font-brand); font-size: 34px; font-weight: 600; color: var(--accent-dark); margin: 0 0 8px; }
        .premium-subtitle { font-size: 16px; color: var(--text-muted); margin: 0; }
        .plans-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 28px; }
        .plan-card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 22px; position: relative; display: flex; flex-direction: column; box-shadow: var(--shadow-sm); transition: box-shadow var(--transition), transform var(--transition); }
        .plan-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
        .plan-card.highlighted { border-color: var(--accent); background: var(--accent-soft); }
        .plan-cappuccino { border-color: var(--accent); }
        .plan-espresso { border-color: var(--gold, #c89968); }
        .plan-badge, .plan-badge-edu { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .plan-badge { background: var(--accent); color: white; }
        .plan-badge-edu { background: var(--gold, #c89968); color: white; top: -28px; }
        .plan-emoji { font-size: 32px; margin-bottom: 4px; }
        .plan-card h2 { font-family: var(--font-brand); font-size: 21px; font-weight: 600; margin: 0; }
        .plan-tagline { font-size: 12px; color: var(--text-muted); margin: 4px 0 12px; min-height: 32px; }
        .plan-price { font-size: 28px; font-weight: 700; color: var(--accent); margin: 0 0 16px; }
        .plan-period { font-size: 14px; color: var(--text-muted); font-weight: 400; }
        .plan-features { list-style: none; padding: 0; margin: 0 0 20px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .plan-features li { font-size: 13px; line-height: 1.5; color: var(--text); }
        .btn-plan { width: 100%; padding: 12px; border: none; background: var(--accent); color: white; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 150ms ease; }
        .btn-plan:hover { background: var(--accent-dark); transform: scale(1.02); }
        .btn-plan.btn-espresso { background: var(--gold, #c89968); }
        .btn-plan.btn-current { background: var(--surface-alt); color: var(--text-muted); cursor: default; }
        .btn-plan.btn-current:hover { transform: none; }
        .period-selector { display: flex; gap: 10px; margin-bottom: 20px; }
        .period-btn { flex: 1; padding: 12px; border: 2px solid var(--border); background: var(--surface); border-radius: 12px; cursor: pointer; text-align: center; transition: all 150ms ease; display: flex; flex-direction: column; gap: 4px; }
        .period-btn.active { border-color: var(--accent); background: var(--accent-soft); }
        .period-label { font-size: 13px; font-weight: 600; }
        .period-save { font-size: 11px; color: #6b8e3d; font-weight: 600; }
        .subscribe-note { text-align: center; font-size: 12px; color: var(--text-muted); margin: 0 0 32px; }
        .premium-active { text-align: center; padding: 40px 20px; }
        .premium-badge { display: inline-block; background: var(--accent); color: white; padding: 8px 24px; border-radius: 24px; font-size: 18px; font-weight: 700; margin-bottom: 16px; }
        .premium-active p { color: var(--text-muted); margin-bottom: 20px; }
        .btn-cancel { padding: 10px 20px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); border-radius: 8px; cursor: pointer; font-size: 14px; }
        .dante-section { display: flex; gap: 20px; padding: 24px; background: var(--surface-alt); border-radius: 14px; margin-bottom: 32px; align-items: flex-start; }
        .dante-avatar { font-size: 48px; flex-shrink: 0; }
        .dante-info h3 { font-size: 20px; margin: 0 0 8px; color: var(--accent); }
        .dante-info p { font-size: 14px; line-height: 1.7; color: var(--text); margin: 0 0 12px; }
        .premium-faq { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
        .premium-faq h3 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
        .premium-faq details { margin-bottom: 12px; }
        .premium-faq summary { cursor: pointer; font-size: 15px; font-weight: 500; padding: 8px 0; }
        .premium-faq details[open] summary { color: var(--accent); }
        .premium-faq p { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin: 8px 0 0; padding-left: 8px; }
        .premium-footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); line-height: 1.6; }
        @media (max-width: 700px) {
          .plans-grid { grid-template-columns: 1fr; }
          .period-selector { flex-direction: column; }
          .premium-card { padding: 24px 20px; }
          .dante-section { flex-direction: column; }
        }
      `}</style>
    </main>
  );
}
