/**
 * GET /api/metrics/summary — os números do Painel de Sócios.
 *
 * Só pra usuário LOGADO (o painel é dos sócios). Devolve:
 *  - visitas hoje / total de visitas únicas por dia (soma dos dias)
 *  - instalações do app (total)
 *  - assinantes pagantes ativos (0 até a sprint de pagamento)
 *  - sócios (lista com posição) e total de vagas (200)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "login necessário" }, { status: 401 });
  }

  const out = {
    visitsToday: 0,
    visitsTotal: 0,
    installs: 0,
    subscribers: 0,
    partnersTotal: 200,
    partners: [] as Array<{ position: number; name: string; created_at: string }>,
    myPosition: null as number | null,
  };

  try {
    // Visitas de hoje (hashes únicos) e total de eventos.
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayRows } = await supabase
      .from("metrics_events")
      .select("device_hash")
      .eq("kind", "visit")
      .eq("day", today);
    out.visitsToday = new Set((todayRows ?? []).map((r) => r.device_hash)).size;

    const { count: visitsCount } = await supabase
      .from("metrics_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "visit");
    out.visitsTotal = visitsCount ?? 0;

    const { count: installsCount } = await supabase
      .from("metrics_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "install");
    out.installs = installsCount ?? 0;
  } catch {
    // Tabela ainda não criada (SQL pendente) — devolve zeros.
  }

  try {
    const { count } = await supabase
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("status", ["active", "trialing"]);
    out.subscribers = count ?? 0;
  } catch {
    /* tabela ainda não existe — zero */
  }

  try {
    const { data: partners } = await supabase
      .from("partners")
      .select("position, name, created_at")
      .order("position", { ascending: true });
    out.partners = partners ?? [];
    const mine = (partners ?? []).find(
      (p) => (p as { user_id?: string }).user_id === session.user.id,
    );
    out.myPosition = (mine as { position?: number } | undefined)?.position ?? null;
  } catch {
    /* idem */
  }

  return NextResponse.json(out);
}
