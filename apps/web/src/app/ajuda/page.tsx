"use client";

import { useMemo, useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { CloseAppButton } from "@/components/CloseAppButton";
import { LangSwitcher } from "@/components/LangSwitcher";

/**
 * /ajuda — HELP do V3 (doc 15): página bem explicativa para quem nunca
 * viu "API", com busca e robô de dúvidas (responde do FAQ por palavras-chave;
 * funciona offline, sem gastar IA). Substitui o tutorial antigo (backup local).
 */

interface Faq { q: string; a: string; tags: string[] }

const FAQ: Faq[] = [
  { q: "O que é o Moka?", tags: ["moka", "que", "é", "app", "aplicativo"],
    a: "O Moka é um leitor com inteligência artificial: ele resume vídeos do YouTube e livros (EPUB/PDF) em minutos, traduz, explica, identifica personagens e responde perguntas sobre o conteúdo — no seu idioma." },
  { q: "O que são pontos?", tags: ["pontos", "ponto", "créditos", "saldo"],
    a: "Pontos são a moeda do Moka. Cada ação da IA custa pontos: resumir um vídeo custa 30, resumir um livro custa 40, traduzir um livro inteiro custa 80 e um áudio de 10 minutos custa 40. Você compra pontos uma vez e gasta quando quiser — eles não expiram." },
  { q: "Quanto custa cada coisa?", tags: ["preço", "custa", "valor", "quanto"],
    a: "O ponto custa R$ 0,10. Então: resumo de vídeo = R$ 3,00 · resumo de livro = R$ 4,00 · tradução de livro inteiro = R$ 8,00 · áudio de 10 min = R$ 4,00. A compra mínima é R$ 40 (400 pontos)." },
  { q: "Como compro pontos?", tags: ["comprar", "compra", "pix", "pagar", "pagamento"],
    a: "Na página Comprar pontos (/experimente): escolha a quantidade (mínimo 400), informe e-mail e nome, pague o Pix. Os pontos caem na sua conta em segundos, junto com uma senha de acesso que também vai por e-mail." },
  { q: "Os pontos expiram?", tags: ["expira", "expiram", "validade", "prazo"],
    a: "Não. Seus pontos são seus para sempre: use hoje, amanhã ou daqui a um ano." },
  { q: "Preciso instalar alguma coisa?", tags: ["instalar", "baixar", "download", "app"],
    a: "Não. O Moka funciona no navegador, no celular e no computador. Se quiser, dá pra instalar como aplicativo (o botão aparece na página inicial) — é grátis e não passa por loja." },
  { q: "O que é o modo avançado (BYOK)?", tags: ["avançado", "byok", "chave", "api", "licença"],
    a: "É o modo para quem já tem a própria chave de IA (OpenAI, DeepSeek etc.). Com a licença de R$ 50 por 6 meses, você usa o Moka inteiro com a SUA chave — os gastos de IA saem da sua conta do provedor, não dos pontos. A chave fica salva só no seu navegador." },
  { q: "O que é uma chave de API?", tags: ["api", "chave", "key", "o que é"],
    a: "É como uma senha que permite a um programa usar uma inteligência artificial (como a DeepSeek ou a OpenAI). Quem tem uma, pode usar o modo avançado. Quem não tem, simplesmente compra pontos — a IA da casa já está incluída, sem configurar nada." },
  { q: "Qual IA o Moka usa?", tags: ["ia", "llm", "modelo", "deepseek", "openai", "groq"],
    a: "A mesma família de modelos que roda 7 portais de notícias todos os dias: DeepSeek V4 para texto, Groq Whisper para transcrição de áudio e OpenAI para voz. Tudo medido para custar pouco e funcionar bem em português." },
  { q: "O Moka funciona em outros idiomas?", tags: ["idioma", "língua", "inglês", "espanhol", "tradução"],
    a: "Sim. A interface fala 12 idiomas (bandeirinha no topo), o Moka detecta automaticamente o idioma do vídeo ou livro e responde no SEU idioma. Um vídeo em inglês vira resumo em português sem você configurar nada." },
  { q: "E se o pagamento não cair?", tags: ["pagamento", "não caiu", "problema", "pix", "erro"],
    a: "O Pix confirma em segundos, mas se algo travar, os pontos são reconciliados automaticamente (nosso sistema confere com o Mercado Pago). Persistindo, fale com a gente na comunidade que resolvemos na hora." },
  { q: "Como vejo meu saldo e histórico?", tags: ["saldo", "painel", "histórico", "extrato"],
    a: "No seu painel (/painel na página de compra): entre com o e-mail e a senha que você recebeu na compra. Lá aparecem saldo, pontos consumidos e as últimas ações." },
  { q: "Quem faz o Moka?", tags: ["quem", "cafezinho", "empresa", "time"],
    a: "O Moka é do time de O Cafezinho — a mesma IA que roda 7 portais de notícias todos os dias (riocarta.com, globalsouth.news e outros)." },
  { q: "Meus dados ficam seguros?", tags: ["dados", "privacidade", "segurança", "seguro"],
    a: "Sim. Seus livros e vídeos ficam no seu navegador. No modo avançado, sua chave nunca sai do seu aparelho. Nos pagamentos, só guardamos e-mail, nome e pontos — o dinheiro é do Mercado Pago, não passa pelas nossas mãos." },
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
          <CloseAppButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="help-body">
        <p className="help-kicker">Central de ajuda</p>
        <h1 className="help-title">Como o Moka funciona</h1>

        {/* Robô de dúvidas */}
        <section className="help-robo">
          <h2>🤖 Pergunte ao robô</h2>
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

        {/* Busca */}
        <input
          className="help-busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar na ajuda (ex.: pontos, Pix, licença…)"
        />

        {/* Tópicos */}
        <div className="help-lista">
          {filtrados.map((f) => (
            <details key={f.q} className="help-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          {filtrados.length === 0 && (
            <p className="help-vazio">Nada encontrado — pergunta pro robô ali em cima 🤖</p>
          )}
        </div>

        {/* Comunidade */}
        <section className="help-comunidade">
          <h2>💬 Comunidade</h2>
          <p>
            Dúvidas, ideias e conversa direta com o time:{" "}
            <a href="https://t.me/mokacomunidade" target="_blank" rel="noreferrer">
              entre na comunidade do Moka no Telegram →
            </a>
          </p>
        </section>
      </div>

      <style jsx>{`
        .help { min-height: 100vh; background: #fff6ee; color: #1a1a1a; }
        .help-topbar { background: #fff6ee; border-bottom: 1px solid #d9c8b8; }
        .help-body { max-width: 640px; margin: 0 auto; padding: 40px 22px 64px; }
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
    </main>
  );
}
