import { attachmentUrl } from "../editor/attachments";
import { BLEED, coverSpread, FONTS, TRIM, type BookDesign } from "./design";

/*
 * Desenho da capa num <canvas>. O mesmo desenho serve para a prévia, o
 * mockup 3D, a capa do e-book (PNG) e o PDF da gráfica (300 dpi).
 */

export interface BookInfo {
  title: string;
  author: string;
}

export type Part = "front" | "back" | "spine" | "flapFront" | "flapBack";

const MM_PER_IN = 25.4;
const px = (mm: number, dpi: number) => Math.round((mm / MM_PER_IN) * dpi);

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = images.get(src);
  if (!p) {
    p = attachmentUrl(src).then(
      (url) =>
        new Promise((resolve) => {
          if (!url) return resolve(null);
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        }),
    );
    images.set(src, p);
  }
  return p;
}

/** Garante que as fontes da capa estão carregadas antes de desenhar. */
async function fontsReady(design: BookDesign) {
  const title = FONTS[design.cover.titleFont].css;
  await Promise.all([
    document.fonts.load(`700 48px ${title}`),
    document.fonts.load(`400 24px ${FONTS.literata.css}`),
    document.fonts.load(`italic 400 24px ${FONTS.literata.css}`),
    document.fonts.load(`600 24px ${FONTS.figtree.css}`),
  ]).catch(() => undefined);
}

/** Quebra o texto em linhas que cabem em `max` (respeita parágrafos). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fillBackground(ctx: CanvasRenderingContext2D, r: Rect, a: string, b: string) {
  if (b) {
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
  } else ctx.fillStyle = a;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Imagem cobrindo o retângulo (corta o que sobra, como background-size: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const scale = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
}

function textBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineH: number,
  align: CanvasTextAlign = "center",
) {
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}

/**
 * Desenha uma parte da capa em `r` (a área visível). `bleed` é a área
 * maior, até a borda do papel, que o fundo e a imagem devem cobrir.
 */
async function drawPart(
  ctx: CanvasRenderingContext2D,
  part: Part,
  r: Rect,
  bleed: Rect,
  design: BookDesign,
  info: BookInfo,
  dpi: number,
) {
  const c = design.cover;
  const u = (mm: number) => (mm / MM_PER_IN) * dpi; // mm → px
  ctx.save();
  ctx.beginPath();
  ctx.rect(bleed.x, bleed.y, bleed.w, bleed.h);
  ctx.clip();

  const front = part === "front";
  const imgSrc = front ? c.image : part === "back" ? c.backImage : "";
  fillBackground(ctx, bleed, c.background, c.background2);
  const img = await loadImage(imgSrc);
  if (img) {
    drawCover(ctx, img, bleed);
    if (c.shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${c.shade})`;
      ctx.fillRect(bleed.x, bleed.y, bleed.w, bleed.h);
    }
  }

  const titleFont = FONTS[c.titleFont].css;
  const pad = u(Math.min(16, r.w * 0.11));
  const inner = r.w - 2 * pad;
  ctx.fillStyle = c.textColor;

  if (front) {
    const titleSize = Math.min(u(14), inner / 6.5);
    ctx.font = `700 ${titleSize}px ${titleFont}`;
    const titleLines = wrap(ctx, info.title, inner);
    ctx.font = `400 ${titleSize * 0.42}px ${FONTS.literata.css}`;
    const subLines = c.subtitle ? wrap(ctx, c.subtitle, inner) : [];
    const blockH =
      titleLines.length * titleSize * 1.08 +
      (subLines.length ? titleSize * 0.4 + subLines.length * titleSize * 0.55 : 0);
    const top =
      c.placement === "top"
        ? r.y + u(28)
        : c.placement === "bottom"
          ? r.y + r.h - u(52) - blockH
          : r.y + (r.h - blockH) / 2 - u(10);
    ctx.font = `700 ${titleSize}px ${titleFont}`;
    const y = textBlock(ctx, titleLines, r.x + r.w / 2, top + titleSize, titleSize * 1.08);
    // Fio de destaque entre título e subtítulo.
    ctx.fillStyle = c.accent;
    ctx.fillRect(r.x + r.w / 2 - u(9), y - titleSize * 0.55, u(18), Math.max(2, u(0.6)));
    ctx.fillStyle = c.textColor;
    if (subLines.length) {
      ctx.font = `italic 400 ${titleSize * 0.42}px ${FONTS.literata.css}`;
      textBlock(ctx, subLines, r.x + r.w / 2, y + titleSize * 0.3, titleSize * 0.55);
    }
    if (info.author) {
      ctx.font = `600 ${Math.min(u(5), titleSize * 0.38)}px ${FONTS.figtree.css}`;
      ctx.letterSpacing = `${u(0.6)}px`;
      const authorY = c.placement === "bottom" ? r.y + u(26) : r.y + r.h - u(18);
      textBlock(ctx, [info.author.toUpperCase()], r.x + r.w / 2, authorY, 0);
      ctx.letterSpacing = "0px";
    }
  } else if (part === "back") {
    let y = r.y + u(24);
    if (c.tagline) {
      ctx.fillStyle = c.accent;
      ctx.font = `italic 600 ${u(5)}px ${FONTS.literata.css}`;
      y = textBlock(ctx, wrap(ctx, c.tagline, inner), r.x + r.w / 2, y, u(6.6)) + u(6);
      ctx.fillStyle = c.textColor;
    }
    ctx.font = `400 ${u(3.6)}px ${FONTS.literata.css}`;
    const synopsis = c.synopsis || "Escreva a sinopse do livro na aba Capa → Quarta capa.";
    if (!c.synopsis) ctx.globalAlpha = 0.5;
    y = textBlock(ctx, wrap(ctx, synopsis, inner), r.x + pad, y, u(5.4), "left");
    ctx.globalAlpha = 1;
    if (c.authorBio && !c.flaps) {
      ctx.font = `italic 400 ${u(3.1)}px ${FONTS.literata.css}`;
      ctx.globalAlpha = 0.85;
      textBlock(ctx, wrap(ctx, c.authorBio, inner), r.x + pad, y + u(8), u(4.6), "left");
      ctx.globalAlpha = 1;
    }
    if (c.barcode) {
      // Espaço do código de barras (ISBN), no canto de baixo.
      const bw = u(42);
      const bh = u(25);
      const bx = r.x + r.w - pad - bw;
      const by = r.y + r.h - u(14) - bh;
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "#888";
      ctx.font = `600 ${u(2.6)}px ${FONTS.figtree.css}`;
      textBlock(ctx, ["ISBN / código de barras"], bx + bw / 2, by + bh / 2 + u(1), 0);
    }
  } else if (part === "spine") {
    if (r.w > u(5)) {
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate(Math.PI / 2); // texto de cima para baixo (ABNT NBR 12225)
      const size = Math.min(r.w * 0.5, u(7));
      const sep = "   •   ";
      ctx.font = `700 ${size}px ${titleFont}`;
      const t = info.title;
      ctx.font = `600 ${size * 0.72}px ${FONTS.figtree.css}`;
      const a = info.author ? sep + info.author : "";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px ${titleFont}`;
      const tw = ctx.measureText(t).width;
      ctx.font = `600 ${size * 0.72}px ${FONTS.figtree.css}`;
      const aw = ctx.measureText(a).width;
      let x = -(tw + aw) / 2;
      ctx.textAlign = "left";
      ctx.font = `700 ${size}px ${titleFont}`;
      ctx.fillText(t, x, 0);
      x += tw;
      ctx.fillStyle = c.accent;
      ctx.font = `600 ${size * 0.72}px ${FONTS.figtree.css}`;
      ctx.fillText(a, x, 0);
    }
  } else {
    // Orelhas: a da frente fala do livro; a de trás, do autor.
    const text = part === "flapFront" ? c.synopsis : c.authorBio;
    const heading = part === "flapFront" ? "Sobre o livro" : "Sobre o autor";
    const p = u(10);
    let y = r.y + u(30);
    ctx.font = `600 ${u(3.4)}px ${FONTS.figtree.css}`;
    ctx.fillStyle = c.accent;
    y = textBlock(ctx, [heading.toUpperCase()], r.x + p, y, u(5), "left") + u(3);
    ctx.fillStyle = c.textColor;
    ctx.font = `400 ${u(3.3)}px ${FONTS.literata.css}`;
    textBlock(ctx, wrap(ctx, text || "—", r.w - 2 * p), r.x + p, y, u(5), "left");
  }
  ctx.restore();
}

/** Uma parte da capa sozinha (sem sangria), para a prévia e o mockup 3D. */
export async function renderPart(
  part: Part,
  design: BookDesign,
  info: BookInfo,
  dpi: number,
  spineMm = 15,
): Promise<HTMLCanvasElement> {
  await fontsReady(design);
  const trim = TRIM[design.layout.trim];
  const wMm =
    part === "spine"
      ? spineMm
      : part === "front" || part === "back"
        ? trim.w
        : design.cover.flapWidth;
  const canvas = document.createElement("canvas");
  canvas.width = px(wMm, dpi);
  canvas.height = px(trim.h, dpi);
  const r = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  await drawPart(canvas.getContext("2d")!, part, r, r, design, info, dpi);
  return canvas;
}

/** A capa aberta para a gráfica: quarta capa, lombada e capa (e orelhas), com sangria. */
export async function renderSpread(
  design: BookDesign,
  info: BookInfo,
  pages: number,
  dpi: number,
  marks = false,
): Promise<{ canvas: HTMLCanvasElement; widthMm: number; heightMm: number }> {
  await fontsReady(design);
  const s = coverSpread(design, pages);
  const canvas = document.createElement("canvas");
  canvas.width = px(s.width, dpi);
  canvas.height = px(s.height, dpi);
  const ctx = canvas.getContext("2d")!;
  const b = px(BLEED, dpi);
  const last = s.parts.length - 1;
  for (const [i, p] of s.parts.entries()) {
    const r = {
      x: px(p.x, dpi),
      y: b,
      w: px(p.x + p.w, dpi) - px(p.x, dpi),
      h: canvas.height - 2 * b,
    };
    // As partes das pontas cobrem também a sangria do lado de fora.
    const left = i === 0 ? 0 : r.x;
    const right = i === last ? canvas.width : r.x + r.w;
    await drawPart(
      ctx,
      p.part,
      r,
      { x: left, y: 0, w: right - left, h: canvas.height },
      design,
      info,
      dpi,
    );
  }
  if (marks) {
    // Linhas de dobra (lombada e orelhas), fora da área de impressão.
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = Math.max(1, dpi / 300);
    for (const p of s.parts.slice(1)) {
      const x = px(p.x, dpi);
      for (const [y0, y1] of [
        [0, b * 0.8],
        [canvas.height - b * 0.8, canvas.height],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
    }
  }
  return { canvas, widthMm: s.width, heightMm: s.height };
}

export const toPng = async (canvas: HTMLCanvasElement) =>
  new Uint8Array(
    await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"))).arrayBuffer(),
  );
