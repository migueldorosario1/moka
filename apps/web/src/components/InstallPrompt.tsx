"use client";

import { useEffect, useState } from "react";

/**
 * InstallPrompt — "pra usar o Moka Video, instale" (pedido do Miguel).
 *
 * O Moka Video é um APLICATIVO: a leitura de vídeos acontece no aparelho
 * do usuário (pelo IP dele, que o YouTube não bloqueia). No navegador
 * puro, sem instalar, a leitura fica limitada. Por isso o cartão de
 * instalação é parte do produto, não um detalhe:
 *
 *  - Chrome/Edge/desktop: captura `beforeinstallprompt` e instala direto.
 *  - iPhone/iPad (Safari): não existe prompt automático — o cartão ensina
 *    o caminho manual (Compartilhar → Adicionar à Tela de Início).
 *  - O botão nativo do navegador é fugaz e confuso (feedback do Miguel) —
 *    este cartão FICA na tela até a pessoa decidir.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mokavideo.installDismissedAt";
const INSTALLED_KEY = "mokavideo.installed";
const DISMISS_DAYS = 7;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios] = useState(isIos);

  useEffect(() => {
    // Já instalou alguma vez (flag nossa) ou está rodando como app?
    // Nunca mais mostra o cartão — nem no app, nem em abas do navegador
    // (feedback do Miguel: "já instalei, não precisa avisar de novo").
    if (
      localStorage.getItem(INSTALLED_KEY) === "1" ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setInstalled(true);
      return;
    }

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    const recentlyDismissed =
      dismissedAt > 0 &&
      Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;

    // No iOS não há beforeinstallprompt: mostra o cartão com instruções.
    if (ios) {
      if (!recentlyDismissed) setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // segura o prompt nativo fugaz
      setDeferred(e as BeforeInstallPromptEvent);
      if (!recentlyDismissed) setVisible(true);
    };
    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [ios]);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
      setInstalled(true);
    } else {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
    setDeferred(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (installed || !visible) return null;
  if (!ios && !deferred) return null;

  return (
    <div className="install-card" role="dialog" aria-label="Instalar o Moka Video">
      <div className="install-card-icon">📱</div>
      <div className="install-card-text">
        <strong>Para usar o Moka Video, instale o aplicativo</strong>
        <span>
          O Moka lê os vídeos <em>no seu aparelho</em>, pela sua própria
          internet — é assim que ele escapa do bloqueio do YouTube. No
          navegador, sem instalar, a leitura fica limitada. É grátis, leve
          e não passa por loja de aplicativos.
          {ios && (
            <>
              <br />
              <strong>Como instalar neste aparelho:</strong> toque em{" "}
              <strong>Compartilhar</strong> (o ícone de quadrado com seta ⬆️)
              e depois em <strong>“Adicionar à Tela de Início”</strong>.
            </>
          )}
        </span>
      </div>
      <div className="install-card-actions">
        {!ios && (
          <button className="install-card-btn" onClick={handleInstall}>
            ⬇️ Instalar
          </button>
        )}
        <button className="install-card-dismiss" onClick={handleDismiss}>
          {ios ? "Entendi" : "Agora não"}
        </button>
      </div>
    </div>
  );
}
