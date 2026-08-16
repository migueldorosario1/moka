import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — Moka",
  description: "Como o Moka trata seus dados.",
  alternates: { canonical: "/privacidade" },
};

/**
 * Página /privacidade — Política de Privacidade.
 *
 * Explica claramente o que o app coleta, como usa e os direitos do usuário.
 * Linkada na capa (Uploader), Configurações e na página /sobre.
 */
export default function PrivacidadePage() {
  return (
    <main className="info-page">
      <article className="info-card">
        <a href="/" className="info-back">← Moka</a>

        <h1>Política de Privacidade</h1>
        <p className="info-updated">Última atualização: julho de 2026</p>

        <h2>1. Resumo</h2>
        <p>
          O <strong>Moka</strong> foi projetado com a privacidade como prioridade.
          Suas chaves de IA e seus livros ficam <strong>no seu dispositivo</strong>.
          Nós não temos acesso a eles.
        </p>

        <h2>2. Dados que coletamos</h2>
        <p>
          Quando você faz login com o Google, armazenamos apenas:
        </p>
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
        <p>
          Você pode, a qualquer momento:
        </p>
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

        <p className="info-footer">
          <a href="/sobre">← Voltar para Quem Somos</a>
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
          margin-bottom: 24px;
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
