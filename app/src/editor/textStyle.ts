import type { CSSProperties } from "react";

/*
 * Aparência do texto no editor: fonte, tamanho e espaçamentos. É uma
 * preferência de leitura e escrita deste computador; não muda o .md (que é
 * texto puro) nem o livro exportado, que segue a Diagramação.
 */

export const TEXT_FONTS = [
  {
    id: "literata",
    label: "Literata",
    css: '"Literata Variable", "Iowan Old Style", "Palatino Linotype", Georgia, serif',
  },
  { id: "garamond", label: "EB Garamond", css: '"EB Garamond Variable", Garamond, Georgia, serif' },
  { id: "fraunces", label: "Fraunces", css: '"Fraunces Variable", Georgia, serif' },
  { id: "georgia", label: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  {
    id: "figtree",
    label: "Figtree (sem serifa)",
    css: '"Figtree Variable", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "mono",
    label: "Máquina de escrever",
    css: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
  },
] as const;

export type TextFont = (typeof TEXT_FONTS)[number]["id"];

export interface TextStyle {
  font: TextFont;
  /** Tamanho da letra, em px. */
  size: number;
  /** Altura da linha (múltiplo do tamanho). */
  line: number;
  /** Espaço extra entre as letras, em em. */
  letter: number;
  /** Espaço extra entre as palavras, em em. */
  word: number;
  /** Recuo da primeira linha dos parágrafos (a partir do segundo), em em. */
  indent: number;
}

/** Faixas dos controles: mínimo, máximo e passo. */
export const TEXT_RANGES = {
  size: { min: 14, max: 28, step: 1 },
  line: { min: 1.2, max: 2.4, step: 0.05 },
  letter: { min: -0.03, max: 0.15, step: 0.01 },
  word: { min: 0, max: 0.5, step: 0.02 },
  indent: { min: 0, max: 4, step: 0.5 },
} as const;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: "literata",
  size: 19,
  line: 1.75,
  letter: 0,
  word: 0,
  indent: 0,
};

const clamp = (v: unknown, r: { min: number; max: number }, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : fallback;

/** Lê a preferência guardada, corrigindo valores fora da faixa ou de versões antigas. */
export function sanitizeTextStyle(saved: unknown): TextStyle {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<TextStyle>;
  const d = DEFAULT_TEXT_STYLE;
  return {
    font: TEXT_FONTS.some((f) => f.id === s.font) ? s.font! : d.font,
    size: clamp(s.size, TEXT_RANGES.size, d.size),
    line: clamp(s.line, TEXT_RANGES.line, d.line),
    letter: clamp(s.letter, TEXT_RANGES.letter, d.letter),
    word: clamp(s.word, TEXT_RANGES.word, d.word),
    indent: clamp(s.indent, TEXT_RANGES.indent, d.indent),
  };
}

/** Variáveis CSS lidas por `.prose`. */
export function textStyleVars(s: TextStyle): CSSProperties {
  const font = TEXT_FONTS.find((f) => f.id === s.font) ?? TEXT_FONTS[0];
  return {
    "--prose-font": font.css,
    "--prose-size": `${s.size}px`,
    "--prose-line": String(s.line),
    "--prose-letter": `${s.letter}em`,
    "--prose-word": `${s.word}em`,
    "--prose-indent": `${s.indent}em`,
  } as CSSProperties;
}
