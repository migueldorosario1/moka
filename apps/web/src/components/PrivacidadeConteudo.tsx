"use client";

import { AuthGate } from "@/components/AuthGate";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/components/I18nProvider";

/**
 * CONTEÚDO da página /privacidade — client e BILÍNGUE (ordem do Miguel,
 * 06/09: "tem que ter a bandeirinha e o botão de entrar em cima"). PT para
 * português; inglês para todos os outros idiomas (língua franca — o revisor
 * do Google Play lê a versão EN). O wrapper server (app/privacidade/page.tsx)
 * cuida dos metadados SEO.
 */
export function PrivacidadeConteudo() {
  const { lang } = useI18n();
  const pt = lang.startsWith("pt");

  return (
    <main className="info-page">
      <div className="info-topbar">
        <a href="/" className="info-back">← Moka</a>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <AuthGate />
          <LangSwitcher />
        </div>
      </div>

      <article className="info-card">
        {pt ? (
          <>
            <h1>Política de Privacidade</h1>
            <p className="info-updated">Última atualização: julho de 2026</p>

            <h2>1. Resumo</h2>
            <p>
              O <strong>Moka</strong> foi projetado com a privacidade como prioridade.
              Suas chaves de IA e seus livros ficam <strong>no seu dispositivo</strong>.
              Nós não temos acesso a eles.
            </p>

            <h2>2. Dados que coletamos</h2>
            <p>Quando você faz login com o Google, armazenamos apenas:</p>
            <ul>
              <li>Seu nome e foto de perfil (do Google)</li>
              <li>Seu email (para identificar sua conta)</li>
            </ul>
            <p>
              Seus livros, anotações, marcadores e progresso de leitura são
              sincronizados com sua conta na nuvem (Supabase) — mas somente você
              tem acesso a eles.
            </p>

            <h2>3. Chaves de IA (BYOK)</h2>
            <p>
              Quando você cadastra uma chave de API (DeepSeek, OpenAI, etc.), ela é
              <strong> criptografada (AES-GCM 256)</strong> e armazenada somente no
              seu navegador (localStorage). Ninguém — nem nós — pode ver sua chave
              em texto legível.
            </p>
            <p>
              A chave é enviada ao provedor de IA escolhido APENAS no momento da
              tradução/explicação, passando pelo nosso proxy que a repassa
              imediatamente. Não armazenamos a chave no servidor.
            </p>

            <h2>4. Conteúdo dos livros</h2>
            <p>
              O texto dos livros que você traduz/explica é enviado ao provedor de IA
              escolhido para processamento. O Moka não armazena esse conteúdo — ele
              passa diretamente do seu dispositivo para o provedor.
            </p>
            <p>
              O arquivo PDF em si nunca sai do seu dispositivo (não é enviado à
              nuvem). EPUBs têm seu conteúdo sincronizado em texto.
            </p>

            <h2>5. Login Google</h2>
            <p>
              Usamos o Google OAuth para autenticação. O Google nos fornece apenas
              seu nome, email e foto. Não temos acesso à sua senha ou a outros
              dados do Google.
            </p>

            <h2>6. Cookies</h2>
            <p>
              Usamos cookies HttpOnly necessários para manter sua sessão ativa
              (login). Não usamos cookies de rastreamento ou publicidade.
            </p>

            <h2>7. Seus direitos</h2>
            <p>Você pode, a qualquer momento:</p>
            <ul>
              <li>Excluir todos os seus dados da nuvem (removendo os livros da estante)</li>
              <li>Excluir todas as chaves de IA do seu dispositivo</li>
              <li>Fazer logout da sua conta Google</li>
            </ul>

            <h2>8. Contato</h2>
            <p>
              Em caso de dúvidas sobre privacidade, escreva para:
              <br />
              <strong>migueldorosario@gmail.com</strong>
            </p>

            <h2>9. Responsável</h2>
            <p>
              Cafezinho Media Group<br />
              Niterói, RJ — Brasil
            </p>
          </>
        ) : (
          <>
            <h1>Privacy Policy</h1>
            <p className="info-updated">Last updated: July 2026</p>

            <h2>1. Summary</h2>
            <p>
              <strong>Moka</strong> is designed with privacy as a priority.
              Your AI keys and your books stay <strong>on your device</strong>.
              We have no access to them.
            </p>

            <h2>2. Data we collect</h2>
            <p>When you sign in with Google, we store only:</p>
            <ul>
              <li>Your name and profile picture (from Google)</li>
              <li>Your email (to identify your account)</li>
            </ul>
            <p>
              Your books, notes, bookmarks and reading progress are synced with
              your cloud account (Supabase) — but only you have access to them.
            </p>

            <h2>3. AI keys (BYOK)</h2>
            <p>
              When you register an API key (DeepSeek, OpenAI, etc.), it is
              <strong> encrypted (AES-GCM 256)</strong> and stored only in your
              browser (localStorage). Nobody — not even us — can read your key
              in plain text.
            </p>
            <p>
              The key is sent to the AI provider of your choice ONLY at the
              moment of translation/explanation, passing through our proxy
              which forwards it immediately. We never store the key on our
              server.
            </p>

            <h2>4. Book content</h2>
            <p>
              The text of the books you translate/explain is sent to the chosen
              AI provider for processing. Moka does not store this content — it
              goes straight from your device to the provider.
            </p>
            <p>
              The PDF file itself never leaves your device (it is not uploaded
              to the cloud). EPUBs have their content synced as text.
            </p>

            <h2>5. Google sign-in</h2>
            <p>
              We use Google OAuth for authentication. Google provides us only
              with your name, email and picture. We have no access to your
              password or any other Google data.
            </p>

            <h2>6. Cookies</h2>
            <p>
              We use strictly necessary HttpOnly cookies to keep your session
              active (login). We do not use tracking or advertising cookies.
            </p>

            <h2>7. Your rights</h2>
            <p>At any time, you can:</p>
            <ul>
              <li>Delete all your cloud data (by removing the books from your shelf)</li>
              <li>Delete all AI keys from your device</li>
              <li>Sign out of your Google account</li>
            </ul>

            <h2>8. Contact</h2>
            <p>
              For privacy questions, write to:
              <br />
              <strong>migueldorosario@gmail.com</strong>
            </p>

            <h2>9. Data controller</h2>
            <p>
              Cafezinho Media Group<br />
              Niterói, RJ — Brazil
            </p>
          </>
        )}

        <p className="info-footer">
          <a href="/sobre">{pt ? "← Voltar para Quem Somos" : "← Back to About Us"}</a>
        </p>
      </article>

      <style>{`
        .info-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-sans);
          padding: 40px 20px;
        }
        .info-topbar {
          max-width: 680px;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .info-card {
          max-width: 680px;
          margin: 0 auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 40px 48px;
          box-shadow: var(--shadow);
        }
        .info-back {
          display: inline-block;
          color: var(--accent);
          text-decoration: none;
          font-size: 14px;
        }
        .info-card h1 { font-family: var(--font-brand); font-weight: 600;
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px;
          color: var(--accent);
        }
        .info-updated {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0 0 24px;
        }
        .info-card h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 28px 0 12px;
        }
        .info-card p {
          font-size: 15px;
          line-height: 1.8;
          margin: 0 0 16px;
        }
        .info-card strong {
          font-weight: 600;
        }
        .info-card ul {
          margin: 0 0 16px;
          padding-left: 24px;
        }
        .info-card li {
          font-size: 15px;
          line-height: 1.8;
          margin-bottom: 6px;
        }
        .info-footer {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }
        .info-footer a {
          color: var(--accent);
          text-decoration: none;
        }
        @media (max-width: 600px) {
          .info-card {
            padding: 24px 20px;
          }
        }
      `}</style>
    </main>
  );
}
