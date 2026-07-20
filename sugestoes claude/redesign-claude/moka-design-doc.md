# ☕ Moka — Documento de Design Visual

*Redesign completo aplicado no branch `moka-lab`. Todo o CSS descrito aqui já está implementado nos arquivos do patch — este documento é a referência da identidade.*

## Conceito

**A hora do café.** Abrir o Moka deve sentir como preparar um café antes de ler: porcelana, madeira, cobre e crema. A IA é invisível — o chrome da interface se apaga e o texto é o protagonista.

---

## 1. Paleta refinada

### Light mode (porcelana + cobre queimado)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#f6efe3` | porcelana quente (fundo) |
| `--surface` | `#fffcf5` | louça branca (cards) |
| `--surface-alt` | `#eee3d1` | madeira clara (áreas secundárias) |
| `--text` | `#2b2015` | espresso (texto principal) |
| `--text-muted` | `#8b7460` | café com leite (secundário) |
| `--border` | `#e3d6c1` | bege-madeira |
| `--border-soft` | `#ede3d2` | borda quase invisível (novo) |
| `--accent` | `#a35d2f` | cobre queimado (principal) |
| `--accent-soft` | `#f3e4d0` | crema (hovers, fundos) |
| `--accent-dark` | `#7e4522` | cobre escuro (press, ênfase) |
| `--gold` | `#c2955c` | dourado envelhecido (detalhes) |

### Dark mode (madeira à meia-luz)

`--bg #1a1410` · `--surface #221b15` · `--surface-alt #2d241c` · `--text #f0e6d5` · `--text-muted #a68f79` · `--border #3a2f24` · `--accent #d29360` · `--accent-soft #33251a` · `--gold #d3a96e`

**Regra de ouro:** nenhuma sombra ou overlay cinza-frio. Tudo tingido de marrom (`rgba(62, 42, 24, …)` no claro, `rgba(30, 20, 12, …)` em backdrops).

## 2. Tipografia (Google Fonts via next/font)

Três vozes, um só clima:

| Papel | Fonte | Por quê |
|---|---|---|
| **Display** (marca, títulos, nomes de livros) | **Fraunces** | Serifada "soft", calor de letreiro de cafeteria antiga. É a personalidade do app. |
| **Leitura** (corpo dos livros, respostas da IA, notas) | **Literata** | Desenhada para leitura longa em tela (é a fonte do Google Play Books). |
| **Interface** (botões, labels, menus) | **Figtree** | Sans humanista e discreta — o chrome fica invisível. |

Expostas como `--font-brand`, `--font-serif` (agora Literata) e `--font-sans` (agora Figtree), com fallbacks para Iowan Old Style/Palatino e system-ui. Números de página usam `font-variant-numeric: tabular-nums`.

## 3. Espaçamento e raios

- Escala de espaço mantida (4/8/12/16/24/32) com paddings mais generosos nos pontos-chave: dropzone 52px, painel da IA 24px, estante 32/40px.
- Raios: `--radius-sm 8px` · `--radius 12px` · `--radius-lg 18px` (cards e modais) · `--radius-pill 999px` (botões de ação, chips, bandeja de navegação).
- Coluna de leitura: máx. 680px, `line-height 1.85`.

## 4. Sombras

```css
--shadow-sm: 0 1px 2px rgba(62,42,24,.05), 0 1px 3px rgba(62,42,24,.04);
--shadow:    0 2px 6px rgba(62,42,24,.06), 0 6px 20px rgba(62,42,24,.07);
--shadow-lg: 0 4px 12px rgba(62,42,24,.08), 0 18px 50px rgba(62,42,24,.14);
--shadow-up: 0 -2px 12px rgba(62,42,24,.08);
```

Sempre em dupla camada (contato + ambiente), sempre quentes.

## 5. Transições e movimento

- Curva única: `cubic-bezier(0.25, 0.6, 0.3, 1)` em 180ms — suave, sem pressa.
- `prefers-reduced-motion` respeitado globalmente.
- Foco de teclado: anel de cobre (`:focus-visible`).

## 6. Assinaturas visuais

1. **Vapor da xícara** (tela inicial): três fios dourados sutis sobem e se dissipam sobre a xícara, num ciclo de 3,4s. Atrás do hero, um brilho radial de *crema*.
2. **Livros de verdade** (estante): capas com raio assimétrico `3px 8px 8px 3px`, lombada com gradiente à esquerda; no hover o livro "levanta" (`translateY(-6px) rotate(-0.5deg)`) e a sombra aprofunda.
3. **Bandeja flutuante** (navegação do leitor): a nav bar virou uma pílula com blur, solta do rodapé como um pires na mesa, com slider customizado (trilho fino, pingo de cobre).
4. **Pílula de cobre** (menu de seleção): Traduzir/Explicar num gradiente cobre→cobre-escuro com brilho interno superior.

## 7. Componentes

- **Topbar**: marca em Fraunces com gradiente cobre→dourado discreto; ícones viram *ghost buttons* (sem borda, hover em crema).
- **Reader header**: título do livro em Fraunces; ações da página como *pills* suaves; borda `--border-soft` e sombra mínima.
- **AIPanel**: logo do Cafezinho no header; **respostas em Literata 16px/1.75** — a IA responde com cara de página de livro; campo de pergunta com anel de foco em crema; botão de enviar circular em gradiente cobre.
- **Modais** (Notas, Configurações): backdrop marrom com `blur(5px)`, card `--radius-lg` + `--shadow-lg`; citações de notas com barra dourada e corpo em Literata.
- **Premium**: título em Fraunces, cards com hover que levita.
- **Scrollbars**: finas, trilho transparente, polegar bege (dourado no hover).

## 8. Arquivos alterados

`globals.css` · `layout.tsx` (fontes + themeColor `#a35d2f`) · `page.tsx` (estante) · `Uploader.tsx` · `AIPanel.tsx` · `Reader.tsx` · `SettingsModal.tsx` · `premium/sobre/ajuda/privacidade`.

Build verificado (`next build` ✓) e telas conferidas em screenshot: início (claro/escuro/mobile), estante, leitor, menu de seleção e premium.

## 9. Como aplicar

```bash
git checkout moka-lab
git am moka-redesign.patch   # ou: git apply moka-redesign.patch
git push origin moka-lab
```

Alternativa: extrair o `moka-redesign-arquivos.zip` na raiz do repositório (sobrescreve os 11 arquivos) e commitar.
