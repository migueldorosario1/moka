"use client";

import Link from "next/link";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useI18n } from "@/components/I18nProvider";

/** Links diretos pra pegar a chave (neutros de idioma). */
const PROVIDERS: { nome: string; url: string; nota: string }[] = [
  { nome: "DeepSeek", url: "https://platform.deepseek.com/", nota: "a mais usada no Moka ☕" },
  { nome: "Z.ai (GLM)", url: "https://open.bigmodel.cn/", nota: "a mais barata de todas" },
  { nome: "OpenAI", url: "https://platform.openai.com/api-keys", nota: "também transcreve vídeo (Whisper)" },
  { nome: "Qwen (Alibaba)", url: "https://bailian.console.aliyun.com/", nota: "" },
  { nome: "Kimi (Moonshot)", url: "https://platform.moonshot.ai/", nota: "pesquisa profunda" },
  { nome: "Anthropic (Claude)", url: "https://console.anthropic.com/", nota: "premium literário" },
  { nome: "Google Gemini", url: "https://aistudio.google.com/apikey", nota: "tem nível grátis" },
  { nome: "Groq", url: "https://console.groq.com/keys", nota: "o mais rápido do mundo" },
];

/**
 * /tutorial — o tutorial completo do usuário BYOK (pedido do Miguel, 05/08):
 * passo a passo + a matemática do "quanto vai custar" (tokens → preço),
 * com links diretos pra cada provedor. Nos 12 idiomas.
 */
export default function Tutorial() {
  const { t } = useI18n();

  const steps = [
    { n: "1", title: t("tut_s1_t"), desc: t("tut_s1_d"), link: { href: "/ajuda", label: "🏆 Ranking de preços →" } },
    { n: "2", title: t("tut_s2_t"), desc: t("tut_s2_d"), providers: true },
    { n: "3", title: t("tut_s3_t"), desc: t("tut_s3_d") },
    { n: "4", title: t("tut_s4_t"), desc: t("tut_s4_d1"), extra: [t("tut_s4_d2"), t("tut_s4_d3")] },
    { n: "5", title: t("tut_s5_t"), desc: t("tut_s5_d") },
  ];

  return (
    <main className="igot-shell ft">
      <div className="igot-topbar">
        <div className="igot-topbar-left">
          <Link href="/" className="brand" title="MOKA — Ir para página central">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>MOKA</span>
          </Link>
        </div>
        <div className="igot-topbar-actions">
          <LangSwitcher />
        </div>
      </div>

      <div className="capa-body" style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 className="capa-tagline" style={{ fontSize: 26 }}>{t("tut_title")}</h1>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.6, marginTop: 8 }}>{t("tut_intro")}</p>

        <div className="tut-steps">
          {steps.map((s) => (
            <section key={s.n} className="tut-step">
              <div className="tut-num">{s.n}</div>
              <div className="tut-content">
                <h2>{s.title}</h2>
                <p>{s.desc}</p>
                {s.extra?.map((x, i) => <p key={i}>{x}</p>)}
                {s.link && (
                  <p>
                    <Link href={s.link.href} className="tut-link">{s.link.label}</Link>
                  </p>
                )}
                {s.providers && (
                  <ul className="tut-providers">
                    {PROVIDERS.map((p) => (
                      <li key={p.nome}>
                        <a href={p.url} target="_blank" rel="noreferrer">{p.nome} →</a>
                        {p.nota && <span> · {p.nota}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="tut-video-note">
          <p>{t("tut_video")}</p>
        </div>

        <p style={{ textAlign: "center", marginTop: 22 }}>
          <Link href="/estante" className="tut-link" style={{ fontSize: 16 }}>
            {t("tut_cta")}
          </Link>
        </p>
      </div>

      <SiteFooter />

      <style jsx>{`
        .tut-steps { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
        .tut-step {
          display: flex; gap: 14px; padding: 16px 18px;
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
        }
        .tut-num {
          flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
          background: var(--accent); color: var(--accent-contrast, #fff);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 16px;
        }
        .tut-content h2 { margin: 0 0 6px; font-size: 16.5px; font-family: var(--font-brand); }
        .tut-content p { margin: 0 0 8px; font-size: 14px; line-height: 1.65; color: var(--text); }
        .tut-content p:last-child { margin-bottom: 0; }
        .tut-link { color: var(--accent-dark); font-weight: 700; text-decoration: none; }
        .tut-link:hover { text-decoration: underline; }
        .tut-providers { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; line-height: 1.8; }
        .tut-providers a { color: var(--accent-dark); font-weight: 700; text-decoration: none; }
        .tut-providers a:hover { text-decoration: underline; }
        .tut-providers span { color: var(--text-muted); font-size: 12.5px; }
        .tut-video-note {
          margin-top: 16px; padding: 12px 16px; border-radius: 12px;
          background: #fdf3e3; border: 1px solid #e8c48a; font-size: 13.5px; line-height: 1.6;
        }
        .tut-video-note p { margin: 0; }
      `}</style>
    </main>
  );
}
