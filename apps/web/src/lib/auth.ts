"use client";

/**
 * Hook useAuth — expõe o estado de login do usuário.
 *
 * status: "loading" | "anon" | "authed"
 *   - loading: ainda verificando a sessão (boot)
 *   - anon: deslogado (usa IndexedDB local)
 *   - authed: logado (sincroniza no Supabase)
 *
 * user: dados do usuário (id, email, avatar) quando logado, null caso contrário.
 *
 * Ações: signInWithGoogle() e signOut().
 */

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

export type AuthStatus = "loading" | "anon" | "authed";

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Se as variáveis de ambiente não tão configuradas, fica anon e segue.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("anon");
      return;
    }

    const supabase = createClient();

    // Pega a sessão inicial (já tem cookie?).
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setStatus(data.session ? "authed" : "anon");
    });

    // Escuta mudanças (login/logout em outra aba, etc).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "authed" : "anon");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setStatus("anon");
  }, []);

  /** Entrar com e-mail + senha (pedido do Miguel, 05/08 — cadastro duplo:
   *  Google OU e-mail comum, porque a biblioteca synca e o e-mail vira
   *  canal de contato com o leitor). */
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  /** Criar conta com e-mail + senha. Com a confirmação de e-mail ligada no
   *  Supabase, a pessoa recebe o link e SÓ ENTRA depois de clicar nele —
   *  exatamente o fluxo pedido pelo Miguel ("clique em e-mail, chega no
   *  e-mail e você confirma"). */
  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Depois de confirmar o e-mail, cai na página "✅ E-mail confirmado"
        // (pedido do Miguel, 05/08 — antes caía na home sem aviso nenhum).
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/auth/confirmado`,
      },
    });
    if (error) throw new Error(error.message);
    // Confirmação ligada → session é null até clicar no link do e-mail.
    return { needsConfirmation: !data.session };
  }, []);

  /** "Esqueci a senha": manda o link por e-mail; o link cai no callback e
   *  de lá pra /auth/atualizar-senha (param `next`). */
  const resetPassword = useCallback(async (email: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/auth/atualizar-senha`,
    });
    if (error) throw new Error(error.message);
  }, []);

  /** Define a nova senha (depois do link de recuperação). */
  const updatePassword = useCallback(async (newPassword: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }, []);

  return {
    status,
    user,
    /** id do usuário quando logado (pra repassar ao repository). */
    userId: user?.id ?? null,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    resetPassword,
    updatePassword,
    signOut,
  };
}
