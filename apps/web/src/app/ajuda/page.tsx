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

const FAQ_PT: Faq[] = [
  { q: "O que é o Moka?", tags: ["moka", "que", "é", "app", "aplicativo"],
    a: "O Moka é um leitor com inteligência artificial: ele resume vídeos do YouTube e livros (EPUB/PDF) em minutos, traduz, explica, identifica personagens e responde perguntas sobre o conteúdo — no seu idioma. E é GRATUITO." },
  { q: "O Moka é grátis mesmo?", tags: ["grátis", "gratuito", "preço", "custa", "valor", "quanto", "pontos", "ponto", "créditos", "saldo"],
    a: "Sim — o Moka é grátis de verdade: você não compra nada aqui. A IA roda com a SUA chave de API (a chave da sua inteligência artificial), e você paga o provedor diretamente pelo que usar — centavos por livro/vídeo. Se quiser apoiar o projeto, tem o botão de doação no rodapé. ☕" },
  { q: "Quanto vou gastar com a minha própria API?", tags: ["gasto", "custo", "api", "provedor", "estimativa", "400", "paginas", "páginas"],
    a: "Pouco: com a IA mais econômica (DeepSeek V4 Flash), resumir um livro de 400 páginas custa centavos. Com modelos premium (Claude Opus, GPT-5), sobe pra centavos/reais por livro. Veja o Ranking de Preços das IAs aqui embaixo — dá pra comparar e escolher." },
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
    a: "Não. O Moka funciona no navegador, no celular e no computador. Se quiser, dá pra instalar como aplicativo — é grátis." },
  { q: "Preciso criar conta?", tags: ["conta", "cadastro", "login", "google", "email", "senha", "registrar"],
    a: "Não é obrigatório — mas vale a pena: entrando com Google ou e-mail, sua biblioteca (livros, anotações, traduções e progresso) fica guardada na nuvem e abre em qualquer aparelho." },
  { q: "Quem faz o Moka?", tags: ["quem", "cafezinho", "empresa", "time"],
    a: "O Moka é feito pelo time de O Cafezinho, com carinho de jornalista e precisão de engenharia. É gratuito — quem quiser apoiar, tem a doação no rodapé (PayPal e Pix)." },
];

const FAQ_EN: Faq[] = [
  { q: "What is Moka?", tags: ["moka", "what", "is", "app"],
    a: "Moka is a reader with artificial intelligence: it summarizes YouTube videos and books (EPUB/PDF) in minutes, translates, explains, identifies characters and answers questions about the content — in your language. And it's FREE." },
  { q: "Is Moka really free?", tags: ["free", "price", "cost", "how much", "credits", "points"],
    a: "Yes — Moka is truly free: you don't buy anything here. The AI runs with YOUR API key (your AI's key), and you pay the provider directly for what you use — pennies per book/video. If you want to support the project, there's a donation button in the footer. ☕" },
  { q: "How much will I spend with my own API?", tags: ["spend", "cost", "api", "provider", "estimate", "400", "pages"],
    a: "Very little: with the cheapest AI (DeepSeek V4 Flash), summarizing a 400-page book costs pennies. With premium models (Claude Opus, GPT-5), it goes up to cents per book. See the AI Price Ranking below — you can compare and choose." },
  { q: "How do I get an API key?", tags: ["buy", "purchase", "key", "api", "get", "where"],
    a: "In 1 minute, on the provider's website you choose (DeepSeek, OpenAI, Z.ai, Qwen, Kimi, Anthropic, Gemini...): create an account, generate the key and paste it in Moka's ⚙️ Settings. It's stored only on your device, encrypted — never goes through our servers." },
  { q: "Does video use the same key?", tags: ["video", "youtube", "transcribe", "caption", "whisper", "audio"],
    a: "Careful: video is ANOTHER system. Video WITH captions is free and costs nothing. Video WITHOUT captions needs an audio transcription API (e.g.: OpenAI/Whisper) — not every text API works for this. Price: ~US$ 0.04–0.36 per hour of video, depending on the service." },
  { q: "What is an API key?", tags: ["api", "what is", "password", "works"],
    a: "It's like a password that connects Moka to the AI you chose (DeepSeek, OpenAI…). You create yours for free on the provider's website and add credit there (card) — Moka doesn't sell credit. The complete step-by-step is in /tutorial." },
  { q: "Which AI should I choose?", tags: ["ai", "llm", "model", "deepseek", "openai", "groq", "claude", "gemini", "choose", "best"],
    a: "To start: the most economical that works very well is DeepSeek V4 Flash (pennies per book). If you want maximum literary quality, Claude and GPT-5 are the premium ones — and cost more. The Price Ranking below compares all models Moka accepts." },
  { q: "Is my key safe?", tags: ["data", "privacy", "security", "safe", "key", "server"],
    a: "Yes. Your key stays only on your device (encrypted in the browser) — never goes to our servers. Your books and videos also stay on your device; if you sign in with Google/email, your library syncs to the cloud to open on any device." },
  { q: "Does Moka work in other languages?", tags: ["language", "english", "spanish", "translation"],
    a: "Yes. The interface speaks 12 languages (flag at the top), Moka automatically detects the language of the video or book and responds in YOUR language. An English video becomes a summary in Portuguese without you configuring anything." },
  { q: "Do I need to install anything?", tags: ["install", "download", "app"],
    a: "No. Moka works in the browser, on your phone and computer. If you want, you can install it as an app — it's free." },
  { q: "Do I need to create an account?", tags: ["account", "signup", "login", "google", "email", "password", "register"],
    a: "It's not mandatory — but worth it: signing in with Google or email, your library (books, notes, translations and progress) is saved in the cloud and opens on any device." },
  { q: "Who makes Moka?", tags: ["who", "cafezinho", "company", "team"],
    a: "Moka is made by the O Cafezinho team, with a journalist's care and engineering precision. It's free — if you want to support it, there's a donation button in the footer (PayPal and Pix)." },
];

/** Normaliza (minúsculas, sem acento) pra busca e pro robô. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Robô de dúvidas: pontua cada item do FAQ por palavras da pergunta. */
function responder(pergunta: string, faqList: Faq[]): string {
  const palavras = norm(pergunta).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let melhor: Faq | null = null;
  let melhorScore = 0;
  for (const item of faqList) {
    const alvo = norm(item.q + " " + item.tags.join(" "));
    let score = 0;
    for (const p of palavras) if (alvo.includes(p)) score += p.length > 5 ? 2 : 1;
    if (score > melhorScore) { melhorScore = score; melhor = item; }
  }
  if (!melhor || melhorScore < 2) {
    return lang_fallback_noanswer();
  }
  return melhor.a;
}

function lang_fallback_noanswer(): string {
  return "Hmm, not sure about that one. Try asking differently — or bring it to the community. Meanwhile, the topics below cover the essentials. 👇";
}

export default function Ajuda() {
  const { t, lang } = useI18n();
  const [busca, setBusca] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  // FAQ no idioma da interface (PT ou EN; outros idiomas usam EN como fallback).
  const FAQ = lang === "pt-BR" ? FAQ_PT : FAQ_EN;

  const filtrados = useMemo(() => {
    const q = norm(busca);
    if (!q) return FAQ;
    return FAQ.filter(
      (f) => norm(f.q).includes(q) || f.tags.some((tg) => norm(tg).includes(q)) || norm(f.a).includes(q),
    );
  }, [busca, FAQ]);

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

        <p className="help-kicker">{t("help_center")}</p>
        <h1 className="help-title">{t("help_how_works")}</h1>

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
              if (pergunta.trim()) setResposta(responder(pergunta, FAQ));
            }}
          >
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder="Ex.: quanto custa traduzir um livro?"
            />
            <button type="submit">{t("help_ask_btn")}</button>
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
          <h2>💬 {t("help_community_title")}</h2>
          <p>
            {t("help_community_desc")}{" "}
            <a href="https://t.me/mokareader" target="_blank" rel="noreferrer">
              {t("help_community_link")} →
            </a>
          </p>
        </section>
      </div>

            {/* CSS migrado para globals.css — cura o FOUC (era <style jsx>) */}
          <SiteFooter />
    </main>
  );
}
