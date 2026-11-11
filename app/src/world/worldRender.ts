import {
  BIOMES,
  COLS,
  dCol,
  ROWS,
  SEA,
  type Derived,
  type RouteType,
  type WorldMap,
} from "./worldgen";

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
const SEA_ICE = hex("#e4eef2");
const SAND = hex("#e6d6a6");
const ROCK = hex("#8c8376");
const SNOW = hex("#f5f7f8");
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
  // A longitude dá a volta: a coluna depois da última é a primeira.
  const fx = (((x - 0.5) % COLS) + COLS) % COLS;
  const fy = Math.max(0, Math.min(ROWS - 1.001, y - 0.5));
  const x0 = fx | 0;
  const x1 = (x0 + 1) % COLS;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const r0 = y0 * COLS;
  const r1 = r0 + COLS;
  const a = h[r0 + x0]!;
  const b = h[r0 + x1]!;
  const c = h[r1 + x0]!;
  const d = h[r1 + x1]!;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Cor do bioma misturando as quatro células em volta (sem degraus entre células). */
function biomeAt(d: Derived, x: number, y: number): [number, number, number] {
  const fx = (((x - 0.5) % COLS) + COLS) % COLS;
  const fy = Math.max(0, Math.min(ROWS - 1.001, y - 0.5));
  const x0 = fx | 0;
  const x1 = (x0 + 1) % COLS;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const r0 = y0 * COLS;
  const cells = [r0 + x0, r0 + x1, r0 + COLS + x0, r0 + COLS + x1];
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
        // Mar congelado perto dos polos.
        const temp = d.temp[cell]!;
        // (leve: placas de gelo sobre o mar, sem esconder o mar nem a costa)
        if (temp < 0.1) {
          // Placas soltas: onde o ruído de umidade é alto há gelo; o resto é mar aberto.
          const m = d.moist[cell]!;
          const floe = Math.max(0, Math.min(1, (m - 0.42) / 0.12));
          rgb = lerp3(rgb, SEA_ICE, Math.min(0.3, (0.1 - temp) / 0.15) * floe);
        }
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
        if (mode === "biomas") {
          const b = d.land[cell] ? d.biome[cell]! : 4;
          // Praia: faixa de areia bem junto ao mar (não em gelo nem em pântano).
          if (v < SEA + 3 && b !== 11 && b !== 12 && b !== 10)
            rgb = lerp3(rgb, SAND, ((SEA + 3 - v) / 3) * 0.75);
          // Altitude: rocha nas encostas altas e neve nos picos (mais baixa onde é frio).
          const temp = d.temp[cell]!;
          const rock = Math.max(0, Math.min(1, (e - 0.5) / 0.25));
          if (rock > 0) rgb = lerp3(rgb, ROCK, rock * 0.65);
          const snowLine = 0.72 + temp * 0.18;
          const snow = Math.max(0, Math.min(1, (e - snowLine) / 0.08));
          if (snow > 0) rgb = lerp3(rgb, SNOW, snow * 0.9);
          // Textura: florestas com copas (pontilhado), campos e desertos lisos.
          if (b >= 5 && b <= 9) {
            const g = Math.sin(pxx * 2.3 + py * 1.1) * Math.sin(py * 2.9 - pxx * 0.7);
            const f = 0.93 + 0.1 * g;
            rgb = [rgb[0] * f, rgb[1] * f, rgb[2] * f];
          }
        }
        // Sombreamento: luz principal do noroeste e luz ambiente; mais forte nas serras.
        const gx = heightAt(h, x + 0.6, y) - heightAt(h, x - 0.6, y);
        const gy = heightAt(h, x, y + 0.6) - heightAt(h, x, y - 0.6);
        const strength = mode === "politico" ? 0.012 : 0.026 + e * 0.03;
        const shade = Math.max(0.5, Math.min(1.28, 1.02 - (gx + gy) * strength));
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
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (skip?.(i)) continue;
      // Última coluna se liga à primeira (a costura de 180°).
      const r = x === COLS - 1 ? i + 1 - COLS : i + 1;
      const a = value(i);
      const b = value(r);
      const c = value(r + COLS);
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

/**
 * Deixa a longitude contínua ao longo de uma linha que atravessa a costura
 * (ex.: 359 → 0 vira 359 → 360): desenhada nas cópias vizinhas, emenda certo.
 */
export function unwrap(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev) out.push([p[0], p[1]]);
    else {
      let x = p[0];
      while (x - prev[0] > COLS / 2) x -= COLS;
      while (prev[0] - x > COLS / 2) x += COLS;
      out.push([x, p[1]]);
    }
  }
  return out;
}

/** Suavização de Chaikin (corta os cantos), mantendo o primeiro e o último ponto. */
export function chaikin(pts: [number, number][], passes: number): [number, number][] {
  let out = pts;
  for (let k = 0; k < passes && out.length > 2; k++) {
    const next: [number, number][] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const [ax, ay] = out[i]!;
      const [bx, by] = out[i + 1]!;
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

/** Linha suave pelos centros das células (rios e estradas). */
export function cellsPath(
  cells: number[],
  path = new Path2D(),
  end?: readonly [number, number],
): Path2D {
  // Suaviza os degraus da grade (Chaikin), mantendo as pontas.
  const pts = chaikin(
    unwrap([
      ...cells.map((c) => [(c % COLS) + 0.5, Math.floor(c / COLS) + 0.5] as [number, number]),
      ...(end ? [[end[0], end[1]] as [number, number]] : []),
    ]),
    2,
  );
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
  const rivers = d.rivers.map((r) => ({
    path: cellsPath(r.cells, new Path2D(), r.mouth),
    width: r.width,
  }));
  const roads: Record<RouteType, Path2D> = {
    principal: new Path2D(),
    estrada: new Path2D(),
    trilha: new Path2D(),
    maritima: new Path2D(),
  };
  for (const r of d.roads) cellsPath(r.cells, roads[r.type]);
  // Estradas geradas com nome e trajeto (para selecionar e escrever o nome).
  const namedRoads = d.roads
    .filter((r) => r.type !== "trilha")
    .map((r) => ({
      name: r.name,
      type: r.type,
      points: unwrap(r.cells.map((c) => [(c % COLS) + 0.5, Math.floor(c / COLS) + 0.5])),
    }));
  // Rotas desenhadas: caminho suave e o ponto do meio (para o nome).
  const routes = (map.routes ?? []).map((r, k) => {
    const pts = unwrap(d.routes[k]?.points ?? r.points);
    const path = new Path2D();
    path.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      const [nx, ny] = pts[i + 1]!;
      path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const last = pts[pts.length - 1]!;
    path.lineTo(last[0], last[1]);
    // Comprimento (em células) e ponto do meio com a direção, para escrever o nome.
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    let acc = 0;
    let mid = { x: pts[0]![0], y: pts[0]![1], angle: 0 };
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const seg = Math.hypot(bx - ax, by - ay);
      if (acc + seg >= len / 2) {
        const t = seg ? (len / 2 - acc) / seg : 0;
        let angle = Math.atan2(by - ay, bx - ax);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        mid = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle };
        break;
      }
      acc += seg;
    }
    return { id: r.id, name: r.name, type: r.type, path, points: pts, length: len, mid };
  });
  // Rótulo de cada estado: a célula dele mais perto do seu centro.
  // Centro do estado: média circular na longitude (pode atravessar a costura).
  const sums = map.states.map(() => ({ c: 0, s: 0, y: 0, n: 0 }));
  for (let i = 0; i < COLS * ROWS; i++) {
    const o = d.owner[i]!;
    if (o < 0) continue;
    const s = sums[o]!;
    const a = ((i % COLS) / COLS) * Math.PI * 2;
    s.c += Math.cos(a);
    s.s += Math.sin(a);
    s.y += Math.floor(i / COLS);
    s.n++;
  }
  const labels = sums.map((s, k) => {
    if (!s.n) return null;
    const cx = ((((Math.atan2(s.s, s.c) / (Math.PI * 2)) * COLS) % COLS) + COLS) % COLS;
    const cy = s.y / s.n;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (d.owner[i] !== k) continue;
      const dist = Math.hypot(dCol(i % COLS, cx), Math.floor(i / COLS) - cy);
      if (dist < bd) {
        bd = dist;
        best = i;
      }
    }
    return { x: (best % COLS) + 0.5, y: Math.floor(best / COLS) + 0.5, area: s.n };
  });
  return { coast, borders, rivers, roads, namedRoads, bridges: d.bridges, routes, labels };
}
