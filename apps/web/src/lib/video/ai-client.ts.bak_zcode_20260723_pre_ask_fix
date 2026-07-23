/**
 * ai-client — o cérebro de análise do Moka Video.
 *
 * Todas as análises partem da TRANSCRIÇÃO do vídeo e respondem em pt-BR,
 * com streaming (a resposta aparece palavra por palavra, como no Moka).
 *
 * Análises:
 *  - ⚡ Explicação rápida  — "o que foi o vídeo", em poucas linhas
 *  - 📖 Resumo 1–10 min   — tamanho regulável (slider), map-reduce p/ longos
 *  - 👥 Personagens        — quem fala/aparece, com papel de cada um
 *  - 🏛️ Contexto político — onde aquilo se encaixa no momento político
 *  - 🖊️ Crítica           — análise crítica: teses, argumentos, vieses
 */

import type { VideoMeta } from "./db";
import { transcriptText, formatTime } from "./db";
import type { TranscriptSegment } from "./db";
import { getConfig } from "@/lib/config";
import { getProvider } from "@igot/ai-providers";
import { createProxyTransport } from "@igot/ai-providers";

const SYSTEM_BASE =
  "Você é o Moka Video, analista de vídeos do Cafezinho Media Group. " +
  "Responda sempre em português brasileiro, com clareza e elegância. " +
  "Use markdown leve (parágrafos, **negrito**, listas) — nunca tabelas. " +
  "Baseie-se APENAS na transcrição fornecida; se algo não estiver nela, diga.";

/** ~150 palavras/min de leitura em pt-BR (ritmo confortável). */
const WORDS_PER_MIN = 150;

/** Transcrições maiores que isso passam por map-reduce (resumo por partes). */
const MAPREDUCE_THRESHOLD = 45000; // chars
const CHUNK_SIZE = 12000; // chars por pedaço no map

function videoHeader(meta: VideoMeta): string {
  return (
    `Vídeo: "${meta.title}" — canal/perfil: ${meta.channel} ` +
    `(${meta.platform}, ${formatTime(meta.durationSec)})` +
    (meta.description ? `\nDescrição: ${meta.description.slice(0, 600)}` : "")
  );
}

/** Monta o provedor BYOK do usuário (ou erro amigável). */
async function provider() {
  const config = await getConfig();
  if (!config) {
    throw new Error(
      "Configure sua chave de IA primeiro (botão ⚙️ no topo). O Moka é BYOK: a chave fica só no seu navegador.",
    );
  }
  return getProvider(config, createProxyTransport());
}

/** Divide o texto em pedaços cortando em fim de frase. */
function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(". ", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
    if (cut <= 0) cut = size;
    chunks.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

/** Roda um prompt com streaming, chamando onChunk com o texto acumulado. */
async function runStream(
  prompt: string,
  opts: { context?: string; maxTokens?: number; temperature?: number },
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const p = await provider();
  let acc = "";
  if (p.stream) {
    for await (const chunk of p.stream(prompt, {
      systemPrompt: SYSTEM_BASE,
      context: opts.context,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })) {
      acc += chunk;
      onChunk(acc);
    }
  } else {
    const r = await p.complete(prompt, {
      systemPrompt: SYSTEM_BASE,
      context: opts.context,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    acc = r.text;
    onChunk(acc);
  }
  return acc;
}

// ─── ⚡ Explicação rápida ────────────────────────────────────────────────

export async function quickExplain(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
): Promise<string> {
  const transcript = transcriptText(segments).slice(0, 30000);
  return runStream(
    `${videoHeader(meta)}\n\n` +
      "Explique em 5 a 8 linhas O QUE FOI este vídeo: quem fala, sobre o quê, " +
      "qual a tese principal e qual a conclusão. Direto ao ponto, como quem " +
      "conta pra um amigo que não tem tempo de assistir.",
    { context: transcript, maxTokens: 700 },
    onChunk,
  );
}

// ─── 📖 Resumo regulável (1–10 min) ─────────────────────────────────────

export async function summarize(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  minutes: number,
  onChunk: (text: string) => void,
): Promise<string> {
  const targetWords = Math.round(minutes * WORDS_PER_MIN);
  const transcript = transcriptText(segments);

  const finalPrompt = (material: string) =>
    `${videoHeader(meta)}\n\n` +
    `Resuma este vídeo para ser LIDO EM APROXIMADAMENTE ${minutes} ` +
    `${minutes === 1 ? "MINUTO" : "MINUTOS"} (cerca de ${targetWords} palavras ` +
    `— respeite esse tamanho, é o pedido mais importante). ` +
    (minutes <= 2
      ? "Vá direto à essência: tese, 2-3 pontos-chave, conclusão."
      : minutes <= 5
        ? "Estruture em parágrafos curtos: contexto, pontos principais, conclusão."
        : "Estruture com subtítulos (###), cobrindo as seções do vídeo em ordem, com os argumentos centrais de cada uma.") +
    " Não invente nada que não esteja no material.";

  // Vídeo curto/transcrição pequena: uma chamada só.
  if (transcript.length <= MAPREDUCE_THRESHOLD) {
    return runStream(
      finalPrompt(""),
      { context: transcript.slice(0, 60000), maxTokens: Math.min(4000, targetWords * 2 + 600) },
      onChunk,
    );
  }

  // Map-reduce: resume cada pedaço (sem stream), depois funde (com stream).
  const p = await provider();
  const chunks = chunkText(transcript, CHUNK_SIZE);
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onChunk(
      `_Lendo parte ${i + 1} de ${chunks.length} do vídeo…_`,
    );
    const r = await p.complete(
      `${videoHeader(meta)}\n\n` +
        `Esta é a parte ${i + 1} de ${chunks.length} da transcrição. ` +
        "Extraia os pontos essenciais desta parte em até 10 bullets concisos " +
        "(fatos, teses, nomes, números). Sem introdução, só os bullets.",
      {
        systemPrompt: SYSTEM_BASE,
        context: chunks[i],
        maxTokens: 900,
      },
    );
    partials.push(r.text);
  }

  onChunk("");
  return runStream(
    finalPrompt("") +
      "\n\nO material abaixo são apontamentos de TODAS as partes do vídeo, em ordem.",
    {
      context: partials.join("\n\n"),
      maxTokens: Math.min(4000, targetWords * 2 + 600),
    },
    onChunk,
  );
}

// ─── 👥 Personagens ──────────────────────────────────────────────────────

export async function characters(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
): Promise<string> {
  const transcript = transcriptText(segments).slice(0, 45000);
  return runStream(
    `${videoHeader(meta)}\n\n` +
      "Identifique os PERSONAGENS do vídeo — quem fala e quem é citado com " +
      "relevância. Para cada um:\n" +
      "- **Nome** (ou descrição, se o nome não aparecer)\n" +
      "- Papel no vídeo (apresentador, entrevistado, citado…)\n" +
      "- O que diz ou o que dizem sobre ele, em 1-2 linhas\n" +
      "Se houver só um falante, diga isso e descreva o estilo/posição dele.",
    { context: transcript, maxTokens: 1400 },
    onChunk,
  );
}

// ─── 🏛️ Contexto político ───────────────────────────────────────────────

export async function politicalContext(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
): Promise<string> {
  const transcript = transcriptText(segments).slice(0, 45000);
  return runStream(
    `${videoHeader(meta)}\n\n` +
      "Situe este vídeo no CONTEXTO POLÍTICO:\n" +
      "1. **Do que se trata** — o fato/tema político central\n" +
      "2. **Momento** — em que conjuntura (país, governo, disputa) isso se insere\n" +
      "3. **Atores e posições** — quem ganha, quem perde, que lado cada um defende\n" +
      "4. **Por que importa** — consequências práticas pro cidadão\n" +
      "Se o vídeo não for político, diga-o com franqueza e situe o contexto " +
      "(cultural, econômico, esportivo…) que couber.",
    { context: transcript, maxTokens: 1600 },
    onChunk,
  );
}

// ─── 🖊️ Crítica ──────────────────────────────────────────────────────────

export async function critique(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
): Promise<string> {
  const transcript = transcriptText(segments).slice(0, 45000);
  return runStream(
    `${videoHeader(meta)}\n\n` +
      "Faça uma CRÍTICA honesta e equilibrada deste vídeo:\n" +
      "1. **Tese** — o que o autor quer que você acredite\n" +
      "2. **Argumentos fortes** — o que se sustenta\n" +
      "3. **Pontos fracos** — falácias, omissões, exageros, dados sem fonte\n" +
      "4. **Viés** — de onde fala o autor, o que ele não mostra\n" +
      "5. **Veredito** — vale assistir? Com que ressalvas?\n" +
      "Crítica não é destruir: reconheça méritos onde existirem.",
    { context: transcript, maxTokens: 1600 },
    onChunk,
  );
}

// ─── ❓ Perguntar sobre o vídeo (Q&A com busca no contexto) ─────────────

const STOPWORDS = new Set(
  ("a,o,e,é,de,do,da,dos,das,um,uma,uns,umas,que,em,no,na,nos,nas,por,pra,pro," +
    "com,como,se,ao,aos,à,às,ou,mas,não,sim,ele,ela,eles,elas,isso,isto,aquilo," +
    "foi,ser,está,estão,sobre,qual,quais,quem,quando,onde,porque,porquê,video," +
    "vídeo,falou,fala,diz,disse,sobre").split(","),
);

/** Palavras-chave da pergunta (sem stopwords, minúsculas, sem acento). */
function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Busca leve (BM25 de boteco): pontua cada segmento por ocorrências das
 * palavras-chave + bônus de frase exata, pega os melhores até ~9k chars
 * e devolve EM ORDEM CRONOLÓGICA (a IA lê o contexto como o vídeo flui).
 */
function retrieveContext(
  segments: TranscriptSegment[],
  question: string,
  maxChars = 9000,
): string {
  const kws = keywords(question);
  const phrase = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const scored = segments.map((s, i) => {
    const norm = s.text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    let score = 0;
    for (const kw of kws) {
      const hits = norm.split(kw).length - 1;
      score += hits * 2;
    }
    if (phrase.length > 12 && norm.includes(phrase)) score += 15;
    return { i, s, score };
  });

  const picked = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Sem nada relevante: manda o miolo do vídeo (começo + meio) como contexto.
  const chosen = picked.length
    ? picked
    : scored.slice(0, Math.min(40, scored.length));

  const ordered = chosen
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);

  const out: string[] = [];
  let total = 0;
  for (const s of ordered) {
    const line = `[${formatTime(s.start)}] ${s.text}`;
    if (total + line.length > maxChars) break;
    out.push(line);
    total += line.length;
  }
  return out.join("\n");
}

/** ❓ Responde uma pergunta do usuário citando trechos da transcrição. */
export async function askQuestion(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  question: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const context = retrieveContext(segments, question);
  return runStream(
    `${videoHeader(meta)}\n\n` +
      `PERGUNTA DO USUÁRIO: "${question}"\n\n` +
      "Responda com base APENAS na transcrição (trechos abaixo, com tempos " +
      "[mm:ss]). Cite o tempo entre colchetes quando apontar onde algo foi " +
      "dito (ex.: [12:34]). Se a transcrição não responder, diga com " +
      "franqueza que o vídeo não fala sobre isso. Seja direto e claro.",
    { context, maxTokens: 1200 },
    onChunk,
  );
}
