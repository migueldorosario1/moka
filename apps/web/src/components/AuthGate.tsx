"use client";

import { useEffect, useState } from "react";
import { AuthButton } from "./AuthButton";
import { AuthModal } from "./AuthModal";
import { useAuth } from "@/lib/auth";
import { getConta, setConta, type ContaPontos } from "@/lib/moka-conta";

/**
 * AuthGate = botão de conta + janela de cadastro (Google OU e-mail).
 * Um único ponto de entrada pra autenticação no app inteiro (pedido do
 * Miguel, 05/08): tocar no avatar/entrar abre a AuthModal com as duas
 * portas — não vai direto pro Google como antes.
 *
 * PORTA DUPLA no INDICADOR (bug do Miguel, 06/09): o login pode existir só
 * na conta CLOUD (Supabase, sync de biblioteca) ou só na conta de PONTOS
 * (gateway Tencent — ex.: a conta de teste do revisor). Qualquer uma das
 * duas conta como "logado" pro botão: ele vira avatar 👤 na hora e não
 * fica escrito "Entrar" com o usuário já dentro (era o bug).
 */
export function AuthGate() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [conta, setContaState] = useState<ContaPontos | null>(null);

  // Espelha a conta de pontos (login pode ter vindo da outra porta —
  // AuthModal com fallback — e o evento avisa na hora, sem reload).
  useEffect(() => {
    const sync = () => setContaState(getConta());
    sync();
    window.addEventListener("moka-conta-mudou", sync);
    return () => window.removeEventListener("moka-conta-mudou", sync);
  }, []);

  const logadoPontos = Boolean(conta);
  const status = auth.status === "loading" && !logadoPontos
    ? "loading"
    : auth.user || logadoPontos
      ? "authed"
      : "anon";

  const signOut = async () => {
    if (conta) {
      setConta(null);
      setContaState(null);
      window.dispatchEvent(new Event("moka-conta-mudou"));
    }
    await auth.signOut();
  };

  return (
    <>
      <AuthButton
        status={status}
        userName={auth.user?.user_metadata?.full_name ?? null}
        userEmail={auth.user?.email ?? conta?.email ?? null}
        avatarUrl={auth.user?.user_metadata?.avatar_url ?? null}
        onSignIn={() => setOpen(true)}
        onSignOut={signOut}
      />
      {open && <AuthModal auth={auth} onClose={() => setOpen(false)} />}
    </>
  );
}
