"use client";

import { useState } from "react";

/**
 * Botão ✕ Fechar — claro e visível (pedido insistente do Miguel).
 *
 * Verdade técnica: um PWA não pode se fechar sozinho (o sistema operacional
 * é dono da janela). Então o botão faz o melhor possível, em ordem:
 *  1. window.close() — funciona se a janela foi aberta por script;
 *  2. history.back() — no app instalado, "voltar" na raiz fecha/minimiza;
 *  3. Se nada funcionar, mostra a dica do gesto do sistema (toast).
 */
export function CloseAppButton() {
  const [hint, setHint] = useState(false);

  const handleClose = () => {
    // 1) Tenta fechar direto.
    window.close();
    // 2) Se continuar aberto (quase sempre), tenta voltar — no PWA instalado
    //    em tela cheia, "voltar" na raiz minimiza/fecha o app.
    setTimeout(() => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      setHint(true);
      setTimeout(() => setHint(false), 5000);
    }, 200);
  };

  return (
    <>
      <button
        className="close-app-btn"
        onClick={handleClose}
        title="Fechar o aplicativo"
        aria-label="Fechar o aplicativo"
      >
        ✕ <span className="close-app-label">Fechar</span>
      </button>
      {hint && (
        <div className="close-app-toast" role="status">
          💡 Pra fechar o app: no celular, arraste ele pra cima (ou use o botão
          voltar do aparelho); no computador, feche a janela/aba normalmente.
        </div>
      )}
    </>
  );
}
