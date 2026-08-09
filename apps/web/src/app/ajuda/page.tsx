"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { ZeMocaAvatar } from "@/components/ZeMocaAvatar";
import { LangSwitcher } from "@/components/LangSwitcher";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter } from "@/components/SiteFooter";
import { LlmPriceRanking } from "@/components/LlmPriceRanking";
import { useI18n } from "@/components/I18nProvider";

/**
 * /ajuda — HELP do V3 (doc 15): página bem explicativa para quem nunca
 * viu "API", com busca e robô de dúvidas (responde do FAQ por palavras-chave;
 * funciona offline, sem gastar IA). Substitui o tutorial antigo (backup local).
 */

interface Faq { q: string; a: string; tags: string[] }

const FAQ: Faq[] = [
  { q: "O que é o Moka?", tags: ["moka", "que", "é", "app", "aplicativo"],
    a: "O Moka é um leitor com inteligência artificial: ele resume vídeos do YouTube e livros (EPUB/PDF) em minutos, traduz, explica, identifica personagens e responde perguntas sobre o conteúdo — no seu idioma. E é GRATUITO." },
  { q: "O Moka é grátis mesmo?", tags: ["grátis", "gratuito", "preço", "custa", "valor", "quanto", "pontos", "ponto", "créditos", "saldo"],
    a: "Sim — o Moka é grátis de verdade: você não compra nada aqui. A IA roda com a SUA chave de API (a chave da sua inteligência artificial), e você paga o provedor diretamente pelo que usar — centavos por livro/vídeo. Se quiser apoiar o projeto, tem o botão de doação no rodapé. ☕" },
  { q: "Quanto vou gastar com a minha própria API?", tags: ["gasto", "custo", "api", "provedor", "estimativa", "400", "paginas", "páginas"],
    a: "Pouco: com a IA mais econômica (DeepSeek V4 Flash), resumir um livro de 400 páginas custa ~R$ 0,02 e traduzir o livro inteiro ~R$ 0,15. Com modelos premium (Claude Opus, GPT-5), sobe pra centavos/reais por livro. Veja o Ranking de Preços das IAs aqui embaixo — dá pra comparar e escolher." },
  { q: "Como consigo uma chave de API?", tags: ["comprar", "compra", "chave", "api", "conseguir", "key", "onde"],
    a: "Em 1 minuto, no site do provedor que você escolher (DeepSeek, OpenAI, Z.ai, Qwen, Kimi, Anthropic, Gemini...): crie a conta, gere a chave e cole nas ⚙️ Configurações do Moka. Ela fica salva só no seu dispositivo, criptografada — nunca passa pelos nossos servidores." },
  { q: "Vídeo usa a mesma chave?", tags: ["vídeo", "video", "youtube", "transcrever", "legenda", "whisper", "áudio"],
    a: "Cuidado: vídeo é OUTRO sistema. Vídeo COM legenda é grátis e não gasta nada. Vídeo SEM legenda precisa de API de transcrição de ÁUDIO (ex.: OpenAI/Whisper) — nem toda API de texto serve pra isso. Preço: ~US$ 0,04–0,36 por hora de vídeo, conforme o serviço." },
  { q: "O que é uma chave de API?", tags: ["api", "o que é", "senha", "funciona"],
    a: "É como uma senha que liga o Moka à inteligência artificial que você escolheu (DeepSeek, OpenAI…). Você cria a sua de graça no site do provedor e adiciona crédito lá mesmo (cartão) — o Moka não vende crédito. O passo a passo completo está no /tutorial." },
  { q: "Qual IA devo escolher?", tags: ["ia", "llm", "modelo", "deepseek", "openai", "groq", "claude", "gemini", "escolher", "melhor"],
    a: "Pra começar: a mais econômica que resolve muito bem é a DeepSeek V4 Flash (centavos por livro). Se quiser o máximo de qualidade literária, Claude e GPT-5 são os premium — e custam mais. O Ranking de Preços aqui embaixo compara todos os modelos que o Moka aceita." },
  { q: "Minha chave fica segura?", tags: ["dados", "privacidade", "segurança", "seguro", "chave", "servidor"],
    a: "Sim. Sua chave fica só no seu dispositivo (criptografada no navegador) — nunca vai pra nossos servidores. Seus livros e vídeos também ficam no seu aparelho; se você entrar com Google/e-mail, a biblioteca synca na nuvem pra abrir em qualquer aparelho." },
  { q: "O Moka funciona em outros idiomas?", tags: ["idioma", "língua", "inglês", "espanhol", "tradução"],
    a: "Sim. A interface fala 12 idiomas (bandeirinha no topo), o Moka detecta automaticamente o idioma do vídeo ou livro e responde no SEU idioma. Um vídeo em inglês vira resumo em português sem você configurar nada." },
  { q: "Preciso instalar alguma coisa?", tags: ["instalar", "baixar", "download", "app"],
    a: "Não. O Moka funciona no navegador, no celular e no computador. Se quiser, dá pra instalar como aplicativo (o botão aparece na página inicial) — é grátis e não passa por loja." },
  { q: "Preciso criar conta?", tags: ["conta", "cadastro", "login", "google", "email", "senha", "registrar"],
    a: "Não é obrigatório — mas vale a pena: entrando com Google ou e-mail, sua biblioteca (livros, anotações, traduções e progresso) fica guardada na nuvem e abre em qualquer aparelho. O cadastro por e-mail pede confirmação no seu e-mail; tem 'esqueci a senha' também." },
  { q: "Quem faz o Moka?", tags: ["quem", "cafezinho", "empresa", "time"],
    a: "O Moka é feito pelo time de O Cafezinho, com carinho de jornalista e precisão de engenharia. É gratuito — quem quiser apoiar, tem a doação no rodapé (PayPal e Pix)." },
];

/** Normaliza (minúsculas, sem acento) pra busca e pro robô. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Robô de dúvidas: pontua cada item do FAQ por palavras da pergunta. */
function responder(pergunta: string): string {
  const palavras = norm(pergunta).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let melhor: Faq | null = null;
  let melhorScore = 0;
  for (const item of FAQ) {
    const alvo = norm(item.q + " " + item.tags.join(" "));
    let score = 0;
    for (const p of palavras) if (alvo.includes(p)) score += p.length > 5 ? 2 : 1;
    if (score > melhorScore) { melhorScore = score; melhor = item; }
  }
  if (!melhor || melhorScore < 2) {
    return "Hmm, não tenho certeza da resposta pra essa. Tenta perguntar de outro jeito — ou traz pra comunidade, que a gente responde rapidinho. Enquanto isso, os tópicos abaixo cobrem o essencial. 👇";
  }
  return melhor.a;
}

export default function Ajuda() {
  const { t } = useI18n();
  const [busca, setBusca] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  const filtrados = useMemo(() => {
    const q = norm(busca);
    if (!q) return FAQ;
    return FAQ.filter(
      (f) => norm(f.q).includes(q) || f.tags.some((tg) => norm(tg).includes(q)) || norm(f.a).includes(q),
    );
  }, [busca]);

  return (
    <main className="help">
      <div className="igot-topbar help-topbar">
        <div className="igot-topbar-left">
          <a className="brand" href="/">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </a>
        </div>
        <div className="igot-topbar-actions">
          <AuthGate />
          <LangSwitcher />
        </div>
      </div>

      <div className="help-body">
        {/* 🤖 ZÉ MOCA — agente-guia em destaque, no topo da ajuda.
            Apresentação amigável + link pro futuro chat. (Pedido do Miguel,
            09/08: "entra ele com destaque, logo em cima".) */}
        <section className="ze-moca-banner">
          <div className="ze-moca-avatar"><ZeMocaAvatar size={72} /></div>
          <div className="ze-moca-text">
            <h2 className="ze-moca-name">Zé Moca</h2>
            <p className="ze-moca-intro">
              {t("ze_moca_intro") || "Oi, eu sou o Zé Moca! Sou o guia do Moka. Estou aqui pra te ajudar com qualquer dúvida — pode perguntar qualquer coisa que eu respondo. Te ensino a usar e a configurar."}
            </p>
            <Link href="/ajuda#robô" className="ze-moca-cta">
              💬 {t("ze_moca_ask") || "Conversar com o Zé Moca"}
            </Link>
          </div>
        </section>

        <p className="help-kicker">Central de ajuda</p>
        <h1 className="help-title">Como o Moka funciona</h1>

        {/* 🔎 Localizador — busca rápida no FAQ (filtra em tempo real).
            Ícone de lupa à esquerda dentro do campo (pedido do Miguel:
            "sem ícone de clicar pra buscar"). */}
        <div className="help-localizador">
          <span className="help-localizador-icon">🔎</span>
          <input
            className="help-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("help_search_ph") || "🔎 Localizar uma dúvida... (ex.: custo, chave, vídeo)"}
          />
          {busca && (
            <button
              type="button"
              className="help-localizador-clear"
              onClick={() => setBusca("")}
              aria-label="Limpar"
            >
              ✕
            </button>
          )}
        </div>

        {/* FASE GRATUITA (pivô 2026-08-04): o essencial do BYOK em destaque,
            nos 12 idiomas (ui-strings) — antes de qualquer FAQ. */}
        <section className="help-robo" style={{ marginBottom: 18 }}>
          <h2>🆓 {t("free_title")}</h2>
          <p style={{ lineHeight: 1.6 }}>{t("free_desc")}</p>
          <p style={{ lineHeight: 1.6, marginTop: 8 }}>{t("byok_cost")}</p>
          <p style={{ lineHeight: 1.6, marginTop: 8 }}>{t("byok_video_note")}</p>
        </section>

        {/* 🏆 Ranking de preços das IAs (pedido do Miguel, 05/08) */}
        <LlmPriceRanking />

        {/* Robô de dúvidas */}
        <section className="help-robo" id="robô">
          <h2>🤖 Pergunte ao Zé Moca</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pergunta.trim()) setResposta(responder(pergunta));
            }}
          >
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder="Ex.: quanto custa traduzir um livro?"
            />
            <button type="submit">Perguntar</button>
          </form>
          {resposta && <p className="help-resposta">{resposta}</p>}
        </section>

        {/* Tópicos — já filtrados pela busca do localizador (lá em cima). */}
        <div className="help-lista">
          {filtrados.map((f) => (
            <details key={f.q} className="help-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          {filtrados.length === 0 && (
            <p className="help-vazio">{t("help_no_results") || "Nada encontrado — pergunta pro Zé Moca ali em cima 🧑‍🌾"}</p>
          )}
        </div>

        {/* Comunidade — Telegram @mokareader (criado pelo Miguel 09/08). */}
        <section className="help-comunidade">
          <h2>💬 Comunidade</h2>
          <p>
            Dúvidas, ideias e conversa direta com o time:{" "}
            <a href="https://t.me/mokareader" target="_blank" rel="noreferrer">
              entre na comunidade do Moka no Telegram →
            </a>
          </p>
        </section>
      </div>

      <style jsx>{`
        .help { min-height: 100vh; background: #fff6ee; color: #1a1a1a; }
        .help-topbar { background: #fff6ee; border-bottom: 1px solid #d9c8b8; }
        .help-body { max-width: 640px; margin: 0 auto; padding: 40px 22px 64px; }

        /* 🤖 Banner do Zé Moca — destaque no topo da ajuda */
        .ze-moca-banner {
          display: flex;
          gap: 16px;
          align-items: center;
          padding: 20px;
          margin-bottom: 28px;
          background: linear-gradient(135deg, #fff8ee, #f7e7d7);
          border: 2px solid #b06a3b;
          border-radius: 18px;
          box-shadow: 0 4px 16px rgba(176, 106, 59, 0.15);
        }
        .ze-moca-avatar {
          font-size: 48px;
          flex-shrink: 0;
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface, #fff);
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .ze-moca-text { flex: 1; }
        .ze-moca-name {
          font-family: var(--font-brand);
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 4px;
          color: #b06a3b;
        }
        .ze-moca-intro {
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 10px;
          color: #4a3525;
        }
        .ze-moca-cta {
          display: inline-block;
          padding: 8px 18px;
          background: #b06a3b;
          color: #fff;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s;
        }
        .ze-moca-cta:hover { background: #8f5530; }

        /* 🔎 Localizador (busca) — ícone de lupa + botão limpar */
        .help-localizador {
          position: relative;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
        }
        .help-localizador-icon {
          position: absolute;
          left: 14px;
          font-size: 17px;
          pointer-events: none;
        }
        .help-localizador .help-busca {
          width: 100%;
          padding: 14px 44px 14px 42px;
          font-size: 15px;
          border: 2px solid #d9c8b8;
          border-radius: 12px;
          background: var(--surface, #fff);
          color: var(--text, #1a1a1a);
          box-sizing: border-box;
        }
        .help-localizador .help-busca:focus {
          outline: none;
          border-color: #b06a3b;
        }
        .help-localizador-clear {
          position: absolute;
          right: 10px;
          width: 26px;
          height: 26px;
          border: none;
          background: #e2e8f0;
          color: #475569;
          border-radius: 50%;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .help-localizador-clear:hover { background: #cbd5e1; }
        .help-kicker {
          text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px;
          font-weight: 700; color: #0f7680; margin-bottom: 8px; text-align: center;
        }
        .help-title {
          font-family: var(--font-brand); font-weight: 600; font-size: 28px;
          text-align: center; margin: 0 0 26px;
        }
        .help-robo {
          border: 1px solid #1a1a1a; background: #f7e7d7; padding: 18px; margin-bottom: 22px;
        }
        .help-robo h2 { font-family: var(--font-brand); font-weight: 600; font-size: 19px; margin: 0 0 12px; }
        .help-robo form { display: flex; gap: 8px; }
        .help-robo input {
          flex: 1; padding: 12px; border: 1px solid #d9c8b8; background: #fff;
          font-size: 14px; border-radius: 2px;
        }
        .help-robo button {
          background: #1a1a1a; color: #fff; border: none; padding: 12px 18px;
          font-weight: 700; font-size: 13px; cursor: pointer; border-radius: 2px;
        }
        .help-resposta { margin-top: 12px; font-size: 14px; line-height: 1.6; }
        .help-busca {
          width: 100%; padding: 13px 14px; border: 1px solid #d9c8b8; background: #fff;
          font-size: 14.5px; border-radius: 2px; margin-bottom: 18px;
        }
        .help-lista { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #d9c8b8; }
        .help-item { border-bottom: 1px solid #d9c8b8; }
        .help-item summary {
          cursor: pointer; padding: 14px 4px; font-weight: 700; font-size: 15px; list-style: none;
        }
        .help-item summary::before { content: "▸ "; color: #0f7680; }
        .help-item[open] summary::before { content: "▾ "; }
        .help-item p { padding: 0 4px 16px; color: #66605a; font-size: 14px; line-height: 1.65; }
        .help-vazio { color: #66605a; padding: 18px 4px; }
        .help-comunidade { margin-top: 30px; border-top: 1px solid #d9c8b8; padding-top: 20px; }
        .help-comunidade h2 { font-family: var(--font-brand); font-weight: 600; font-size: 19px; margin: 0 0 8px; }
        .help-comunidade p { color: #66605a; font-size: 14px; line-height: 1.6; }
        .help-comunidade a { color: #0f7680; font-weight: 700; }
      `}</style>
          <SiteFooter />
    </main>
  );
}
