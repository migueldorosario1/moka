"use client";

import { useEffect } from "react";

/**
 * Layout da seção 🎬 Vídeo — aplica um matiz sutilmente diferente
 * (classe `section-video` no <body>) para o usuário perceber que
 * está na seção de vídeos, sem quebrar a identidade do Moka.
 */
export default function VideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add("section-video");
    return () => document.body.classList.remove("section-video");
  }, []);

  return <>{children}</>;
}
