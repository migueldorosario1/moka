"use client";

import { useState } from "react";
import { AuthButton } from "./AuthButton";
import { AuthModal } from "./AuthModal";
import { useAuth } from "@/lib/auth";

/**
 * AuthGate = botão de conta + janela de cadastro (Google OU e-mail).
 * Um único ponto de entrada pra autenticação no app inteiro (pedido do
 * Miguel, 05/08): tocar no avatar/entrar abre a AuthModal com as duas
 * portas — não vai direto pro Google como antes.
 */
export function AuthGate() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AuthButton
        status={auth.status}
        userName={auth.user?.user_metadata?.full_name ?? null}
        userEmail={auth.user?.email ?? null}
        avatarUrl={auth.user?.user_metadata?.avatar_url ?? null}
        onSignIn={() => setOpen(true)}
        onSignOut={auth.signOut}
      />
      {open && <AuthModal auth={auth} onClose={() => setOpen(false)} />}
    </>
  );
}
