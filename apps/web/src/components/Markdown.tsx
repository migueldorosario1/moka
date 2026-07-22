/**
 * Markdown leve — renderiza o markdown das respostas da IA sem dependências.
 *
 * Suporta o que os prompts do Moka Video produzem: parágrafos, **negrito**,
 * *itálico*, títulos ###/##, listas com "- " e listas numeradas "1. ".
 * Propositalmente mínimo: a IA é instruída a não usar tabelas nem HTML.
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // **negrito** e *itálico* (sem aninhamento — suficiente pro nosso uso).
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <span key={key}>{part}</span>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Títulos.
        const h3 = trimmed.match(/^###\s+(.*)$/);
        if (h3) return <h3 key={bi}>{renderInline(h3[1], `h3-${bi}`)}</h3>;
        const h2 = trimmed.match(/^##\s+(.*)$/);
        if (h2) return <h2 key={bi}>{renderInline(h2[1], `h2-${bi}`)}</h2>;

        // Lista com bullets (- item) ou numerada (1. item), uma linha cada.
        const lines = trimmed.split("\n").map((l) => l.trim());
        const isUl = lines.every((l) => l.startsWith("- ") || l.startsWith("* "));
        if (isUl && lines.length > 0) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.slice(2), `ul-${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        const isOl = lines.every((l) => /^\d+[.)]\s+/.test(l));
        if (isOl && lines.length > 0) {
          return (
            <ol key={bi}>
              {lines.map((l, li) => (
                <li key={li}>
                  {renderInline(l.replace(/^\d+[.)]\s+/, ""), `ol-${bi}-${li}`)}
                </li>
              ))}
            </ol>
          );
        }

        // Parágrafo (linhas simples viram um parágrafo só).
        return <p key={bi}>{renderInline(trimmed.replace(/\n/g, " "), `p-${bi}`)}</p>;
      })}
    </>
  );
}
