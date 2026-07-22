/**
 * POST /api/metrics/ping — registra um evento de métrica.
 *
 * kind: "visit" (1x/dia/aparelho, controlado no cliente) | "install" (PWA).
 * Anônimo pode registrar (visitante conta visita) — a leitura é só pra
 * logados (ver /api/metrics/summary e a página /socios).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let kind: string;
  let deviceHash: string | null = null;
  try {
    const body = (await req.json()) as { kind?: string; deviceHash?: string };
    kind = String(body.kind ?? "");
    deviceHash = body.deviceHash ? String(body.deviceHash).slice(0, 64) : null;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (kind !== "visit" && kind !== "install") {
    return NextResponse.json({ error: "kind inválido." }, { status: 400 });
  }

  try {
    const supabase = createClient();
    await supabase.from("metrics_events").insert({
      kind,
      device_hash: deviceHash,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Métrica nunca derruba o app: falha silenciosa.
    console.warn("[metrics] ping falhou:", err);
    return NextResponse.json({ ok: false });
  }
}
