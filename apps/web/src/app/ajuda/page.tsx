import { Metadata } from "next";
import { LangSwitcher } from "@/components/LangSwitcher";

export const metadata: Metadata = {
  title: "Ajuda — Moka",
  description: "Tutorial completo: ícones, funcionalidades e planos do Moka.",
};

/**
 * Página /ajuda — Tutorial completo do Moka.
 *
 * Explica cada ícone, cada funcionalidade, como configurar a IA,
 * e os planos (Free, Cappuccino, Espresso).
 */
export default function AjudaPage() {
  return (
    <main className="info-page">
      <article className="info-card">
        <div className="info-topbar"><a href="/" className="info-back">← Moka</a><LangSwitcher /></div>

        <h1>❓ Ajuda — Tutorial do Moka</h1>

        <p className="info-intro">
          Bem-vindo ao <strong>Moka</strong>! Este guia explica tudo o que você
          precisa saber para aproveitar ao máximo seu leitor inteligente.
        </p>

        {/* ─── ÍCONES DO MENU ─── */}
        <h2>📖 Ícones do menu superior</h2>
        <p>Cada ícone no menu do leitor tem uma função específica:</p>

        <div className="icon-guide">
          <div className="icon-row">
            <span className="icon-emoji">☕</span>
            <div>
              <strong>Prateleira</strong> — Volta para a sua estante de livros
              (página inicial).
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">➕</span>
            <div>
              <strong>Abrir novo</strong> — Abre um novo arquivo PDF ou EPUB
              direto do seu dispositivo.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">📚</span>
            <div>
              <strong>Estante</strong> — Mesma função do ☕: volta pra prateleira.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">📓</span>
            <div>
              <strong>Anotações</strong> — Abre suas anotações salvas: traduções,
              explicações, perguntas e marcadores da página.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🏷</span>
            <div>
              <strong>Marcar página</strong> — Cria um marcador (bookmark) na
              página atual. Fica salvo para você voltar depois.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🔖</span>
            <div>
              <strong>Marcadores</strong> — Lista todos os marcadores do livro.
              Clica num marcador pra ir direto praquela página.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">📸</span>
            <div>
              <strong>Foto da página</strong> — Salva uma imagem (PNG) da página
              atual no seu dispositivo. Ótimo para guardar citações.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🔊</span>
            <div>
              <strong>Ler em voz alta</strong> — O Moka lê a página em voz alta.
              Com OpenAI, usa voz neural natural (qualidade de pessoa). Sem
              OpenAI, usa a voz do dispositivo. <br />
              <em>Controles: 🔊 tocar · ⏸ pausar · ▶️ continuar · ⏹ parar</em>
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🎤</span>
            <div>
              <strong>Perguntar por voz</strong> — Abre o painel da IA para você
              <strong> falar</strong> sua pergunta sobre o livro (em vez de
              digitar). O Moka transcreve sua voz e a IA responde.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🌐</span>
            <div>
              <strong>Traduzir página</strong> — Traduz a página inteira para o
              idioma escolhido nas Configurações. Mostra confirmação antes de
              traduzir.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">🧠</span>
            <div>
              <strong>Explicar página</strong> — A IA explica o conteúdo da
              página inteira. Mostra confirmação antes de explicar.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">⚙️</span>
            <div>
              <strong>Configurações</strong> — Abre as configurações de IA:
              provedor, chave de API, modelo, idiomas e planos.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">⛶</span>
            <div>
              <strong>Tela cheia</strong> — Entra no modo leitura em tela cheia.
              Todos os botões continuam acessíveis.
            </div>
          </div>
          <div className="icon-row">
            <span className="icon-emoji">👁</span>
            <div>
              <strong>Ocultar/Mostrar menu</strong> — (Só em tela cheia) Esconde
              o menu para leitura sem distrações. Clica de novo pra reabrir.
            </div>
          </div>
        </div>

        {/* ─── MENU DE SELEÇÃO ─── */}
        <h2>✏️ Selecionar texto</h2>
        <p>
          Quando você seleciona um trecho do texto (arrastando o dedo ou o
          mouse), aparece um menu com <strong>3 opções</strong>:
        </p>
        <ul>
          <li><strong>🌐 Traduzir</strong> — Traduz só o trecho selecionado</li>
          <li><strong>🧠 Explicar</strong> — Explica só o trecho selecionado</li>
          <li><strong>🔊 Falar</strong> — Lê o trecho selecionado em voz alta</li>
        </ul>

        {/* ─── ZOOM ─── */}
        <h2>🔍 Zoom</h2>
        <p>
          Na lateral direita, há um controle vertical com <strong>+</strong> e
          <strong> −</strong> para ajustar o zoom do PDF. Você também pode
          <strong> pinçar com 2 dedos</strong> (afastar para aumentar, juntar
          para diminuir) — igual a qualquer app do iPad.
        </p>

        {/* ─── NAVEGAÇÃO ─── */}
        <h2>↔️ Passar páginas</h2>
        <p>Existem 3 formas de navegar entre páginas:</p>
        <ul>
          <li><strong>Slider inferior</strong> — arraste a barra horizontal embaixo pra pular páginas</li>
          <li><strong>Swipe</strong> — deslize o dedo da direita pra esquerda (próxima) ou esquerda pra direita (anterior)</li>
          <li><strong>Setas</strong> — use ‹ › no slider inferior</li>
        </ul>

        {/* ─── CONFIGURAÇÕES DE IA ─── */}
        <h2>🤖 Configurando a IA (plano Free)</h2>
        <p>
          No plano <strong>Free</strong>, você traz sua própria chave de API
          (BYOK). Veja como:
        </p>
        <ol>
          <li>Clica em <strong>⚙️ Configurações</strong></li>
          <li>Escolha um <strong>provedor</strong> (DeepSeek, OpenAI, Kimi, etc)</li>
          <li>Cole sua <strong>chave de API</strong> (obtida no site do provedor)</li>
          <li>Opcional: escolha um <strong>modelo</strong> específico</li>
          <li>Clique em <strong>Adicionar chave</strong></li>
          <li>Pode cadastrar vários provedores e alternar entre eles</li>
        </ol>
        <p>
          Suas chaves ficam <strong>criptografadas</strong> no seu dispositivo.
          Nunca saem do seu navegador (exceto para repassar ao provedor).
        </p>

        {/* ─── 3 IDIOMAS ─── */}
        <h2>🌐 Os 3 idiomas</h2>
        <p>O Moka tem 3 idiomas independentes nas Configurações:</p>
        <ul>
          <li><strong>🖥️ Idioma da interface</strong> — botões, menus e textos do app (12 idiomas)</li>
          <li><strong>📝 Idioma das traduções</strong> — para qual idioma a IA traduz e explica</li>
          <li><strong>🔊 Idioma do áudio</strong> — em qual idioma o Moka lê em voz alta ("Original" = idioma do livro)</li>
        </ul>

        {/* ─── PLANOS ─── */}
        <h2>☕ Planos do Moka</h2>
        <div className="plans-help">
          <div className="plan-help-card">
            <h3>☕ Free (Grátis)</h3>
            <p>
              Você traz sua própria chave de API. Todas as funcionalidades
              funcionam — tradução, explicação, voz, perguntas. A voz neural
              (natural) só funciona com OpenAI.
            </p>
          </div>
          <div className="plan-help-card">
            <h3>🥛 Cappuccino ($3.99/mês)</h3>
            <p>
              IA inclusa — não precisa configurar nada. Voz neural natural,
              traduzir livro inteiro, biblioteca na nuvem. O plano principal.
            </p>
          </div>
          <div className="plan-help-card">
            <h3>☕ Espresso ($9.99/mês)</h3>
            <p>
              Tudo do Cappuccino + Dante, o tutor de leitura. Dante lê o livro
              em vídeo, explica e conversa com você. Ideal para educação.
            </p>
          </div>
        </div>

        {/* ─── DICAS ─── */}
        <h2>💡 Dicas</h2>
        <ul>
          <li><strong>Toque duplo</strong> num parágrafo seleciona ele inteiro</li>
          <li><strong>Pinça com 2 dedos</strong> no PDF para dar zoom</li>
          <li><strong>Swipe horizontal</strong> para passar páginas</li>
          <li><strong>Clique no canto superior direito</strong> da página para marcar (atalho invisível)</li>
          <li>Todas as traduções e explicações são <strong>salvas automaticamente</strong> nas anotações</li>
        </ul>

        {/* ─── FAQ RÁPIDO ─── */}
        <h2>❓ Perguntas rápidas</h2>
        <details>
          <summary>Não consigo ouvir a voz neural natural</summary>
          <p>A voz neural (qualidade de pessoa) requer uma chave da OpenAI configurada. Vá em ⚙️ Configurações, adicione a OpenAI como provedor. Sem OpenAI, usa a voz do dispositivo.</p>
        </details>
        <details>
          <summary>Meus livros somem quando troco de aparelho</summary>
          <p>Faça login com o Google (botão Entrar). Suas anotações, marcadores e progresso sincronizam. PDFs ficam só no dispositivo (são grandes). EPUBs sincronizam completo.</p>
        </details>
        <details>
          <summary>O microfone não funciona</summary>
          <p>O microfone precisa de permissão do navegador. Na primeira vez, o Safari/Chrome pede permissão. Verifique nas configurações do navegador se o Moka tem acesso ao microfone.</p>
        </details>

        <p className="info-footer" style={{ marginTop: "32px" }}>
          <a href="/sobre">Quem Somos →</a>
          <span style={{ margin: "0 8px" }}>·</span>
          <a href="/privacidade">Privacidade →</a>
          <span style={{ margin: "0 8px" }}>·</span>
          <a href="/premium">Planos →</a>
        </p>

        <div className="premium-footer">
          <p>
            <strong>Moka</strong> — Leia qualquer coisa. Entenda tudo.<br />
            Um produto do Cafezinho Media Group — Niterói, RJ — Brasil
          </p>
        </div>
      </article>

      <style>{`
        .info-page { min-height: 100vh; background: var(--bg); padding: 40px 20px; }
        .info-card { max-width: 680px; margin: 0 auto; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 40px 48px; box-shadow: var(--shadow); }
        .info-back { color: var(--accent); text-decoration: none; margin-bottom: 24px; font-size: 14px; display: inline-block; }
        .info-card h1 { font-family: var(--font-brand); font-weight: 600; font-size: 26px; font-weight: 700; color: var(--accent); margin: 0 0 16px; }
        .info-intro { font-size: 15px; line-height: 1.7; color: var(--text); margin: 0 0 24px; }
        .info-card h2 { font-size: 19px; font-weight: 600; margin: 32px 0 12px; color: var(--text); }
        .info-card p { font-size: 15px; line-height: 1.7; margin: 0 0 12px; }
        .info-card ul, .info-card ol { margin: 0 0 16px; padding-left: 24px; }
        .info-card li { font-size: 14px; line-height: 1.8; margin-bottom: 6px; }
        .info-card strong { font-weight: 600; }
        .info-card em { color: var(--text-muted); }
        .icon-guide { display: flex; flex-direction: column; gap: 14px; margin: 16px 0 24px; }
        .icon-row { display: flex; gap: 14px; align-items: flex-start; padding: 12px; background: var(--surface-alt); border-radius: 10px; }
        .icon-emoji { font-size: 26px; flex-shrink: 0; width: 40px; text-align: center; }
        .icon-row div { font-size: 14px; line-height: 1.6; }
        .plans-help { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
        .plan-help-card { padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-alt); }
        .plan-help-card h3 { margin: 0 0 8px; font-size: 16px; color: var(--accent); }
        .plan-help-card p { margin: 0; font-size: 14px; line-height: 1.6; }
        .info-card details { margin-bottom: 12px; }
        .info-card summary { cursor: pointer; font-size: 15px; font-weight: 500; padding: 8px 0; }
        .info-card details[open] summary { color: var(--accent); }
        .info-footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); }
        .info-footer a { color: var(--accent); text-decoration: none; font-size: 14px; }
        .premium-footer { text-align: center; margin-top: 20px; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
        @media (max-width: 600px) { .info-card { padding: 24px 20px; } }
      `}</style>
    </main>
  );
}
