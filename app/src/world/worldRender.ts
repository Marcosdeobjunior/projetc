import { BIOMES, COLS, ROWS, SEA, type Derived, type WorldMap } from "./worldgen";

/*
 * Desenho do mapa-múndi: uma imagem de fundo (biomas ou relevo, com
 * sombreamento) feita uma vez por mudança, e contornos vetoriais (costa e
 * fronteiras, por marching squares) desenhados por cima a cada quadro.
 */

export type MapMode = "biomas" | "relevo" | "politico";

/** Pixels por célula na imagem de fundo. */
export const PX = 3;

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const BIOME_RGB = BIOMES.map((b) => hex(b.color));
const DEEP = hex("#26486b");
const SHALLOW = hex("#5d8fb9");
const COAST_SEA = hex("#86b2d3");
const POLITICAL_LAND = hex("#efe6d0");

/** Relevo: verde baixo → amarelo → marrom → branco no alto. */
const RELIEF: [number, [number, number, number]][] = [
  [0, hex("#6aa25a")],
  [0.25, hex("#b9c56e")],
  [0.5, hex("#d9b56e")],
  [0.72, hex("#a7744a")],
  [0.9, hex("#e9e3dc")],
  [1, hex("#ffffff")],
];

function lerp3(a: number[], b: number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

function relief(e: number) {
  for (let i = 1; i < RELIEF.length; i++) {
    const [t1, c1] = RELIEF[i]!;
    const [t0, c0] = RELIEF[i - 1]!;
    if (e <= t1) return lerp3(c0, c1, (e - t0) / (t1 - t0));
  }
  return RELIEF[RELIEF.length - 1]![1];
}

/** Altura interpolada (bilinear) num ponto em coordenadas de célula (centros em +0,5). */
export function heightAt(h: Uint8Array, x: number, y: number): number {
  const fx = Math.max(0, Math.min(COLS - 1.001, x - 0.5));
  const fy = Math.max(0, Math.min(ROWS - 1.001, y - 0.5));
  const x0 = fx | 0;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * COLS + x0;
  const a = h[i]!;
  const b = h[i + 1]!;
  const c = h[i + COLS]!;
  const d = h[i + COLS + 1]!;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Cor do bioma misturando as quatro células em volta (sem degraus entre células). */
function biomeAt(d: Derived, x: number, y: number): [number, number, number] {
  const fx = Math.max(0, Math.min(COLS - 1.001, x - 0.5));
  const fy = Math.max(0, Math.min(ROWS - 1.001, y - 0.5));
  const x0 = fx | 0;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * COLS + x0;
  const cells = [i, i + 1, i + COLS, i + COLS + 1];
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let r = 0;
  let g = 0;
  let b = 0;
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const c = cells[k]!;
    if (!d.land[c]) continue;
    const col = BIOME_RGB[d.biome[c]!]!;
    r += col[0] * w[k]!;
    g += col[1] * w[k]!;
    b += col[2] * w[k]!;
    sum += w[k]!;
  }
  if (!sum) return BIOME_RGB[4]! as [number, number, number];
  return [r / sum, g / sum, b / sum];
}

export function bakeBase(
  map: WorldMap,
  d: Derived,
  mode: MapMode,
  states: boolean,
  /** Pixels por célula (menos = mais rápido, usado ao pintar o relevo). */
  res = PX,
): HTMLCanvasElement {
  const W = COLS * res;
  const H = ROWS * res;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const h = map.heights;
  const stateRgb = map.states.map((s) => hex(s.color));
  for (let py = 0; py < H; py++) {
    for (let pxx = 0; pxx < W; pxx++) {
      const x = (pxx + 0.5) / res;
      const y = (py + 0.5) / res;
      const v = heightAt(h, x, y);
      const cell = Math.min(ROWS - 1, y | 0) * COLS + Math.min(COLS - 1, x | 0);
      let rgb: [number, number, number];
      if (v < SEA - 0.5) {
        const depth = Math.max(0, Math.min(1, v / (SEA - 1)));
        rgb = lerp3(DEEP, SHALLOW, Math.pow(depth, 1.6));
        // Água rasa perto da costa, suave (pela altura interpolada, não pela célula).
        if (v > SEA - 16) rgb = lerp3(rgb, COAST_SEA, ((v - (SEA - 16)) / 16) * 0.4);
      } else {
        const e = Math.max(0, (v - SEA) / 127);
        if (mode === "relevo") rgb = relief(e);
        else if (mode === "politico") rgb = POLITICAL_LAND;
        else {
          // Bordas orgânicas entre biomas: desloca um pouco o ponto de amostra.
          const jx = Math.sin(x * 1.9 + y * 0.7) * 0.45 + Math.sin(y * 3.1 - x * 0.4) * 0.3;
          const jy = Math.sin(y * 1.7 - x * 0.9) * 0.45 + Math.sin(x * 2.9 + y * 0.5) * 0.3;
          rgb = biomeAt(d, x + jx, y + jy);
        }
        // Sombreamento: luz vindo do noroeste.
        const gx = heightAt(h, x + 0.6, y) - heightAt(h, x - 0.6, y);
        const gy = heightAt(h, x, y + 0.6) - heightAt(h, x, y - 0.6);
        const shade = Math.max(
          0.55,
          Math.min(1.3, 1 - (gx + gy) * (mode === "politico" ? 0.012 : 0.03)),
        );
        rgb = [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
        const o = d.owner[cell]!;
        if ((states || mode === "politico") && o >= 0 && stateRgb[o])
          rgb = lerp3(rgb, stateRgb[o]!, mode === "politico" ? 0.55 : 0.32);
      }
      const k = (py * W + pxx) * 4;
      px[k] = rgb[0];
      px[k + 1] = rgb[1];
      px[k + 2] = rgb[2];
      px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Marching squares sobre os centros das células: devolve segmentos
 * [x1, y1, x2, y2, …] onde `value` cruza `level`.
 */
export function contour(
  value: (i: number) => number,
  level: number,
  skip?: (i: number) => boolean,
): Float32Array {
  const out: number[] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-6);
  for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS - 1; x++) {
      const i = y * COLS + x;
      if (skip?.(i)) continue;
      const a = value(i);
      const b = value(i + 1);
      const c = value(i + COLS + 1);
      const dd = value(i + COLS);
      const code =
        (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (dd > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const top: [number, number] = [cx + lerp(a, b), cy];
      const right: [number, number] = [cx + 1, cy + lerp(b, c)];
      const bottom: [number, number] = [cx + lerp(dd, c), cy + 1];
      const left: [number, number] = [cx, cy + lerp(a, dd)];
      const seg = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1:
        case 14:
          seg(left, bottom);
          break;
        case 2:
        case 13:
          seg(bottom, right);
          break;
        case 3:
        case 12:
          seg(left, right);
          break;
        case 4:
        case 11:
          seg(top, right);
          break;
        case 6:
        case 9:
          seg(top, bottom);
          break;
        case 7:
        case 8:
          seg(left, top);
          break;
        case 5:
          seg(left, top);
          seg(bottom, right);
          break;
        case 10:
          seg(top, right);
          seg(left, bottom);
          break;
      }
    }
  }
  return Float32Array.from(out);
}

export function segmentsPath(seg: Float32Array): Path2D {
  const p = new Path2D();
  for (let i = 0; i < seg.length; i += 4) {
    p.moveTo(seg[i]!, seg[i + 1]!);
    p.lineTo(seg[i + 2]!, seg[i + 3]!);
  }
  return p;
}

/** Linha suave pelos centros das células (rios e estradas). */
export function cellsPath(cells: number[], path = new Path2D()): Path2D {
  const pts = cells.map((c) => [(c % COLS) + 0.5, Math.floor(c / COLS) + 0.5] as const);
  if (pts.length < 2) return path;
  path.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1]!;
  path.lineTo(last[0], last[1]);
  return path;
}

/** Só a linha da costa (rápida, para a prévia enquanto pinta). */
export function coastPath(heights: Uint8Array): Path2D {
  return segmentsPath(contour((i) => heights[i]!, SEA - 0.5));
}

/** Costa e fronteiras como caminhos vetoriais. */
export function buildVectors(map: WorldMap, d: Derived) {
  const h = map.heights;
  const coast = segmentsPath(contour((i) => h[i]!, SEA - 0.5));
  const borders = new Path2D();
  for (let k = 0; k < map.states.length; k++) {
    // Fronteira só em terra (a costa já tem o seu traço).
    const seg = contour(
      (i) => (d.owner[i] === k ? 1 : 0),
      0.5,
      (i) => !d.land[i] || !d.land[i + 1] || !d.land[i + COLS] || !d.land[i + COLS + 1],
    );
    borders.addPath(segmentsPath(seg));
  }
  const rivers = d.rivers.map((r) => ({ path: cellsPath(r.cells), width: r.width }));
  const roads = new Path2D();
  for (const r of d.roads) cellsPath(r, roads);
  // Rótulo de cada estado: a célula dele mais perto do seu centro.
  const sums = map.states.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let i = 0; i < COLS * ROWS; i++) {
    const o = d.owner[i]!;
    if (o < 0) continue;
    const s = sums[o]!;
    s.x += i % COLS;
    s.y += Math.floor(i / COLS);
    s.n++;
  }
  const labels = sums.map((s, k) => {
    if (!s.n) return null;
    const cx = s.x / s.n;
    const cy = s.y / s.n;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (d.owner[i] !== k) continue;
      const dist = Math.hypot((i % COLS) - cx, Math.floor(i / COLS) - cy);
      if (dist < bd) {
        bd = dist;
        best = i;
      }
    }
    return { x: (best % COLS) + 0.5, y: Math.floor(best / COLS) + 0.5, area: s.n };
  });
  return { coast, borders, rivers, roads, labels };
}
