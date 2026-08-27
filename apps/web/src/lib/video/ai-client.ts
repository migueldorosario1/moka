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
import { getConfig, getTargetLang } from "@/lib/config";
import { getProvider } from "@igot/ai-providers";
import { createProxyTransport } from "@igot/ai-providers";
import type { UsageInfo } from "@igot/ai-providers";
import { t } from "@/lib/messages";
import {
  recordUsage,
  getPrefs,
  estimateTokens,
  estimateTaskInputTokens,
} from "@/lib/telemetry";

const SYSTEM_BASE =
  "Você é o Moka Video, analista de vídeos do Cafezinho Media Group. " +
  "Escreva com clareza e elegância. " +
  "Use markdown leve (parágrafos, **negrito**, listas) — nunca tabelas. " +
  "Baseie-se APENAS na transcrição fornecida; se algo não estiver nela, diga.";

// ─── Idioma do conteúdo (auto-detectado na página, V2.4) ────────────────
// Default: o vídeo é auto-detectado; a resposta segue o idioma do USUÁRIO
// (getTargetLang). Vídeo em inglês → resumo em português, sem configurar nada.
let CONTENT_LANG = "pt";
export function setVideoContentLang(code: string): void {
  CONTENT_LANG = code || "pt";
}

const PROMPT_LANGS: Record<string, string> = {
  pt: "português brasileiro", en: "English", es: "español",
  fr: "français", de: "Deutsch", it: "italiano",
};

function langNome(code: string): string {
  return PROMPT_LANGS[code] ?? PROMPT_LANGS[code.split("-")[0]] ?? code;
}

function systemPrompt(): string {
  const target = langNome(getTargetLang());
  const content = langNome(CONTENT_LANG);
  return (
    SYSTEM_BASE +
    ` O conteúdo do vídeo está em ${content} (auto-detectado). ` +
    `Responda SEMPRE em ${target} — o idioma do usuário — mesmo que o ` +
    `conteúdo esteja em outro idioma. NUNCA misture idiomas na resposta. ` +
    `Se a transcrição parecer estar em idioma diferente de ${content}, ` +
    `avise no início da resposta.`
  );
}

/** ~150 palavras/min de leitura em pt-BR (ritmo confortável). */
const WORDS_PER_MIN = 150;

/** Transcrições maiores que isso passam por map-reduce (resumo por partes). */
const MAPREDUCE_THRESHOLD = 45000; // chars
const CHUNK_SIZE = 12000; // chars por pedaço no map

function videoHeader(meta: VideoMeta): string {
  // Data de publicação (quando a ficha oficial trouxer) — âncora temporal
  // pro Contexto calcular datas relativas ditas nas falas (Miguel, 27/08).
  let dataPub = "";
  if (meta.uploadDate) {
    const d = new Date(meta.uploadDate);
    if (!Number.isNaN(d.getTime())) {
      dataPub = ` · publicado em ${d.toLocaleDateString("pt-BR")}`;
    }
  }
  // Hashtags (#Assunto) são ruído pros nomes — a LLM listava "#Eleições"
  // como personagem (relato do Miguel, 27/08). Limpa antes de enviar.
  const cleanDescription = meta.description
    ?.replace(/#\w+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return (
    `Vídeo: "${meta.title}" — canal/perfil: ${meta.channel} ` +
    `(${meta.platform}, ${formatTime(meta.durationSec)}${dataPub})` +
    (cleanDescription ? `\nDescrição: ${cleanDescription.slice(0, 600)}` : "")
  );
}

/** Provedor de IA: SEMPRE a chave do usuário (BYOK).
 *  FASE GRATUITA (pivô 2026-08-04): sem IA da casa/pontos — sem chave, o
 *  erro guia a pessoa a configurar a própria.
 *  Retorna também a CONFIG (providerId/model) pra telemetria identificar
 *  quem consumiu. */
async function provider() {
  const config = await getConfig();
  if (!config) {
    throw new Error(
      "Para usar a IA, abra as ⚙️ Configurações e cole a SUA chave de IA " +
      "(ela fica só no seu dispositivo). Em /ajuda tem o passo a passo de 1 minuto.",
    );
  }
  const p = getProvider(config, createProxyTransport());
  return { p, config, providerName: p.name };
}

/** Identidade de quem consumiu (pra telemetria). */
interface VideoIdentity {
  providerId: string;
  providerName: string;
  model: string;
}

/**
 * Grava o consumo de uma análise de vídeo no ledger local (telemetria).
 * Fire-and-forget e à prova de falha — nunca quebra a análise.
 */
function recordVideo(args: {
  task: string;
  identity: VideoIdentity;
  usage?: UsageInfo;
  promptText: string;
  contextText?: string;
  completionText?: string;
  status?: "ok" | "error";
  note?: string;
  silent?: boolean;
}): void {
  void recordUsage({
    task: args.task,
    providerId: args.identity.providerId,
    providerName: args.identity.providerName,
    model: args.identity.model,
    usage: args.usage,
    promptText: [systemPrompt(), args.contextText, args.promptText]
      .filter(Boolean)
      .join("\n"),
    completionText: args.completionText,
    status: args.status ?? "ok",
    note: args.note,
    silent: args.silent,
  }).catch(() => {
    /* telemetria nunca quebra o app */
  });
}

/**
 * Se a trava de consumo está ligada E a entrada estimada já estoura o
 * limite, devolve o aviso (a chamada NÃO é feita). Caso contrário, null.
 * Nunca lança.
 */
function capBlockedMessage(
  prompt: string,
  context?: string,
): string | null {
  try {
    const prefs = getPrefs();
    if (prefs.tokenCap <= 0) return null;
    const est = estimateTaskInputTokens(prompt, systemPrompt(), context);
    if (est > prefs.tokenCap) {
      return t(getTargetLang(), "errTokenCap", { est, cap: prefs.tokenCap });
    }
  } catch {
    /* telemetria nunca quebra o app */
  }
  return null;
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

/** Roda um prompt com streaming, chamando onChunk com o texto acumulado.
 *  Registra o consumo na telemetria e respeita a trava de tokens (sem
 *  nunca travar o app). `task` identifica a análise no ledger. */
async function runStream(
  task: string,
  prompt: string,
  opts: { context?: string; maxTokens?: number; temperature?: number; shouldCancel?: () => boolean },
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const { p, config, providerName } = await provider();
  const identity: VideoIdentity = {
    providerId: config.providerId,
    providerName,
    model: config.model ?? "",
  };

  // Trava de consumo: se a entrada já estoura o limite, avisa e NÃO gasta.
  const capMsg = capBlockedMessage(prompt, opts.context);
  if (capMsg) throw new Error(capMsg);

  let usage: UsageInfo | undefined;
  const captureUsage = (u: UsageInfo) => {
    usage = u;
  };
  const cap = getPrefs().tokenCap;
  const estIn = estimateTaskInputTokens(prompt, systemPrompt(), opts.context);

  let acc = "";
  let capCut = false;
  try {
    if (p.stream) {
      for await (const chunk of p.stream(prompt, {
        systemPrompt: systemPrompt(),
        context: opts.context,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        onUsage: captureUsage,
      })) {
        acc += chunk;
        onChunk(acc);
        if (opts.shouldCancel?.()) break; // cancelado pelo usuário (Miguel, 27/08)
        // Trava em tempo real: estoura o cap → corta o stream, preserva o texto.
        if (cap > 0 && estIn + estimateTokens(acc) > cap) {
          capCut = true;
          break;
        }
      }
    } else {
      const r = await p.complete(prompt, {
        systemPrompt: systemPrompt(),
        context: opts.context,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        onUsage: captureUsage,
      });
      acc = r.text;
      onChunk(acc);
    }
    recordVideo({
      task,
      identity,
      usage,
      promptText: prompt,
      contextText: opts.context,
      completionText: acc,
      note: capCut ? "cap-cut" : undefined,
    });
    return acc;
  } catch (err) {
    // Registra a falha (ex.: sem crédito) e repassa o erro pra UI tratar.
    recordVideo({
      task,
      identity,
      usage,
      promptText: prompt,
      contextText: opts.context,
      status: "error",
    });
    throw err;
  }
}

// ─── ⚡ Explicação rápida ────────────────────────────────────────────────

function fullOrSampledTranscript(segments: TranscriptSegment[], maxChars = 120000): string {
  const full = transcriptText(segments);
  if (full.length <= maxChars) return full;
  // Para vídeos extremamente longos (> 120k chars, ~2.5h de fala contínua),
  // combina início (introdução/tese), meio e fim (conclusão).
  const third = Math.floor(maxChars / 3);
  const head = full.slice(0, third);
  const midStart = Math.floor(full.length / 2 - third / 2);
  const mid = full.slice(midStart, midStart + third);
  const tail = full.slice(-third);
  return `${head}\n\n[... trecho intermediário do vídeo ...]\n\n${mid}\n\n[... trecho final do vídeo ...]\n\n${tail}`;
}

export async function quickExplain(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
  opts?: { shouldCancel?: () => boolean },
): Promise<string> {
  const transcript = fullOrSampledTranscript(segments);
  return runStream(
    "video-explain",
    `${videoHeader(meta)}\n\n` +
      "Explique em 5 a 8 linhas O QUE FOI este vídeo: quem fala, sobre o quê, " +
      "qual a tese principal e qual a conclusão. Direto ao ponto, como quem " +
      "conta pra um amigo que não tem tempo de assistir.\n" +
      "IMPORTANTE: corrija nomes próprios, cargos e instituições que possam " +
      "ter sido transcritos errado (o texto vem de transcrição automática).",
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
  opts?: { shouldCancel?: () => boolean },
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
    " Não invente nada que não esteja no material.\n" +
    "IMPORTANTE: corrija nomes próprios, cargos, partidos e instituições " +
    "que possam ter sido transcritos errado (o texto vem de transcrição " +
    "automática por IA — pode ter erros de nomes).";

  // Vídeo curto/transcrição pequena: uma chamada só com transcrição inteira.
  if (transcript.length <= MAPREDUCE_THRESHOLD) {
    return runStream(
      "video-summarize",
      finalPrompt(""),
      { context: transcript, maxTokens: Math.min(4000, targetWords * 2 + 600) },
      onChunk,
    );
  }

  // Map-reduce: resume cada pedaço (sem stream), depois funde (com stream).
  const { p, config, providerName } = await provider();
  const identity: VideoIdentity = {
    providerId: config.providerId,
    providerName,
    model: config.model ?? "",
  };

  // Trava de consumo: a tarefa inteira lê a transcrição completa — se ela já
  // estoura o limite, avisa e NÃO gasta (sem travar o app).
  const capMsg = capBlockedMessage(finalPrompt(""), transcript);
  if (capMsg) throw new Error(capMsg);

  const chunks = chunkText(transcript, CHUNK_SIZE);
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onChunk(
      `_Lendo parte ${i + 1} de ${chunks.length} do vídeo…_`,
    );
    const chunkPrompt =
      `${videoHeader(meta)}\n\n` +
      `Esta é a parte ${i + 1} de ${chunks.length} da transcrição. ` +
      "Extraia os pontos essenciais desta parte em até 10 bullets concisos " +
      "(fatos, teses, nomes, números). Sem introdução, só os bullets.";
    try {
      let chunkUsage: UsageInfo | undefined;
      const r = await p.complete(chunkPrompt, {
        systemPrompt: systemPrompt(),
        context: chunks[i],
        maxTokens: 900,
        onUsage: (u) => {
          chunkUsage = u;
        },
      });
      partials.push(r.text);
      // Chamada interna do map-reduce: registra SEM pop-up (só a final avisa).
      recordVideo({
        task: "video-summarize",
        identity,
        usage: chunkUsage,
        promptText: chunkPrompt,
        contextText: chunks[i],
        completionText: r.text,
        note: `map-reduce ${i + 1}/${chunks.length}`,
        silent: true,
      });
    } catch (err) {
      recordVideo({
        task: "video-summarize",
        identity,
        promptText: chunkPrompt,
        contextText: chunks[i],
        status: "error",
        note: `map-reduce ${i + 1}/${chunks.length}`,
        silent: true,
      });
      throw err;
    }
  }

  onChunk("");
  return runStream(
    "video-summarize",
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
  opts?: { shouldCancel?: () => boolean },
): Promise<string> {
  const transcript = fullOrSampledTranscript(segments);
  return runStream(
    "video-characters",
    `${videoHeader(meta)}\n\n` +
      "Identifique os PERSONAGENS do vídeo — TODOS os que falam E os citados " +
      "com relevância. Para cada um:\n" +
      "- **Nome CORRETO** (corrija erros de transcrição — se ouviu 'Elmano' " +
      "mas o correto é 'Elmano de Freitas', use o nome correto; se é político, " +
      "confirme cargo e partido)\n" +
      "- Papel no vídeo, SEMPRE específico: apresentador, âncora, co-apresentador, " +
      "repórter, entrevistador, entrevistado, convidado, especialista, citado…\n" +
      "- O que diz ou o que dizem sobre ele, em 1-2 linhas\n" +
      "🔍 FONTES DOS NOMES (use TODAS, em ordem de confiança):\n" +
      "1. A DESCRIÇÃO do vídeo (logo acima) — costuma trazer o nome de quem " +
      "apresenta, entrevista e participa (ex.: 'com Saagar e Krystal', " +
      "'entrevista de Fulano com Beltrano'). É a fonte MAIS confiável de nomes " +
      "CORRETOS: extraia dela os apresentadores/entrevistadores SEMPRE que " +
      "mencionar algum.\n" +
      "2. Como os próprios falantes se apresentam e se chamam uns aos outros " +
      "na transcrição ('bem-vinda, Dra. Ana', 'obrigado, João').\n" +
      "3. O nome do canal/programa no título — se o vídeo tem programa com nome " +
      "(ex.: 'Breaking Points', 'Jornal Nacional'), identifique QUEM apresenta " +
      "aquele programa.\n" +
      "OBRIGATÓRIO: os APRESENTADORES, ÂNCORAS E ENTREVISTADORES vêm PRIMEIRO na " +
      "lista e JAMAIS ficam de fora — quem conduz o programa e quem faz as " +
      "perguntas é personagem tanto quanto quem responde.\n" +
      "Se a transcrição marca falantes genéricos ('Falante 1', 'Speaker A'), " +
      "descubra QUEM é cada um pelo conteúdo (nome, vocativo, descrição) e " +
      "apresente pelo NOME REAL — nunca pelo rótulo genérico.\n" +
      "🚫 PROIBIDO listar como personagem: hashtags (#algumacoisa), @menções, " +
      "links/URLs, nomes de programas (só quem APRESENTA o programa é " +
      "personagem), temas/assuntos e rótulos como 'Falante 1' — isso é ruído, " +
      "não é gente. A lista é de PESSOAS (ou personagens fictícios citados), " +
      "com nome próprio de verdade.\n" +
      "Depois liste os entrevistados/convidados e, por fim, os apenas citados.\n" +
      "IMPORTANTE: os nomes podem ter sido transcritos errado pelo Whisper. " +
      "CORRIJA nomes próprios, cargos, partidos e instituições baseado no " +
      "contexto. Se não tiver certeza do nome, indique.\n" +
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
  opts?: { shouldCancel?: () => boolean },
): Promise<string> {
  const transcript = fullOrSampledTranscript(segments);
  return runStream(
    "video-political",
    `${videoHeader(meta)}\n\n` +
      "Situe este vídeo no CONTEXTO GERAL do tema discutido:\n" +
      "1. **Do que se trata** — o fato/tema central das falas, em 2-3 linhas claras\n" +
      "2. **As datas** — TODA a linha do tempo: quando o vídeo foi publicado, e " +
      "cada referência temporal dita nas falas ('nesta semana', 'no mês passado', " +
      "'em outubro') traduzida em data CONCRETA, calculada a partir da data de " +
      "publicação. Datas sempre por extenso com mês e ano (ex.: '15 de agosto de " +
      "2026') — nunca 'recentemente' ou 'há pouco tempo' soltos.\n" +
      "3. **A conjuntura** — o cenário mais amplo em que o tema se encaixa " +
      "(político, econômico, cultural, esportivo…): os antecedentes que um " +
      "leitor precisa pra entender por que essa discussão existe AGORA, quem " +
      "são as partes envolvidas e o que já aconteceu entre elas antes deste vídeo\n" +
      "4. **Atores e posições** — quem ganha, quem perde, que lado cada um defende\n" +
      "5. **Por que importa agora** — o que está em jogo e as consequências " +
      "práticas pro cidadão\n" +
      "Se o tema não for político, aplique o mesmo rigor de datas e conjuntura " +
      "ao contexto que couber (cultural, econômico, esportivo…).",
    { context: transcript, maxTokens: 1800 },
    onChunk,
  );
}

// ─── 🖊️ Crítica ──────────────────────────────────────────────────────────

export async function critique(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
  opts?: { shouldCancel?: () => boolean },
): Promise<string> {
  const transcript = fullOrSampledTranscript(segments);
  return runStream(
    "video-critique",
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

// ─── 📄 Transcrição corrigida (nomes + parágrafos) ─────────────────────

export async function correctTranscript(
  meta: VideoMeta,
  segments: TranscriptSegment[],
  onChunk: (text: string) => void,
  opts?: { shouldCancel?: () => boolean },
): Promise<string> {
  const transcript = fullOrSampledTranscript(segments);

  const prompt =
    `${videoHeader(meta)}\n\n` +
    "Você é um editor profissional. Corrija a transcrição abaixo (gerada por IA de " +
    "reconhecimento de fala, pode ter erros de nomes próprios, cargos, instituições).\n\n" +
    "Regras:\n" +
    "1. CORRIJA nomes próprios, cargos, partidos, instituições e lugares.\n" +
    "2. CORRIJA erros de português e pontuação.\n" +
    "3. DIVIDA em parágrafos curtos (2-3 frases cada).\n" +
    "4. MANTENHA o conteúdo fiel — não adicione nem remova informações.\n" +
    "5. NÃO inclua timestamps.\n\n" +
    "Devolva APENAS o texto corrigido.";

  // Streaming como as demais análises (Miguel, 27/08): o caminho antigo
  // p.complete sem stream travava sem barra e morria no timeout do proxy
  // em transcrições grandes — texto corrigido é longo por natureza.
  return runStream(
    "video-correct",
    prompt,
    { context: transcript, maxTokens: 8000, temperature: 0.3, shouldCancel: opts?.shouldCancel },
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

  // Estrutura SEMPRE presente: começo (tese) + FIM (conclusão).
  // BUG-20260723-ASK-CONCLUSAO: perguntas tipo "qual a conclusão?" não têm
  // keyword no texto → caíam no fallback que mandava só o início do vídeo,
  // e a IA respondia que a transcrição "terminava de forma abrupta".
  const head = scored.slice(0, Math.min(8, scored.length));
  const tail = scored.slice(Math.max(head.length, scored.length - 15));
  const mustIdx = new Set([...head, ...tail].map((x) => x.i));
  const middle = picked
    .filter((x) => !mustIdx.has(x.i))
    .sort((a, b) => a.i - b.i);

  const toLine = (x: { s: TranscriptSegment }) =>
    `[${formatTime(x.s.start)}] ${x.s.text}`;
  const tailLines = tail.map(toLine);
  const tailText = tailLines.join("\n");
  // O fim tem orçamento reservado: nunca é cortado pelo limite de chars.
  const budget = Math.max(2000, maxChars - tailText.length - 1);

  const out: string[] = [];
  let total = 0;
  for (const line of [...head.map(toLine), ...middle.map(toLine)]) {
    if (total + line.length > budget) break;
    out.push(line);
    total += line.length;
  }
  return out.join("\n") + "\n" + tailText;
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
    "video-ask",
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
