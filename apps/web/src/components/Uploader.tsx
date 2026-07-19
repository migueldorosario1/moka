"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";

interface UploaderProps {
  onFile: (file: File) => void;
  error?: string | null;
  /** Se a IA está configurada (pra mostrar aviso de setup). */
  configReady?: boolean;
  /** Abre as configurações. */
  onOpenSettings?: () => void;
}

/**
 * Tela inicial (onboarding + upload).
 * Apresenta o app, explica o que faz, avisa se a IA não tá configurada,
 * e aceita .epub/.pdf por arrastar-soltar ou clique.
 */
export function Uploader({ onFile, error, configReady = true, onOpenSettings }: UploaderProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className="uploader-page">
      <div className="uploader-card">
        {/* Hero — xícara com vapor subindo (a assinatura do Moka) */}
        <div className="hero">
          <div className="logo" aria-hidden>
            <span className="steam steam-1" />
            <span className="steam steam-2" />
            <span className="steam steam-3" />
            <span className="logo-cup">☕</span>
          </div>
          <h1 className="brand-name">Moka</h1>
          <p className="tagline">{t("app_tagline")}</p>
          <p className="subtitle">{t("upload_hero_desc")}</p>
        </div>

        {/* Features */}
        <div className="features">
          <div className="feature">
            <span className="feature-icon">🌐</span>
            <span className="feature-text">{t("upload_feat_translate")}</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🧠</span>
            <span className="feature-text">{t("upload_feat_explain")}</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📄</span>
            <span className="feature-text">{t("upload_feat_formats")}</span>
          </div>
        </div>

        {/* Aviso: IA não configurada */}
        {!configReady && (
          <div className="setup-warning" onClick={onOpenSettings} role="button">
            <span className="setup-icon">⚠️</span>
            <div className="setup-content">
              <strong>{t("upload_config_needed")}</strong>
              <span>{t("upload_config_desc")}</span>
            </div>
            <span className="setup-arrow">⚙️ →</span>
          </div>
        )}

        {/* Dropzone */}
        <label
          className={`dropzone ${dragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".epub,.pdf,application/epub+zip,application/pdf"
            onChange={handleChange}
            hidden
          />
          <div className="dropzone-inner">
            <div className="dropzone-icon" aria-hidden>
              📖
            </div>
            <p className="dropzone-title">
              {t("upload_dropzone")} <span>{t("upload_click")}</span>
            </p>
            <p className="dropzone-formats">{t("upload_format_hint")}</p>
          </div>
        </label>

        {error && (
          <p className="uploader-error" role="alert">
            ⚠️ {error}
          </p>
        )}

        {/* Badge de privacidade */}
        <div className="privacy-badge">
          🔒 <span>{t("upload_privacy")}</span>
        </div>

        {/* Links: Quem Somos + Privacidade */}
        <div className="uploader-links">
          <a href="/sobre">Quem Somos</a>
          <span>·</span>
          <a href="/privacidade">Privacidade</a>
        </div>
      </div>

      <style jsx>{`
        .uploader-page {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          overflow-y: auto;
        }
        .uploader-card {
          max-width: 500px;
          width: 100%;
          text-align: center;
        }

        /* Hero */
        .hero {
          margin-bottom: 36px;
          position: relative;
        }
        /* Crema — brilho radial quente atrás da xícara */
        .hero::before {
          content: "";
          position: absolute;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          width: 340px;
          height: 260px;
          background: radial-gradient(
            ellipse at center,
            var(--accent-soft) 0%,
            transparent 65%
          );
          opacity: 0.9;
          pointer-events: none;
          z-index: -1;
        }
        .logo {
          position: relative;
          display: inline-block;
          font-size: 58px;
          line-height: 1;
          margin-bottom: 12px;
        }
        .logo-cup {
          display: inline-block;
          filter: drop-shadow(0 6px 14px rgba(62, 42, 24, 0.18));
        }
        /* Vapor — três fios sutis subindo da xícara */
        .steam {
          position: absolute;
          bottom: 92%;
          left: 50%;
          width: 3px;
          height: 26px;
          border-radius: 999px;
          background: linear-gradient(to top, var(--gold), transparent);
          opacity: 0;
          filter: blur(1.5px);
          animation: steam-rise 3.4s ease-in-out infinite;
        }
        .steam-1 { margin-left: -12px; animation-delay: 0s; }
        .steam-2 { margin-left: -2px; height: 32px; animation-delay: 1.1s; }
        .steam-3 { margin-left: 8px; animation-delay: 2.2s; }
        @keyframes steam-rise {
          0% { transform: translateY(6px) scaleY(0.6); opacity: 0; }
          30% { opacity: 0.55; }
          70% { opacity: 0.25; }
          100% { transform: translateY(-16px) scaleY(1.1); opacity: 0; }
        }
        .brand-name {
          font-family: var(--font-brand);
          font-size: 42px;
          font-weight: 600;
          margin: 0 0 6px;
          letter-spacing: 0.005em;
          background: linear-gradient(
            160deg,
            var(--accent-dark) 20%,
            var(--accent) 65%,
            var(--gold)
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .tagline {
          font-family: var(--font-brand);
          font-style: italic;
          color: var(--text-muted);
          margin: 0 0 14px;
          font-size: var(--text-lg);
        }
        .subtitle {
          color: var(--text);
          margin: 0 auto;
          max-width: 40ch;
          font-size: var(--text-base);
          line-height: 1.65;
        }

        /* Features — fichas suaves, como etiquetas de pacote de café */
        .features {
          display: flex;
          justify-content: center;
          gap: var(--space-3);
          margin-bottom: 32px;
          flex-wrap: wrap;
        }
        .feature {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--surface);
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-pill);
          box-shadow: var(--shadow-sm);
        }
        .feature-icon {
          font-size: 16px;
        }
        .feature-text {
          font-size: var(--text-sm);
          color: var(--text-muted);
          font-weight: 500;
          white-space: nowrap;
        }

        /* Aviso de configuração */
        .setup-warning {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 14px 18px;
          background: var(--accent-soft);
          border: 1px solid var(--gold);
          border-radius: var(--radius);
          margin-bottom: 20px;
          cursor: pointer;
          transition: border-color var(--transition), box-shadow var(--transition);
          text-align: left;
        }
        .setup-warning:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow);
        }
        .setup-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .setup-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .setup-content strong {
          font-size: var(--text-sm);
          color: var(--accent-dark);
        }
        .setup-content span {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .setup-arrow {
          font-size: var(--text-sm);
          color: var(--accent);
          flex-shrink: 0;
        }

        /* Dropzone — bandeja acolhedora */
        .dropzone {
          display: block;
          padding: 52px 28px;
          border: 1.5px dashed var(--border);
          border-radius: var(--radius-lg);
          background: var(--surface);
          box-shadow: var(--shadow-sm);
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition),
            box-shadow var(--transition), transform var(--transition);
        }
        .dropzone:hover,
        .dropzone.is-dragging {
          border-color: var(--accent);
          background: linear-gradient(180deg, var(--surface), var(--accent-soft));
          box-shadow: var(--shadow);
          transform: translateY(-2px);
        }
        .dropzone-icon {
          font-size: 38px;
          margin-bottom: var(--space-3);
          filter: drop-shadow(0 3px 6px rgba(62, 42, 24, 0.12));
        }
        .dropzone-title {
          margin: 0 0 6px;
          font-size: var(--text-base);
        }
        .dropzone-title span {
          color: var(--accent);
          font-weight: 600;
        }
        .dropzone-formats {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--text-xs);
          letter-spacing: 0.02em;
        }

        /* Erro */
        .uploader-error {
          margin: 16px 0 0;
          padding: 12px 16px;
          background: var(--accent-soft);
          border-radius: var(--radius);
          color: var(--accent-dark);
          font-size: var(--text-sm);
          text-align: left;
          border: 1px solid var(--gold);
        }

        /* Badge de privacidade */
        .privacy-badge {
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          margin-top: 32px;
          color: var(--text-muted);
          font-size: var(--text-xs);
          padding: 8px 16px;
          background: var(--surface-alt);
          border-radius: var(--radius-pill);
          display: inline-flex;
        }
        .privacy-badge span {
          color: var(--text-muted);
        }

        @media (max-width: 600px) {
          .features {
            gap: var(--space-2);
          }
        }
        .uploader-links {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: center;
          margin-top: 20px;
          font-size: 13px;
        }
        .uploader-links a {
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
        }
        .uploader-links a:hover {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .uploader-links span {
          color: var(--border);
        }
      `}</style>
    </div>
  );
}
