/**
 * POST /api/report-error
 *
 * Feedback + autocura (pedido do Miguel, 13/08/2026): recebe o diagnóstico de
 * erro do app e:
 *   1. Envia o diagnóstico completo pro suporte (info@mokareader.com) — vira a
 *      "memória de bugs" (eu leio via IMAP). Reply-to = e-mail do usuário.
 *   2. Manda uma RESPOSTA AUTOMÁTICA pro e-mail do usuário, na língua dele:
 *      "recebemos, o especialista vai analisar e responder em até 24 horas".
 *
 * Usa o SMTP GoDaddy (env vars SMTP_MOKA_* na Vercel). NUNCA loga nem expõe
 * a senha. O relatório não contém a chave de IA (só provedor/modelo).
 */

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SUPPORT = "info@mokareader.com";

/** Nome do "especialista" localizado por idioma (C4 — pedido do Miguel). */
const EXPERT: Record<string, string> = {
  "pt-BR": "Zé da Moca",
  en: "Joe from Moka",
  es: "Pepe Moka",
  fr: "Jo Moka",
  de: "Sepp Moka",
  it: "Beppe Moca",
  ru: "Moka (Мока)",
  zh: "Moka 专家",
  ja: "Moka 担当",
  ko: "Moka 담당",
  ar: "خبير Moka",
  hi: "Moka विशेषज्ञ",
};

/** Texto da resposta automática por idioma. {name}=usuário, {expert}=especialista. */
const REPLY: Record<string, { subject: string; body: string }> = {
  "pt-BR": {
    subject: "☕ Moka — recebemos seu diagnóstico!",
    body: "Olá{name}!\n\nRecebemos o diagnóstico do erro que você encontrou. Nosso especialista {expert} vai analisar e te responder em até 24 horas.\n\nObrigado por ajudar a melhorar o Moka! ☕",
  },
  en: {
    subject: "☕ Moka — we received your report!",
    body: "Hi{name}!\n\nWe received the error report you sent. Our specialist {expert} will look into it and get back to you within 24 hours.\n\nThanks for helping make Moka better! ☕",
  },
  es: {
    subject: "☕ Moka — ¡recibimos tu diagnóstico!",
    body: "¡Hola{name}!\n\nRecibimos el diagnóstico del error que encontraste. Nuestro especialista {expert} lo analizará y te responderá en un plazo de 24 horas.\n\n¡Gracias por ayudar a mejorar Moka! ☕",
  },
  fr: {
    subject: "☕ Moka — nous avons reçu votre diagnostic !",
    body: "Bonjour{name} !\n\nNous avons reçu le diagnostic de l'erreur rencontrée. Notre spécialiste {expert} va l'analyser et vous répondra sous 24 heures.\n\nMerci de contribuer à améliorer Moka ! ☕",
  },
};

interface ReportBody {
  report?: string;
  userEmail?: string;
  userName?: string;
  lang?: string;
  kind?: string;
  bookTitle?: string;
}

export async function POST(req: Request) {
  let body: ReportBody;
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const report = (body.report ?? "").slice(0, 30000); // limite de segurança
  if (!report.trim()) {
    return NextResponse.json({ ok: false, error: "Relatório vazio." }, { status: 400 });
  }
  const userEmail = (body.userEmail ?? "").trim();
  const lang = body.lang && REPLY[body.lang] ? body.lang : body.lang === "pt" ? "pt-BR" : "pt-BR";
  const expert = EXPERT[body.lang ?? ""] ?? EXPERT[lang] ?? EXPERT["pt-BR"];

  const host = process.env.SMTP_MOKA_HOST;
  const port = Number(process.env.SMTP_MOKA_PORT ?? "465");
  const user = process.env.SMTP_MOKA_USER;
  const pass = process.env.SMTP_MOKA_PASSWORD;
  if (!host || !user || !pass) {
    return NextResponse.json(
      { ok: false, error: "SMTP não configurado no servidor." },
      { status: 500 },
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    // 1) Diagnóstico pro suporte (memória de bugs). Reply-to = usuário.
    await transporter.sendMail({
      from: `Moka Diagnóstico <${user}>`,
      to: SUPPORT,
      replyTo: userEmail || undefined,
      subject: `[Moka Diagnóstico] ${body.kind ?? "erro"}${body.bookTitle ? ` — ${body.bookTitle}` : ""}`,
      text: report + (userEmail ? `\n\n---\nE-mail do usuário: ${userEmail}` : ""),
    });

    // 2) Resposta automática pro usuário (se temos o e-mail dele).
    let replied = false;
    if (userEmail && /.+@.+\..+/.test(userEmail)) {
      const tpl = REPLY[lang] ?? REPLY["pt-BR"];
      const name = body.userName ? `, ${body.userName.split(" ")[0]}` : "";
      await transporter.sendMail({
        from: `Moka <${user}>`,
        to: userEmail,
        subject: tpl.subject,
        text: tpl.body.replace("{name}", name).replace("{expert}", expert),
      });
      replied = true;
    }

    // 3) Issue no GitHub (painel público, pedido do Miguel, 13/08): cada relatório
    //    vira um card no repo moka com o label "user-report". PRIVACIDADE: o body
    //    é o `report` (diagnóstico técnico — SEM chave, SEM e-mail do usuário;
    //    o e-mail só vai no e-mail interno acima). Token GITHUB_TOKEN_MOKA na Vercel.
    let github = false;
    if (process.env.GITHUB_TOKEN_MOKA) {
      try {
        const title = `[Relato] ${body.kind ?? "erro"}${body.bookTitle ? ` — ${body.bookTitle}` : ""}`;
        const ghRes = await fetch("https://api.github.com/repos/migueldorosario1/moka/issues", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN_MOKA}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            title,
            body: report,
            labels: ["user-report"],
          }),
        });
        github = ghRes.ok;
      } catch {
        github = false; // GitHub fora do ar não derruba o e-mail
      }
    }

    return NextResponse.json({ ok: true, replied, github });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Falha ao enviar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
