/**
 * 🧑‍🌾 ZeMocaAvatar — o roceiro com enxada no ombro (símbolo do Zé Moca).
 *
 * SVG vetorial próprio (não emoji genérico) — escala em qualquer tamanho e
 * tema. Desenho: figura estilizada de roceiro (chapéu de aba), enxada
 * apoiada no ombro direito (inclinada pra trás), expressão amigável.
 *
 * Cores usam currentColor pra herdar do contexto (funciona em qualquer tema).
 * Pedido do Miguel (09/08): "um roceirozinho com uma enxada no ombro,
 * segurando uma enxada no ombro assim para trás".
 */
export function ZeMocaAvatar({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Zé Moca — roceiro com enxada"
    >
      {/* Fundo circular suave (glass) */}
      <circle cx="50" cy="50" r="48" fill="var(--surface, #fff)" stroke="var(--accent, #b06a3b)" strokeWidth="2" />

      {/* ── Enxada no ombro (inclinada pra trás, ~135°) ── */}
      {/* Cabo da enxada */}
      <line x1="30" y1="20" x2="68" y2="72" stroke="#8b5a2b" strokeWidth="3.5" strokeLinecap="round" />
      {/* Lâmina da enxada (metal) no topo */}
      <path
        d="M 27 17 L 22 12 Q 18 9 22 7 L 31 14 Q 34 17 31 20 Z"
        fill="#6b7280"
        stroke="#4b5563"
        strokeWidth="1"
      />

      {/* ── Roceiro ── */}
      {/* Corpo (camisa, simples) */}
      <path
        d="M 40 52 Q 40 46 50 46 Q 60 46 60 52 L 62 70 L 38 70 Z"
        fill="var(--accent, #b06a3b)"
      />
      {/* Braço esquerdo (relaxado, ao lado) */}
      <path d="M 41 52 Q 37 58 38 66" stroke="#d4a574" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      {/* Braço direito (segurando enxada no ombro — sobe até o cabo) */}
      <path d="M 59 52 Q 64 50 66 58" stroke="#d4a574" strokeWidth="4.5" strokeLinecap="round" fill="none" />

      {/* Cabeça (pele) */}
      <circle cx="50" cy="38" r="9" fill="#d4a574" />

      {/* Chapéu de aba (estilo roceiro/country) */}
      <ellipse cx="50" cy="30" rx="16" ry="3.5" fill="#8b5a2b" />
      <path d="M 42 30 Q 42 23 50 23 Q 58 23 58 30 Z" fill="#6b3a1b" />

      {/* Olhos (simples, amigáveis) */}
      <circle cx="47" cy="38" r="1.2" fill="#2b2015" />
      <circle cx="53" cy="38" r="1.2" fill="#2b2015" />

      {/* Sorriso */}
      <path d="M 47 42 Q 50 44 53 42" stroke="#2b2015" strokeWidth="1.3" strokeLinecap="round" fill="none" />

      {/* Pernas (calça simples) */}
      <path d="M 45 70 L 44 84" stroke="#2c3e50" strokeWidth="5" strokeLinecap="round" />
      <path d="M 55 70 L 56 84" stroke="#2c3e50" strokeWidth="5" strokeLinecap="round" />

      {/* Botas */}
      <ellipse cx="44" cy="85" rx="4" ry="2.5" fill="#1a1208" />
      <ellipse cx="56" cy="85" rx="4" ry="2.5" fill="#1a1208" />
    </svg>
  );
}
