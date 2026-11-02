import type { VaultFs } from "../platform/types";

/*
 * Projeto gráfico do livro: capa (1ª capa, quarta capa, lombada, orelhas) e
 * diagramação do miolo. Fica em `.inkflow/livro.json` (vai junto na
 * sincronização); as imagens ficam em anexos/.
 */

export const DESIGN_FILE = ".inkflow/livro.json";

export type FontId = "literata" | "garamond" | "fraunces" | "figtree";

export const FONTS: Record<FontId, { label: string; css: string }> = {
  garamond: {
    label: "Garamond (clássica)",
    css: '"EB Garamond Variable", Garamond, Georgia, serif',
  },
  literata: { label: "Literata (leitura)", css: '"Literata Variable", Georgia, serif' },
  fraunces: { label: "Fraunces (marcante)", css: '"Fraunces Variable", Georgia, serif' },
  figtree: { label: "Figtree (sem serifa)", css: '"Figtree Variable", "Segoe UI", sans-serif' },
};

export type TrimSize = "14x21" | "16x23" | "A5" | "A4";

/** Tamanho do livro fechado (mm). */
export const TRIM: Record<TrimSize, { w: number; h: number; label: string }> = {
  "14x21": { w: 140, h: 210, label: "14 × 21 cm (o mais comum)" },
  "16x23": { w: 160, h: 230, label: "16 × 23 cm" },
  A5: { w: 148, h: 210, label: "A5 (14,8 × 21 cm)" },
  A4: { w: 210, h: 297, label: "A4" },
};

export type Paper = "offset" | "polen";

/** Espessura por página (mm), para a lombada. */
export const PAPER: Record<Paper, { label: string; perPage: number }> = {
  offset: { label: "Branco (offset 75–90 g)", perPage: 0.0572 },
  polen: { label: "Creme (pólen 80 g)", perPage: 0.0635 },
};

export type Placement = "top" | "center" | "bottom";

export interface CoverDesign {
  /** Imagem de fundo da capa (caminho em anexos/), ou vazio. */
  image: string;
  /** Imagem de fundo da quarta capa; vazio = cor. */
  backImage: string;
  background: string;
  /** Segunda cor: faz um degradê de cima para baixo. Vazio = cor única. */
  background2: string;
  textColor: string;
  accent: string;
  titleFont: FontId;
  subtitle: string;
  /** Onde ficam título e autor na capa. */
  placement: Placement;
  /** Escurece a imagem para o texto aparecer. 0 a 0.8. */
  shade: number;
  synopsis: string;
  /** Frase de destaque no alto da quarta capa (opcional). */
  tagline: string;
  /** Reserva o espaço do código de barras (ISBN) na quarta capa. */
  barcode: boolean;
  flaps: boolean;
  /** Largura de cada orelha (mm). */
  flapWidth: number;
  authorBio: string;
}

export interface LayoutDesign {
  trim: TrimSize;
  paper: Paper;
  font: FontId;
  /** Corpo do texto (pt). */
  size: number;
  /** Entrelinha (múltiplo do corpo). */
  leading: number;
  /** Margens (mm): medianiz é a do lado da costura. */
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  /** Primeira letra do capítulo grande. */
  dropCap: boolean;
  ornament: string;
  /** Título do livro nas páginas pares, autor nas ímpares. */
  runningHeads: boolean;
  /** Capítulo sempre numa página da direita (ímpar). */
  chapterOnRight: boolean;
  /** Páginas do miolo; 0 = estimar pelo número de palavras. */
  pages: number;
}

export interface BookDesign {
  format: 1;
  cover: CoverDesign;
  layout: LayoutDesign;
}

export const DEFAULT_DESIGN: BookDesign = {
  format: 1,
  cover: {
    image: "",
    backImage: "",
    background: "#1d2a44",
    background2: "#0b1020",
    textColor: "#f5efe3",
    accent: "#e7c27d",
    titleFont: "fraunces",
    subtitle: "",
    placement: "center",
    shade: 0.35,
    synopsis: "",
    tagline: "",
    barcode: true,
    flaps: false,
    flapWidth: 80,
    authorBio: "",
  },
  layout: {
    trim: "14x21",
    paper: "polen",
    font: "garamond",
    size: 11.5,
    leading: 1.45,
    marginTop: 18,
    marginBottom: 20,
    marginInner: 20,
    marginOuter: 15,
    dropCap: true,
    ornament: "❦",
    runningHeads: true,
    chapterOnRight: true,
    pages: 0,
  },
};

export async function loadDesign(fs: VaultFs): Promise<BookDesign> {
  const raw = await fs.readText(DESIGN_FILE);
  if (!raw) return DEFAULT_DESIGN;
  try {
    return sanitizeDesign(JSON.parse(raw));
  } catch {
    return DEFAULT_DESIGN;
  }
}

/**
 * O arquivo pode ter sido editado fora do app ou chegado pelo Drive: cada
 * campo é conferido (tipo, lista de valores, faixa), e o que não servir volta ao padrão.
 */
export function sanitizeDesign(raw: unknown): BookDesign {
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const pick = <T extends object>(
    defaults: T,
    src: Record<string, unknown>,
    rules: Partial<Record<keyof T, (v: unknown) => boolean>>,
  ): T => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = src[key as string];
      const ok = rules[key] ?? ((x: unknown) => typeof x === typeof defaults[key]);
      if (v !== undefined && ok(v)) out[key] = v as T[keyof T];
    }
    return out;
  };
  const text = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
  const color = (v: unknown) => typeof v === "string" && /^(#[0-9a-f]{6})?$/i.test(v);
  const num = (min: number, max: number) => (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const image = (v: unknown) => typeof v === "string" && (v === "" || /^anexos\/[^/\\:]+$/.test(v));
  const d = obj(raw);
  return {
    format: 1,
    cover: pick(DEFAULT_DESIGN.cover, obj(d.cover), {
      image,
      backImage: image,
      background: color,
      background2: color,
      textColor: color,
      accent: color,
      titleFont: (v) => typeof v === "string" && v in FONTS,
      subtitle: text(300),
      placement: (v) => v === "top" || v === "center" || v === "bottom",
      shade: num(0, 0.8),
      synopsis: text(5000),
      tagline: text(300),
      flapWidth: num(40, 120),
      authorBio: text(3000),
    }),
    layout: pick(DEFAULT_DESIGN.layout, obj(d.layout), {
      trim: (v) => typeof v === "string" && v in TRIM,
      paper: (v) => typeof v === "string" && v in PAPER,
      font: (v) => typeof v === "string" && v in FONTS,
      size: num(6, 24),
      leading: num(1, 3),
      marginTop: num(0, 60),
      marginBottom: num(0, 60),
      marginInner: num(0, 60),
      marginOuter: num(0, 60),
      ornament: text(12),
      pages: num(0, 5000),
    }),
  };
}

export async function saveDesign(fs: VaultFs, design: BookDesign) {
  await fs.writeText(DESIGN_FILE, JSON.stringify(design, null, 2) + "\n");
}

/**
 * Páginas estimadas do miolo pelo número de palavras: quantas cabem numa
 * página com essa fonte, margens e entrelinha, mais as páginas de abertura
 * de capítulo e as iniciais (folha de rosto, créditos, sumário).
 */
export function estimatePages(layout: LayoutDesign, words: number, chapters: number): number {
  const trim = TRIM[layout.trim];
  const textW = trim.w - layout.marginInner - layout.marginOuter;
  const textH = trim.h - layout.marginTop - layout.marginBottom;
  const pt = 0.3528; // mm
  const lineH = layout.size * layout.leading * pt;
  const lines = Math.floor(textH / lineH);
  // Largura média de um caractere ≈ 0,5 do corpo; palavra média em português ≈ 6 caracteres.
  const wordsPerLine = textW / (layout.size * pt * 0.5 * 6);
  const perPage = Math.max(50, lines * wordsPerLine * 0.92);
  const body = Math.ceil(words / perPage) + chapters * (layout.chapterOnRight ? 1.5 : 0.5);
  const total = 6 + Math.ceil(body);
  return total + (total % 2); // sempre par
}

export const pageCount = (layout: LayoutDesign, words: number, chapters: number) =>
  layout.pages > 0 ? layout.pages + (layout.pages % 2) : estimatePages(layout, words, chapters);

/** Largura da lombada (mm), com 1 mm a mais da capa (cartão). */
export function spineWidth(layout: LayoutDesign, pages: number): number {
  return Math.round((pages * PAPER[layout.paper].perPage + 1) * 10) / 10;
}

/** Sangria (mm) em volta da capa aberta, para o corte da gráfica. */
export const BLEED = 3;

/** Medidas da capa aberta (mm), da esquerda para a direita. */
export function coverSpread(design: BookDesign, pages: number) {
  const trim = TRIM[design.layout.trim];
  const spine = spineWidth(design.layout, pages);
  const flap = design.cover.flaps ? design.cover.flapWidth : 0;
  const parts = [
    ...(flap ? [{ part: "flapBack" as const, w: flap }] : []),
    { part: "back" as const, w: trim.w },
    { part: "spine" as const, w: spine },
    { part: "front" as const, w: trim.w },
    ...(flap ? [{ part: "flapFront" as const, w: flap }] : []),
  ];
  let x = BLEED;
  const placed = parts.map((p) => {
    const out = { ...p, x };
    x += p.w;
    return out;
  });
  return { parts: placed, width: x + BLEED, height: trim.h + 2 * BLEED, spine, trim };
}
