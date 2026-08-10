/**
 * Cliente de IA de alto nível (roda no navegador).
 *
 * Lê a config do usuário (localStorage), instancia o provider com o transport
 * proxy (fura CORS), e expõe as três ações da UI: traduzir, explicar, perguntar.
 *
 * Esta é a lógica de prompt que antes morava nas API Routes — agora no cliente,
 * já que o servidor não detém mais a chave.
 */

import {
  getProvider,
  getPreset,
  createProxyTransport,
  AIProviderError,
  ProxyStreamError,
  type AIConfig,
} from "@igot/ai-providers";
import { getConfigSync, getTargetLang } from "./config";
import { t } from "./messages";

/** Contexto da obra relevante para as ações. */
export interface BookContext {
  bookTitle?: string;
  bookAuthor?: string;
  bookLanguage?: string;
}

/** Resultado padronizado das ações. */
export interface AIActionResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Callback chamado a cada pedaço de texto que chega (pra streaming). */
export type StreamCallback = (fullText: string, chunk: string) => void;

/** Monta o bloco de contexto (metadados da obra) que acompanha o prompt. */
function buildContext(ctx: BookContext): string | undefined {
  const parts = [
    ctx.bookTitle && `Obra: ${ctx.bookTitle}`,
    ctx.bookAuthor && `Autor: ${ctx.bookAuthor}`,
    ctx.bookLanguage && `Idioma original: ${ctx.bookLanguage}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

/** Instancia o provider SEMPRE com a chave do usuário (BYOK).
 *  FASE GRATUITA (pivô 2026-08-04): não existe mais IA da casa/pontos —
 *  sem chave configurada, o erro guia a pessoa a colocar a própria. */
function resolveProvider() {
  const config = getConfigSync();
  if (!config) {
    throw new Error(
      "Para usar a IA, abra as ⚙️ Configurações e cole a SUA chave de IA " +
      "(ela fica só no seu dispositivo). Em /ajuda tem o passo a passo de 1 minuto.",
    );
  }
  const transport = createProxyTransport("/api/proxy");
  return { provider: getProvider(config as AIConfig, transport), config };
}

/**
 * Converte qualquer exceção numa mensagem amigável no IDIOMA DO USUÁRIO.
 * Traduz status HTTP comuns dos provedores de IA em texto claro, com a
 * próxima ação. O idioma acompanha o que o usuário configurou (targetLang):
 * configurou em inglês? vê erros em inglês. Português? em português.
 */
function toMessage(err: unknown): string {
  const lang = getTargetLang();

  // Erro do proxy-stream com status HTTP do provedor.
  if (err instanceof ProxyStreamError) {
    const detail = err.providerDetail ? ` (${err.providerDetail})` : "";
    switch (err.statusCode) {
      case 400:
        // Erro de requisição: geralmente parâmetro inválido (modelo, temperatura).
        // O detail traz a mensagem específica do provedor — já está em inglês ou
        // no idioma do provedor, então é útil mostrar junto.
        return t(lang, "errGeneric", { code: 400 }) + detail;
      case 401:
      case 403:
        return t(lang, "errAuth") + detail;
      case 404:
        // Modelo não encontrado — mensagem específica e útil.
        return t(lang, "errModelNotFound") + detail;
      case 429:
        return t(lang, "errRateLimit") + detail;
      case 500:
      case 502:
      case 503:
        return t(lang, "errServer") + detail;
      default:
        return t(lang, "errGeneric", { code: err.statusCode }) + detail;
    }
  }
  if (err instanceof AIProviderError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    // "Failed to fetch" = rede caiu, CORS, OU timeout do serverless.
    // Mensagem mais útil pro usuário entender o que aconteceu.
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return t(lang, "errNetwork");
    }
    // AbortError (timeout manual ou navegação durante fetch).
    if (/abort/i.test(msg) && err.name === "AbortError") {
      return t(lang, "errTimeout");
    }
    return msg;
  }
  return String(err);
}

// ─── Ações ──────────────────────────────────────────────────────────────

/** Traduz um trecho para o idioma-alvo do usuário. */
export async function translate(
  text: string,
  ctx: BookContext,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um tradutor literário e técnico de excelência. ` +
    `Traduza o trecho fornecido para ${targetLang}. ` +
    `Respeite o tom, o estilo e o contexto da obra. ` +
    `Devolva APENAS a tradução, sem comentários, sem aspas, sem introdução.`;

  try {
    const { provider } = resolveProvider();
    const result = await provider.complete(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.3,
    });
    return { ok: true, text: result.text };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Versão STREAMING de translate: o texto vai aparecendo aos poucos.
 * `onChunk` é chamado a cada pedaço (com o texto acumulado + o pedaço novo).
 * Cai pra `translate` (sem stream) se o provedor não suportar.
 */
export async function translateStream(
  text: string,
  ctx: BookContext,
  onChunk: StreamCallback,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um tradutor literário e técnico de excelência. ` +
    `Traduza o trecho fornecido para ${targetLang}. ` +
    `Respeite o tom, o estilo e o contexto da obra. ` +
    `Devolva APENAS a tradução, sem comentários, sem aspas, sem introdução.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      // Sem suporte a stream — faz normal e devolve de uma vez.
      const result = await provider.complete(text, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.3,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.3,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Traduz a página/capítulo INTEIRO de uma vez.
 *
 * Diferente do `translate` (trecho curto), aqui o texto é longo. O prompt
 * pede parágrafos coerentes e bem separados — porque PDFs costumam ter
 * quebras de linha artificiais (uma por linha impressa) que, preservadas
 * à risca, geram um texto bagunçado. Ao reagrupar em parágrafos naturais,
 * a tradução flui como uma página de livro real, legível e bonita.
 */
export async function translatePage(
  text: string,
  ctx: BookContext,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Página sem texto para traduzir." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um tradutor literário e técnico de excelência. ` +
    `Traduza o texto completo da página a seguir para ${targetLang}. ` +
    `Reagrupe o conteúdo em PARÁGRAFOS coerentes e naturais: ` +
    `uma mudança de ideia = novo parágrafo. ` +
    `Ignore as quebras de linha artificiais do original (PDFs quebram a cada ` +
    `linha impressa) e crie parágrafos que fluam como uma página de livro. ` +
    `Mantenha títulos/heading em linhas próprias. ` +
    `Separe cada parágrafo por UMA linha em branco. ` +
    `Respeite o tom, o estilo e o contexto da obra. ` +
    `Devolva APENAS a tradução, sem comentários, sem aspas, sem introdução.`;

  try {
    const { provider } = resolveProvider();
    const result = await provider.complete(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.3,
    });
    return { ok: true, text: result.text };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Versão STREAMING de translatePage: a tradução da página inteira vai
 * aparecendo aos poucos (palavra por palavra). `onChunk` recebe o texto
 * acumulado + o pedaço novo a cada chunk do LLM.
 */
export async function translatePageStream(
  text: string,
  ctx: BookContext,
  onChunk: StreamCallback,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Página sem texto para traduzir." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um tradutor literário e técnico de excelência. ` +
    `Traduza o texto completo da página a seguir para ${targetLang}. ` +
    `Reagrupe o conteúdo em PARÁGRAFOS coerentes e naturais: ` +
    `uma mudança de ideia = novo parágrafo. ` +
    `Ignore as quebras de linha artificiais do original (PDFs quebram a cada ` +
    `linha impressa) e crie parágrafos que fluam como uma página de livro. ` +
    `Mantenha títulos/heading em linhas próprias. ` +
    `Separe cada parágrafo por UMA linha em branco. ` +
    `Respeite o tom, o estilo e o contexto da obra. ` +
    `Devolva APENAS a tradução, sem comentários, sem aspas, sem introdução.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      const result = await provider.complete(text, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.3,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.3,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Explica a página INTEIRA com streaming.
 * Diferente do explain (trecho), aqui cobre a página toda: sentido geral,
 * contexto, termos-chave, dificuldades de tradução.
 */
export async function explainPageStream(
  text: string,
  ctx: BookContext,
  onChunk: StreamCallback,
  /** Tamanho-alvo em palavras (barra deslizante do modal de anotação). */
  targetWords?: number,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Página sem texto." };
  const targetLang = getTargetLang();
  const lengthRule = targetWords && targetWords > 0
    ? ` A explicação deve ter CERCA de ${targetWords} palavras — nunca ultrapasse ` +
      `${Math.round(targetWords * 1.25)} palavras.`
    : "";
  const systemPrompt =
    `Você é um assistente de leitura. Explique o texto completo da página ` +
    `a seguir em ${targetLang}, de forma clara e didática. ` +
    `Cubra: o sentido geral da página, termos ou conceitos importantes, ` +
    `possíveis dificuldades de tradução (idiotismos, referências culturais), ` +
    `e como este trecho se conecta com o resto da obra.${lengthRule} ` +
    `Use quebras de linha para separar seções. ` +
    `NÃO use asteriscos, negrito, itálico ou markdown — só texto puro. ` +
    `Não invente — se não souber algo, diga.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      const result = await provider.complete(text, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.4,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.4,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/** Explica um trecho (sentido, idiotismos, contexto). */
export async function explain(
  text: string,
  ctx: BookContext,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um assistente de leitura. Explique o trecho fornecido em ${targetLang}, ` +
    `de forma clara e didática. ` +
    `Cubra: sentido literal, possíveis sentidos figurados, idiotismos ou ` +
    `referências culturais, e como ele se encaixa no contexto da obra. ` +
    `Seja conciso (2 a 4 parágrafos curtos). ` +
    `Não invente — se não souber algo, diga.`;

  try {
    const { provider } = resolveProvider();
    const result = await provider.complete(
      `Explique este trecho:\n\n"${text}"`,
      {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.4,
      },
    );
    return { ok: true, text: result.text };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/** Versão STREAMING de explain. */
export async function explainStream(
  text: string,
  ctx: BookContext,
  onChunk: StreamCallback,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um assistente de leitura. Explique o trecho fornecido em ${targetLang}, ` +
    `de forma clara e didática. ` +
    `Cubra: sentido literal, possíveis sentidos figurados, idiotismos ou ` +
    `referências culturais, e como ele se encaixa no contexto da obra. ` +
    `Seja conciso (2 a 4 parágrafos curtos). ` +
    `Não invente — se não souber algo, diga.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      const result = await provider.complete(`Explique este trecho:\n\n"${text}"`, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.4,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(`Explique este trecho:\n\n"${text}"`, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.4,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Traduz um texto pra um idioma EXPLÍCITO (não o targetLang da config).
 * Uso: preparar texto pra LEITURA EM VOZ ALTA — se o idioma da fala
 * configurado é diferente do idioma do livro, traduzimos primeiro na
 * nuvem da IA e depois falamos a tradução (ex.: livro em inglês,
 * fala em português).
 */
export async function translateForSpeech(
  text: string,
  speechLang: string,
  ctx: BookContext,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const systemPrompt =
    `Você é um tradutor literário e técnico de excelência. ` +
    `Traduza o trecho fornecido para ${speechLang}. ` +
    `A tradução será LIDA EM VOZ ALTA: prefira frases fluídas e naturais ` +
    `ao ouvido, mantendo o sentido e o tom da obra. ` +
    `Devolva APENAS a tradução, sem comentários, sem aspas, sem introdução.`;

  try {
    const { provider } = resolveProvider();
    const result = await provider.complete(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.3,
    });
    return { ok: true, text: result.text };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/** Responde uma pergunta livre sobre o livro (preview do Q&A — sem RAG ainda). */
export async function ask(
  question: string,
  ctx: BookContext,
): Promise<AIActionResult> {
  if (!question.trim()) return { ok: false, error: "Pergunta ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um assistente de leitura ajudando alguém com o livro "${ctx.bookTitle ?? "desconhecido"}". ` +
    `Responda em ${targetLang}, de forma útil e honesta. ` +
    `Se não souber algo por falta de contexto do texto, diga — não invente. ` +
    `(Em breve: respostas fundamentadas no texto da obra.)`;

  try {
    const { provider } = resolveProvider();
    const result = await provider.complete(question, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.4,
    });
    return { ok: true, text: result.text };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Versão STREAMING de ask: a resposta vai aparecendo aos poucos.
 * Usada pela janela "Pergunte qualquer coisa" do Reader.
 */
export async function askStream(
  question: string,
  ctx: BookContext,
  onChunk: StreamCallback,
): Promise<AIActionResult> {
  if (!question.trim()) return { ok: false, error: "Pergunta ausente." };
  const targetLang = getTargetLang();
  const systemPrompt =
    `Você é um assistente de leitura ajudando alguém com o livro "${ctx.bookTitle ?? "desconhecido"}"` +
    (ctx.bookAuthor ? ` de ${ctx.bookAuthor}` : "") + `. ` +
    `Responda em ${targetLang}, de forma útil, calorosa e honesta. ` +
    `A pessoa pode perguntar sobre a obra, o autor, o tema, ou pedir pra ` +
    `saber mais sobre um capítulo ou passagem. ` +
    `Se não souber algo por falta de contexto do texto, diga — não invente. ` +
    `Use texto puro, sem markdown.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      const result = await provider.complete(question, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.4,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(question, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.4,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Resume um texto (página ou compilação do livro) com streaming.
 *
 * `scope` = "page" (a página na tela — resumo direto e fiel) ou
 * "book" (compilação de trechos do livro inteiro — resumo panorâmico,
 * avisando que é baseado numa amostra quando o texto veio truncado).
 */
export async function summarizeStream(
  text: string,
  scope: "page" | "book",
  ctx: BookContext,
  onChunk: StreamCallback,
  /** Tamanho-alvo em palavras (barra deslizante do modal de anotação). */
  targetWords?: number,
): Promise<AIActionResult> {
  if (!text.trim()) return { ok: false, error: "Texto ausente." };
  const targetLang = getTargetLang();
  const lengthRule = targetWords && targetWords > 0
    ? ` O resumo deve ter CERCA de ${targetWords} palavras — nunca ultrapasse ` +
      `${Math.round(targetWords * 1.25)} palavras.`
    : "";
  const systemPrompt =
    scope === "page"
      ? `Você é um assistente de leitura. Resuma a página a seguir em ${targetLang}, ` +
        `de forma clara e fiel: a ideia central, os pontos principais e ` +
        `qualquer virada importante.${lengthRule || " Use de 3 a 6 frases, ou tópicos curtos se couber melhor."} ` +
        `Não comente fora do texto. Não invente. Texto puro, sem markdown.`
      : `Você é um assistente de leitura. A seguir vai uma COMPILAÇÃO de trechos ` +
        `do livro "${ctx.bookTitle ?? "desconhecido"}" (títulos de capítulos e ` +
        `passagens representativas — possivelmente truncada). ` +
        `Escreva em ${targetLang} um resumo panorâmico da obra: tema, enredo ou ` +
        `argumento central, personagens/ideias principais e tom geral. ` +
        `Se a amostra for claramente parcial, diga isso numa frase final honesta. ` +
        `Texto puro, sem markdown. Não invente fatos que não estejam na amostra.`;

  try {
    const { provider } = resolveProvider();
    if (!provider.stream) {
      const result = await provider.complete(text, {
        systemPrompt,
        context: buildContext(ctx),
        temperature: 0.4,
      });
      onChunk(result.text, result.text);
      return { ok: true, text: result.text };
    }
    let full = "";
    for await (const chunk of provider.stream(text, {
      systemPrompt,
      context: buildContext(ctx),
      temperature: 0.4,
    })) {
      full += chunk;
      onChunk(full, chunk);
    }
    return { ok: true, text: full };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Teste de conexão: faz uma chamada mínima ao provider escolhido.
 * Usado pela tela de Configurações pra validar chave + provedor.
 */
export async function testConnection(
  config: AIConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const transport = createProxyTransport("/api/proxy");
    const provider = getProvider(config, transport);
    const result = await provider.complete("Diga apenas: OK", {
      temperature: 0,
      // 300 tokens: modelos de raciocínio (Grok 4, gpt-5.5, o-series) consomem
      // muitos reasoning_tokens antes de responder — 100 não sobrava pro "OK".
      maxTokens: 300,
    });
    return {
      ok: true,
      message: `Conexão bem-sucedida. Resposta: "${result.text.slice(0, 40)}"`,
    };
  } catch (err) {
    return { ok: false, message: toMessage(err) };
  }
}

/**
 * Busca a lista de modelos disponíveis do provedor (endpoint /models).
 * Retorna um array de IDs de modelo. Cai pra lista vazia se o provedor
 * não suportar /models ou se a chave for inválida.
 */
export async function listModels(
  config: AIConfig,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const preset = getPreset(config.providerId);
    if (!preset) return { ok: false, error: "Provedor desconhecido." };

    const baseUrl = config.baseUrl ?? preset.baseUrl;
    const transport = createProxyTransport("/api/proxy");

    // O endpoint /models é padrão OpenAI-compatible (GET).
    // Gemini e Anthropic têm formatos diferentes — trato abaixo.
    if (preset.adapter === "gemini") {
      // Gemini: GET /models?key=X
      const { status, body } = await transport.request(
        `${baseUrl}/models?key=${encodeURIComponent(config.apiKey)}`,
        { method: "GET", headers: {}, body: "" },
      );
      if (status >= 400) {
        const b = body as { error?: { message?: string } };
        return { ok: false, error: b?.error?.message ?? `Erro ${status}` };
      }
      const data = body as { models?: Array<{ name?: string }> };
      const models = (data.models ?? [])
        .map((m) => m.name?.replace("models/", "") ?? "")
        .filter(Boolean);
      return { ok: true, models };
    }

    // Anthropic: não tem /models público estável. Devolve defaults.
    if (preset.adapter === "anthropic") {
      return {
        ok: true,
        models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-sonnet-4-20250514"],
      };
    }

    // OpenAI-compatible: GET /models com Bearer auth.
    const { status, body } = await transport.request(`${baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: "",
    });
    if (status >= 400) {
      const b = body as { error?: { message?: string } };
      return { ok: false, error: b?.error?.message ?? `Erro ${status}` };
    }
    const data = body as { data?: Array<{ id?: string }> };
    const models = (data.data ?? [])
      .map((m) => m.id ?? "")
      .filter(Boolean)
      .sort();
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}
