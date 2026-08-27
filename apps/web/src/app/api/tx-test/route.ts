/**
 * POST /api/tx-test — botão "▶ Testar chave" da seção 🎬 Moka Vídeo
 * (pedido do Miguel, 27/08: "tinha que ter um botãozinho de teste").
 *
 * Valida a chave do serviço de transcrição SEM consumir crédito: a sonda
 * cutuca o serviço de um jeito que só checa autenticação (ver byokTestKey).
 * A chave vem no body (HTTPS), é usada na hora e NUNCA persistida — mesmo
 * padrão de privacidade do header x-tx-key do /api/ingest.
 */

import { NextResponse } from "next/server";
import { byokTestKey, type TxByokService } from "@/lib/video/byok-services";

export const runtime = "nodejs";

const SERVICES: TxByokService[] = [
  "supadata",
  "transkriptor",
  "transcriptapi",
  "assemblyai",
];

export async function POST(req: Request) {
  let body: { service?: string; key?: string };
  try {
    body = (await req.json()) as { service?: string; key?: string };
  } catch {
    return NextResponse.json({ ok: false, message: "JSON inválido." }, { status: 400 });
  }
  const service = body.service as TxByokService | undefined;
  const key = body.key?.trim() ?? "";
  if (!service || !SERVICES.includes(service) || !key) {
    return NextResponse.json(
      { ok: false, message: "Escolha o serviço e cole a chave antes de testar." },
      { status: 400 },
    );
  }
  const result = await byokTestKey(service, key);
  return NextResponse.json(result);
}
