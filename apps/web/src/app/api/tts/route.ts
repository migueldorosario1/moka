/**
 * POST /api/tts
 *
 * Gera áudio (Text-to-Speech) usando o provedor de IA configurado.
 * Recebe o texto + config (provedor, chave, modelo TTS, voz) e devolve
 * um MP3 pronto pra tocar no navegador.
 *
 * Suporta:
 *   - OpenAI (tts-1, tts-1-hd) — vozes Alloy, Echo, Fable, Onyx, Nova, Shimmer
 *   - DeepSeek/OpenRouter se suportarem /audio/speech
 *
 * Privacidade: a chave vem do cliente (BYOK), não é armazenada.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

// Hosts permitidos pra TTS (mesma allowlist do proxy + audio/speech).
// Grok (xAI) e Groq adicionados: ambos têm TTS OpenAI-compatible.
const TTS_HOSTS = new Set<string>([
  "api.openai.com",
  "api.deepseek.com",
  "api.together.xyz",
  "api.x.ai",
  "api.groq.com",
]);

interface TTSBody {
  text: string;
  voice?: string;
  model?: string;
  baseUrl: string;
  apiKey: string;
}

export async function POST(req: Request) {
  let payload: TTSBody;
  try {
    payload = (await req.json()) as TTSBody;
  } catch {
    return new Response("Body inválido.", { status: 400 });
  }

  const { text, voice = "alloy", model = "tts-1", baseUrl, apiKey } = payload;

  if (!text?.trim() || !apiKey?.trim() || !baseUrl?.trim()) {
    return new Response("Parâmetros ausentes (text, apiKey, baseUrl).", { status: 400 });
  }

  // Valida o host (anti-SSRF).
  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return new Response("baseUrl inválido.", { status: 400 });
  }

  if (!TTS_HOSTS.has(hostname)) {
    return new Response(`Host não permitido para TTS: ${hostname}`, { status: 403 });
  }

  // Limita o tamanho do texto (OpenAI aceita até 4096 caracteres no TTS).
  const truncated = text.slice(0, 4000);

  try {
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const response = await fetch(`${cleanBaseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: truncated,
        voice,
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return new Response(
        `Erro do provedor TTS (${response.status}): ${errText.slice(0, 300)}`,
        { status: response.status },
      );
    }

    // Devolve o áudio MP3 diretamente.
    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Erro ao gerar áudio: ${msg}`, { status: 500 });
  }
}
