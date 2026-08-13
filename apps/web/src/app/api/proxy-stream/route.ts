/**
 * POST /api/proxy-stream
 *
 * Igual ao /api/proxy (repassa ao provedor de IA com allowlist anti-SSRF),
 * mas devolve o Response BRUTO em vez de JSON parseado. Assim o body chega
 * como ReadableStream — habilitando SSE (Server-Sent Events) pra streaming
 * de respostas da IA, palavra por palavra.
 *
 * Privacidade: igual ao proxy comum — não persiste nem loga chaves.
 */

import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set<string>([
  "api.z.ai",
  "api.openai.com",
  "api.deepseek.com",
  "api.moonshot.cn",
  "api.moonshot.ai",
  "dashscope.aliyuncs.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.together.xyz",
]);

const LOCAL_HOSTS = new Set<string>(["localhost", "127.0.0.1"]);

interface ProxyBody {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export const runtime = "nodejs";
// Streaming de IA pode demorar MUITO (modelos com "thinking" como o DeepSeek V4
// pensam antes de responder; e tradução de página inteira é texto longo).
// 60s era pouco e estourava (reporte do Miguel, 13/08). Plano Pro → até 300s.
export const maxDuration = 300;
// Streaming precisa de buffer dinâmico (não queremos esperar o response inteiro).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: ProxyBody;
  try {
    payload = (await req.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { url, method, headers, body } = payload;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL ausente." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL malformada." }, { status: 400 });
  }

  const isLocal = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    return NextResponse.json(
      { error: `Protocolo não permitido: ${parsed.protocol}` },
      { status: 400 },
    );
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname) && !LOCAL_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: `Host não permitido: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  try {
    // Repassa o fetch e devolve o Response BRUTO (com .body como stream).
    const upstream = await fetch(url, {
      method: method || "POST",
      headers,
      ...(body ? { body } : {}),
    });

    // Devolve como Response puro, preservando o stream do body.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Falha ao contatar o provedor: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }
}
