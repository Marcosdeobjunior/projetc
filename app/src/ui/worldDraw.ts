import { COLS, ROWS, type Burg, type Derived, type WorldMap } from "../world/worldgen";
import type { buildVectors } from "../world/worldRender";

/*
 * Desenho do mapa-múndi num canvas (tela ou exportação): fundo assado,
 * costa, rios, estradas, fronteiras, destaque do estado, nomes, cidades,
 * escala e rosa dos ventos.
 */

export interface View {
  s: number;
  x: number;
  y: number;
}

export interface BurgMeta {
  population: number;
  port: boolean;
}

export interface DrawOptions {
  map: WorldMap;
  derived: Derived;
  base: HTMLCanvasElement;
  vectors: ReturnType<typeof buildVectors>;
  view: View;
  size: { w: number; h: number };
  layers: Record<"rios" | "estradas" | "fronteiras" | "estados" | "cidades" | "rotulos", boolean>;
  capitals: Set<string>;
  meta: Map<string, BurgMeta>;
  selectedBurg?: string | null;
  /** Máscara do estado selecionado (uma célula por pixel). */
  highlight?: HTMLCanvasElement | null;
  /** Pincel sob o mouse (em células). */
  brush?: { x: number; y: number; r: number } | null;
  /** Escala e rosa dos ventos. */
  furniture?: boolean;
}

/** Quilômetros por célula da grade. */
export const KM_PER_CELL = 10;

const SERIF = 'Georgia, "Times New Roman", serif';

/** Raio do marcador da cidade pela população. */
function dotRadius(pop: number, capital: boolean) {
  const r = 2.2 + Math.min(2.6, Math.log10(Math.max(100, pop)) - 2) * 0.9;
  return capital ? r + 1 : r;
}

function anchor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#1f3a55";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -3.2, 1.2, 0, Math.PI * 2);
  ctx.moveTo(0, -2);
  ctx.lineTo(0, 3.2);
  ctx.moveTo(-2.4, -0.6);
  ctx.lineTo(2.4, -0.6);
  ctx.moveTo(-3, 1.2);
  ctx.quadraticCurveTo(-2.4, 3.6, 0, 3.4);
  ctx.quadraticCurveTo(2.4, 3.6, 3, 1.2);
  ctx.stroke();
  ctx.restore();
}

function scaleBar(ctx: CanvasRenderingContext2D, view: View, size: { w: number; h: number }) {
  // Um comprimento "redondo" que ocupe ~120 px.
  const kmPerPx = KM_PER_CELL / view.s;
  const target = kmPerPx * 120;
  const pow = 10 ** Math.floor(Math.log10(target));
  const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= target * 0.6) ?? pow * 10;
  const len = nice / kmPerPx;
  ctx.save();
  ctx.font = `600 11px ${SERIF}`;
  const label = `${nice.toLocaleString("pt-BR")} km`;
  const half = ctx.measureText(label).width / 2;
  const x = size.w - len - 72 - half;
  const y = size.h - 70;
  ctx.fillStyle = "rgba(245,238,220,0.85)";
  ctx.fillRect(x - 12, y - 18, len + 24 + half, 34);
  ctx.strokeStyle = "#2b2a26";
  ctx.fillStyle = "#2b2a26";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = x + (len / 4) * i;
    ctx.fillStyle = i % 2 ? "#f5eedc" : "#2b2a26";
    ctx.fillRect(a, y, len / 4, 4);
  }
  ctx.strokeRect(x, y, len, 4);
  ctx.fillStyle = "#2b2a26";
  ctx.font = `600 11px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("0", x, y - 3);
  ctx.fillText(label, x + len, y - 3);
  ctx.restore();
}

function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const l = long ? r : r * 0.55;
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(r * 0.14, 0);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    ctx.fillStyle = "#2b2a26";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -l);
    ctx.lineTo(-r * 0.14, 0);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    ctx.fillStyle = "#f5eedc";
    ctx.fill();
    ctx.strokeStyle = "#2b2a26";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(43,42,38,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#2b2a26";
  ctx.font = `700 ${Math.round(r * 0.42)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -r - 2);
  ctx.restore();
}

export function drawWorld(ctx: CanvasRenderingContext2D, o: DrawOptions) {
  const { map, vectors, view, size, layers } = o;
  ctx.fillStyle = "#1f3a55";
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.s, view.s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(o.base, 0, 0, COLS, ROWS);
  const px = 1 / view.s; // um pixel de tela, em unidades do mapa
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = px * 4;
  ctx.stroke(vectors.coast);
  ctx.strokeStyle = "#2b2a26";
  ctx.lineWidth = px * 1.2;
  ctx.stroke(vectors.coast);
  if (layers.rios) {
    ctx.strokeStyle = "#4f86b8";
    for (const r of vectors.rivers) {
      // Espessura em pixels de tela (cresce pouco com o zoom).
      ctx.lineWidth = px * (0.7 + r.width * 0.8) * Math.min(2, Math.sqrt(view.s / 3));
      ctx.stroke(r.path);
    }
  }
  if (layers.estradas) {
    ctx.strokeStyle = "rgba(92,62,38,0.75)";
    ctx.lineWidth = Math.max(px * 0.8, 0.18);
    ctx.setLineDash([px * 4, px * 3]);
    ctx.stroke(vectors.roads);
    ctx.setLineDash([]);
  }
  if (layers.fronteiras) {
    ctx.strokeStyle = "rgba(60,30,40,0.75)";
    ctx.lineWidth = px * 1.6;
    ctx.setLineDash([px * 5, px * 2, px * 1, px * 2]);
    ctx.stroke(vectors.borders);
    ctx.setLineDash([]);
  }
  if (o.highlight) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(o.highlight, 0, 0, COLS, ROWS);
    ctx.globalAlpha = 1;
  }
  if (o.brush) {
    ctx.beginPath();
    ctx.arc(o.brush.x, o.brush.y, o.brush.r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = px * 1.5;
    ctx.setLineDash([px * 4, px * 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Texto e marcadores em pixels de tela (tamanho fixo ao dar zoom).
  const toS = (x: number, y: number) => [x * view.s + view.x, y * view.s + view.y] as const;
  // Retângulos já ocupados por texto (nomes de reinos primeiro, depois cidades).
  const placed: [number, number, number, number][] = [];
  const free = (x: number, y: number, w: number, h: number) =>
    placed.every(([a, b, c, d]) => x > c || x + w < a || y > d || y + h < b);
  if (layers.rotulos) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    map.states.forEach((s, k) => {
      const l = vectors.labels[k];
      if (!l) return;
      const [sx, sy] = toS(l.x, l.y);
      const fs = Math.max(11, Math.min(30, Math.sqrt(l.area) * view.s * 0.09));
      ctx.font = `600 ${fs}px ${SERIF}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(245,238,220,0.8)";
      const text = s.name.toUpperCase().split("").join(" ");
      const tw = ctx.measureText(text).width;
      placed.push([sx - tw / 2, sy - fs / 2, sx + tw / 2, sy + fs / 2]);
      ctx.strokeText(text, sx, sy);
      ctx.fillStyle = "#3b2a2a";
      ctx.fillText(text, sx, sy);
    });
  }
  if (layers.cidades) {
    // Rótulos que não se sobrepõem: capitais primeiro, depois as maiores.
    const pop = (b: Burg) => o.meta.get(b.id)?.population ?? 0;
    const ordered = [...map.burgs].sort(
      (a, b) => Number(o.capitals.has(b.id)) - Number(o.capitals.has(a.id)) || pop(b) - pop(a),
    );
    for (const b of ordered) {
      const [sx, sy] = toS(b.x, b.y);
      if (sx < -50 || sy < -50 || sx > size.w + 50 || sy > size.h + 50) continue;
      const cap = o.capitals.has(b.id);
      const sel = o.selectedBurg === b.id;
      const meta = o.meta.get(b.id);
      const r = dotRadius(meta?.population ?? 500, cap);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = cap ? "#2b2a26" : "#fffaf0";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = cap ? "#fffaf0" : "#2b2a26";
      ctx.stroke();
      if (cap) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 2.6, 0, Math.PI * 2);
        ctx.strokeStyle = "#2b2a26";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (meta?.port && view.s > 2.4) anchor(ctx, sx - r - 6, sy + 3);
      if (sel) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#e0a52c";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      const big = (meta?.population ?? 0) >= 5000;
      if (layers.rotulos && (cap || sel || view.s > 3.2 || (big && view.s > 2.2))) {
        ctx.font = `${cap ? "700 13px" : big ? "600 12px" : "500 11.5px"} ${SERIF}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(b.name).width;
        // Tenta à direita, depois à esquerda e embaixo do marcador.
        const spots: [number, number][] = [
          [sx + r + 4, sy - 6],
          [sx - r - 6 - tw, sy - 6],
          [sx - tw / 2, sy + r + 9],
        ];
        const spot = spots.find(([x, y]) => free(x, y - 7, tw + 2, 14)) ?? (sel ? spots[0] : null);
        if (!spot) continue;
        const [lx, ly] = spot;
        placed.push([lx, ly - 7, lx + tw + 2, ly + 7]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,250,235,0.85)";
        ctx.strokeText(b.name, lx, ly);
        ctx.fillStyle = "#24201b";
        ctx.fillText(b.name, lx, ly);
      }
    }
  }
  if (o.furniture) {
    scaleBar(ctx, view, size);
    compass(ctx, size.w - 60, 70, 26);
  }
}

/** Máscara de um estado: um pixel por célula, para destacar a área dele. */
export function stateMask(derived: Derived, k: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = COLS;
  c.height = ROWS;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(COLS, ROWS);
  for (let i = 0; i < COLS * ROWS; i++) {
    if (derived.owner[i] !== k) continue;
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 250;
    img.data[i * 4 + 2] = 235;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
