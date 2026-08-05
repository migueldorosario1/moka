"use client";

import { useState } from "react";
import { CafezinhoLogo } from "@/components/CafezinhoLogo";
import { LangSwitcher } from "@/components/LangSwitcher";
import { BackButton } from "@/components/BackButton";
import { useI18n } from "@/components/I18nProvider";
import { BIBLIOTECA_LIVRE, type LivroLivre } from "@/lib/biblioteca-livre";
import { parseBook } from "@igot/parser";
import { saveToLibrary } from "@/lib/repository";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

/**
 * /biblioteca — a Livraria Livre do Moka (doc 18): livros grátis de domínio
 * público real e garantido, com capa e sinopse nossas. O internauta escolhe
 * o que baixar pra SUA estante (opt-in total — e pode remover tudo depois).
 */
export default function Biblioteca() {
  const { t } = useI18n();
  const auth = useAuth();
  const router = useRouter();
  const [baixando, setBaixando] = useState<string | null>(null);
  const [naEstante, setNaEstante] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string>("");

  async function adicionar(livro: LivroLivre) {
    setErro("");
    setBaixando(livro.id);
    try {
      const r = await fetch(livro.arquivo);
      if (!r.ok) throw new Error("download falhou");
      const data = await r.arrayBuffer();
      const nome = livro.arquivo.split("/").pop() ?? `${livro.id}.epub`;
      const result = await parseBook({ data: data.slice(0), fileName: nome });
      if (!result.ok || !result.book) {
        throw new Error("error" in result ? String(result.error) : "não consegui ler o arquivo");
      }
      const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await saveToLibrary({
        id,
        fileName: nome,
        fileSize: data.byteLength,
        book: result.book,
        coverImage: livro.capa,
        pdfSource: null,
        chapterIdx: 0,
        zoom: 1,
        savedAt: Date.now(),
        translations: {},
        notes: [],
      }, auth.userId);
      setNaEstante((p) => ({ ...p, [livro.id]: true }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(null);
    }
  }

  return (
    <main className="bib">
      <div className="igot-topbar bib-topbar">
        <div className="igot-topbar-left">
          <a className="brand" href="/" title="Moka — voltar pra capa">
            <CafezinhoLogo size={26} opacity={0.85} />
            <span>Moka</span>
          </a>
        </div>
        <div className="igot-topbar-actions">
          <BackButton />
          <LangSwitcher />
        </div>
      </div>

      <div className="bib-body">
        <p className="bib-kicker">📚 Biblioteca Livre</p>
        <h1 className="bib-title">{t("bib_title")}</h1>
        <p className="bib-sub">{t("bib_sub")}</p>

        {/* Chamada legal tranquilizadora (pedido do Miguel, 29/07) */}
        <p className="bib-legal">{t("bib_legal")}</p>

        {erro && <p className="bib-erro">⚠️ {erro}</p>}

        <div className="bib-grid">
          {BIBLIOTECA_LIVRE.map((livro) => (
            <article key={livro.id} className="bib-card">
              <div className="bib-capa">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={livro.capa} alt={`Capa de ${livro.titulo}`} />
              </div>
              <div className="bib-info">
                <h2>
                  {livro.bandeira} {livro.titulo}
                  {livro.demoTraducao && <span className="bib-demo" title="Ótimo pra treinar a tradução"> 🌐</span>}
                </h2>
                <p className="bib-autor">{livro.autor}</p>
                <p className="bib-sinopse">{livro.sinopse}</p>
                <div className="bib-acoes">
                  {naEstante[livro.id] ? (
                    <>
                      <span className="bib-ok">{t("bib_in_shelf")}</span>
                      <button className="bib-btn bib-btn-abrir" onClick={() => router.push("/estante")}>
                        {t("bib_open_shelf")}
                      </button>
                    </>
                  ) : (
                    <button
                      className="bib-btn"
                      onClick={() => void adicionar(livro)}
                      disabled={baixando === livro.id}
                    >
                      {baixando === livro.id ? t("bib_btn_downloading") : t("bib_btn_add")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="bib-nota">{t("bib_nota")}</p>
      </div>

      <style jsx>{`
        .bib { min-height: 100vh; background: #fff6ee; color: #1a1a1a; }
        .bib-topbar { background: #fff6ee; border-bottom: 1px solid #d9c8b8; }
        .bib-body { max-width: 860px; margin: 0 auto; padding: 36px 22px 64px; }
        .bib-kicker {
          text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px;
          font-weight: 700; color: #0f7680; margin-bottom: 8px; text-align: center;
        }
        .bib-title {
          font-family: var(--font-brand); font-weight: 600; font-size: 26px;
          text-align: center; margin: 0 0 10px;
        }
        .bib-sub { color: #66605a; font-size: 14.5px; line-height: 1.6; text-align: center; max-width: 560px; margin: 0 auto 28px; }
        .bib-erro { color: #b3261e; text-align: center; margin-bottom: 14px; }
        .bib-legal {
          margin: 0 auto 22px; max-width: 520px; text-align: center;
          background: #eef7ee; border: 1px solid #2c7a2c33; color: #235c23;
          font-size: 13.5px; font-weight: 600; padding: 10px 14px; line-height: 1.5;
        }
        .bib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
        .bib-card {
          background: #fff; border: 1px solid #d9c8b8; display: flex; flex-direction: column;
        }
        .bib-capa { border-bottom: 1px solid #d9c8b8; }
        .bib-capa img { display: block; width: 100%; height: auto; }
        .bib-info { padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .bib-info h2 { font-family: var(--font-brand); font-size: 16.5px; font-weight: 600; margin: 0; line-height: 1.25; }
        .bib-demo { font-size: 13px; }
        .bib-autor { color: #66605a; font-size: 13px; font-style: italic; margin: 0; }
        .bib-sinopse { color: #66605a; font-size: 13px; line-height: 1.55; margin: 0; flex: 1; }
        .bib-acoes { margin-top: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .bib-btn {
          background: #1a1a1a; color: #fff; border: none; padding: 10px 14px;
          font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 2px;
        }
        .bib-btn:disabled { opacity: 0.6; cursor: wait; }
        .bib-btn-abrir { background: #0f7680; }
        .bib-ok { color: #2c7a2c; font-weight: 700; font-size: 13.5px; }
        .bib-nota { margin-top: 30px; padding-top: 16px; border-top: 1px solid #d9c8b8; color: #66605a; font-size: 12.5px; line-height: 1.6; text-align: center; }
      `}</style>
    </main>
  );
}
