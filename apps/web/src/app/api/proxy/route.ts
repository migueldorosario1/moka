/**
 * POST /api/proxy
 *
 * Proxy leve que repassa uma requisição ao provedor de IA escolhido pelo
 * usuário. Existe puramente para furar o CORS: provedores não enviam headers
 * de CORS, então o navegador não consegue chamá-los diretamente.
 *
 * Privacidade:
 *   - A chave do usuário vem no corpo/header da requisição e é repassada
 *     imediatamente ao provedor. NÃO é persistida, NÃO é logada.
 *   - O servidor não interpreta o conteúdo — só encaminha bytes.
 *
 * Segurança:
 *   - A URL de destino é validada contra uma ALLOWLIST de hosts. Evita que
 *     o proxy seja usado como SSRF aberto (ex.: alguém apontando pra
 *     http://169.254.169.254 pra ler metadados de nuvem).
 */

import { NextResponse } from "next/server";

/** Hosts permitidos como destino do proxy. */
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
  "api.x.ai",
  "api.groq.com",
  "api.mistral.ai",
]);

/** Hosts locais permitidos (para self-hosted / desenvolvimento). */
const LOCAL_HOSTS = new Set<string>([
  "localhost",
  "127.0.0.1",
]);

interface ProxyBody {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** valida o host de destino contra a allowlist. */
function isHostAllowed(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  if (LOCAL_HOSTS.has(hostname)) return true;
  return false;
}

export const runtime = "nodejs";
// 60s era pouco p/ modelos com "thinking" (DeepSeek V4) + páginas grandes.
// Plano Pro da Vercel → até 300s. (Reporte do Miguel, 13/08.)
export const maxDuration = 300;

export async function POST(req: Request) {
  let payload: ProxyBody;
  try {
    payload = (await req.json()) as ProxyBody;
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400 },
    );
  }

  const { url, method, headers, body } = payload;
  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "URL ausente." },
      { status: 400 },
    );
  }

  // Valida a URL e extrai o host.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "URL malformada." },
      { status: 400 },
    );
  }

  // Apenas HTTPS em produção; HTTP só pra localhost (self-hosted/dev).
  const isLocal = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    return NextResponse.json(
      { error: `Protocolo não permitido: ${parsed.protocol}` },
      { status: 400 },
    );
  }

  if (!isHostAllowed(parsed.hostname)) {
    return NextResponse.json(
      { error: `Host não permitido: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  // Repassa a requisição. O body pode vir vazio (alguns endpoints GET),
  // mas os adapters sempre usam POST com JSON.
  try {
    const upstream = await fetch(url, {
      method: method || "POST",
      headers,
      ...(body ? { body } : {}),
    });

    // Repassa o corpo como JSON quando possível; senão, como texto.
    let respBody: unknown = null;
    const text = await upstream.text();
    if (text) {
      try {
        respBody = JSON.parse(text);
      } catch {
        respBody = text;
      }
    }

    return NextResponse.json({
      status: upstream.status,
      body: respBody,
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
