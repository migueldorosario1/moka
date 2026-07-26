"use client";

/**
 * Logo oficial Moka V3 — Design porcelana, azul safira e cobre.
 *
 * Ícone SVG vetorial de alta precisão: xícara Moka estilizada com vapor elegante,
 * com gradientes dinâmicos de safira e cobre que se adaptam aos temas claro e escuro.
 */
export function CafezinhoLogo({
  size = 28,
  opacity = 1,
  title = "Moka",
}: {
  size?: number;
  opacity?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      style={{ opacity, display: "block", flexShrink: 0 }}
    >
      <defs>
        {/* Gradiente do Corpo da Xícara Moka (Azul Safira para Azul Cobalto) */}
        <linearGradient id="mokaCupGrad" x1="6" y1="12" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#0f4c81" />
          <stop offset="100%" stopColor="#0d2b45" />
        </linearGradient>

        {/* Gradiente do Vapor e Detalhes de Cobre */}
        <linearGradient id="mokaSteamGrad" x1="16" y1="4" x2="32" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e07a5f" />
          <stop offset="100%" stopColor="#c87d55" />
        </linearGradient>

        <linearGradient id="mokaGlow" x1="24" y1="18" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Vapor Estilizado (Três Ondas Suaves de Cobre) */}
      <path
        d="M17 12C16 9.5 18 7.5 17.5 5"
        stroke="url(#mokaSteamGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M24 10.5C23 7.5 25.5 5.5 24.5 3"
        stroke="url(#mokaSteamGrad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M31 12C30 9.5 32 7.5 31.5 5"
        stroke="url(#mokaSteamGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Corpo Principal da Xícara Moka (Forma Moka geométrica moderna) */}
      <path
        d="M12 18H36L34 32C33.5 36.5 30 40 25.5 40H22.5C18 40 14.5 36.5 14 32L12 18Z"
        fill="url(#mokaCupGrad)"
      />

      {/* Brilho interno de porcelana */}
      <path
        d="M14 20H34L32.8 28C32.4 31.5 29.5 34 26 34H22C18.5 34 15.6 31.5 15.2 28L14 20Z"
        fill="url(#mokaGlow)"
      />

      {/* Asa / Alça da Xícara (Cobre Estilizado) */}
      <path
        d="M35 21C39 21 42 24 42 27.5C42 31 39 34 34.5 34"
        stroke="url(#mokaSteamGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Pires Minimalista */}
      <path
        d="M10 42C14 44 34 44 38 42"
        stroke="url(#mokaSteamGrad)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
