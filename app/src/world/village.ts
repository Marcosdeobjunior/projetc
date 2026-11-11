import { distToPolyline, insidePoly, overlaps, rect, rng, smooth, type Pt } from "./geom";

/*
 * Gerador procedural do mini mapa de um lugar: estrada, rio, casas ao longo das
 * ruas, campos cultivados e árvores. É determinístico: as mesmas opções (com a
 * mesma semente) geram sempre o mesmo mapa, então só as opções são gravadas
 * (no campo `mapa` da nota, como JSON).
 */

export type MapSize = "aldeia" | "vila" | "cidade";

export interface MapOptions {
  seed: number;
  size: MapSize;
  /** Estrada principal atravessando o mapa (senão, só ruas locais). */
  road: boolean;
  river: boolean;
  /** Campos cultivados em volta. */
  fields: boolean;
}

export const MAP_SIZES: { value: MapSize; label: string }[] = [
  { value: "aldeia", label: "Aldeia" },
  { value: "vila", label: "Vila" },
  { value: "cidade", label: "Cidade" },
];

export function defaultMapOptions(seed: number): MapOptions {
  return { seed: seed >>> 0, size: "vila", road: true, river: true, fields: true };
}

/** Lê as opções gravadas (texto JSON); qualquer coisa estranha vira null. */
export function parseMapOptions(raw: string | undefined): MapOptions | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<MapOptions>;
    if (typeof o.seed !== "number" || !Number.isFinite(o.seed)) return null;
    return {
      seed: o.seed >>> 0,
      size: MAP_SIZES.some((s) => s.value === o.size) ? o.size! : "vila",
      road: o.road !== false,
      river: o.river !== false,
      fields: o.fields !== false,
    };
  } catch {
    return null;
  }
}

export interface Road {
  points: Pt[];
  width: number;
  main: boolean;
}

export interface Building {
  corners: Pt[];
  center: Pt;
  /** Andares (1 a 3), para a vista de rua. */
  floors: number;
  /** Índice de tom da parede/telhado (0 a 3). */
  tone: number;
}

export interface Field {
  corners: Pt[];
  angle: number;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
}

export interface VillageMap {
  width: number;
  height: number;
  center: Pt;
  roads: Road[];
  river: { points: Pt[]; width: number } | null;
  buildings: Building[];
  fields: Field[];
  trees: Tree[];
}

export const MAP_W = 480;
export const MAP_H = 300;

const SIZE = {
  aldeia: { target: 40, radius: 70, branches: 1 },
  vila: { target: 110, radius: 105, branches: 2 },
  cidade: { target: 230, radius: 150, branches: 4 },
} as const;

/** Uma linha que avança em `dir` com pequenas curvas, por `length`. */
function wander(rand: () => number, start: Pt, dir: number, length: number, step = 22): Pt[] {
  const pts: Pt[] = [start];
  let [x, y] = start;
  let a = dir;
  for (let d = 0; d < length; d += step) {
    a += (rand() - 0.5) * 0.45;
    // Puxa de volta para a direção original (a rua não dá meia-volta).
    a = dir + Math.max(-0.55, Math.min(0.55, a - dir));
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return smooth(pts, 2);
}

/** Ponto e direção a uma distância `s` ao longo da linha. */
function along(line: Pt[], s: number): { p: Pt; angle: number } | null {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= s) {
      const t = len ? (s - acc) / len : 0;
      return {
        p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    acc += len;
  }
  return null;
}

function lineLength(line: Pt[]): number {
  let l = 0;
  for (let i = 1; i < line.length; i++)
    l += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return l;
}

export function generateVillage(o: MapOptions): VillageMap {
  const rand = rng(o.seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const cfg = SIZE[o.size];
  const W = MAP_W;
  const H = MAP_H;

  // Estrada principal: atravessa o mapa de um lado ao outro (ou é só uma rua no meio).
  const roads: Road[] = [];
  const mainY = between(H * 0.38, H * 0.62);
  const main = o.road
    ? wander(rand, [-30, mainY], between(-0.12, 0.12), W + 60)
    : wander(rand, [W * 0.24, mainY], between(-0.15, 0.15), W * 0.52);
  roads.push({ points: main, width: o.road ? 8 : 5, main: true });
  const center = along(main, lineLength(main) * between(0.42, 0.58))!.p;

  // Ruas que saem da principal, para cima e para baixo.
  for (let i = 0; i < cfg.branches; i++) {
    const at = along(main, lineLength(main) * between(0.3, 0.7));
    if (!at) continue;
    const side = i % 2 === 0 ? 1 : -1;
    const dir = at.angle + side * (Math.PI / 2 + between(-0.45, 0.45));
    const len = between(cfg.radius * 0.9, cfg.radius * 1.6);
    roads.push({ points: wander(rand, at.p, dir, len, 18), width: 5, main: false });
  }

  // Rio: de cima a baixo, passando perto do centro.
  let river: VillageMap["river"] = null;
  if (o.river) {
    const x0 = center[0] + between(-W * 0.3, W * 0.3);
    river = {
      points: wander(rand, [x0, -30], Math.PI / 2 + between(-0.25, 0.25), H + 60, 26),
      width: between(9, 14),
    };
  }

  const blocked = (poly: Pt[]) => {
    for (const p of poly) {
      for (const r of roads) if (distToPolyline(p, r.points) < r.width / 2 + 0.8) return true;
      if (river && distToPolyline(p, river.points) < river.width / 2 + 2) return true;
      if (p[0] < -10 || p[1] < -10 || p[0] > W + 10 || p[1] > H + 10) return true;
    }
    return false;
  };

  // Casas ao longo das ruas, mais densas perto do centro.
  const buildings: Building[] = [];
  const free = (poly: Pt[]) => buildings.every((b) => !overlaps(b.corners, poly, 1.2));
  for (let pass = 0; pass < 3 && buildings.length < cfg.target; pass++) {
    for (const road of roads) {
      const len = lineLength(road.points);
      for (let s = between(0, 8); s < len && buildings.length < cfg.target; s += between(8, 13)) {
        const at = along(road.points, s);
        if (!at) break;
        for (const side of [-1, 1]) {
          const dist = Math.hypot(at.p[0] - center[0], at.p[1] - center[1]);
          const prob = Math.exp(-((dist / cfg.radius) ** 2)) * (pass === 0 ? 1 : 0.6);
          if (rand() > prob) continue;
          const w = between(6, 11);
          const d = between(6, 10);
          // Segunda fileira (atrás) nas passadas seguintes, onde é mais denso.
          const row = pass === 2 ? 1 : 0;
          const back = road.width / 2 + 1.6 + d / 2 + between(0, 1.5) + row * between(10, 14);
          const nx = -Math.sin(at.angle) * side;
          const ny = Math.cos(at.angle) * side;
          const cx = at.p[0] + nx * back;
          const cy = at.p[1] + ny * back;
          const corners = rect(cx, cy, w, d, at.angle + between(-0.06, 0.06));
          if (blocked(corners) || !free(corners)) continue;
          buildings.push({
            corners,
            center: [cx, cy],
            floors: dist < cfg.radius * 0.5 && rand() < 0.5 ? (rand() < 0.3 ? 3 : 2) : 1,
            tone: Math.floor(rand() * 4),
          });
        }
      }
    }
  }

  // Campos cultivados em volta da área construída.
  const fields: Field[] = [];
  if (o.fields) {
    for (let tries = 0; tries < 160 && fields.length < 26; tries++) {
      const road = roads[Math.floor(rand() * roads.length)]!;
      const at = along(road.points, rand() * lineLength(road.points));
      if (!at) continue;
      const dist = Math.hypot(at.p[0] - center[0], at.p[1] - center[1]);
      if (dist < cfg.radius * 0.8) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const w = between(28, 60);
      const d = between(22, 48);
      const back = road.width / 2 + 3 + d / 2;
      const angle = at.angle + between(-0.12, 0.12);
      const cx = at.p[0] - Math.sin(at.angle) * side * back;
      const cy = at.p[1] + Math.cos(at.angle) * side * back;
      const corners = rect(cx, cy, w, d, angle);
      if (blocked(corners) || !free(corners)) continue;
      if (fields.some((f) => overlaps(f.corners, corners, 3))) continue;
      fields.push({ corners, angle: angle + (rand() < 0.5 ? 0 : Math.PI / 2) });
    }
  }

  // Árvores, mais para fora do centro.
  const trees: Tree[] = [];
  const nTrees = o.size === "cidade" ? 140 : 220;
  for (let tries = 0; tries < nTrees * 6 && trees.length < nTrees; tries++) {
    const x = rand() * W;
    const y = rand() * H;
    const dist = Math.hypot(x - center[0], y - center[1]);
    if (rand() > Math.min(1, (dist / cfg.radius) ** 2 * 0.6)) continue;
    const r = between(2.4, 4.4);
    const box = rect(x, y, r * 2, r * 2, 0);
    if (blocked(box) || !free(box)) continue;
    if (fields.some((f) => insidePoly([x, y], f.corners))) continue;
    trees.push({ x, y, r });
  }

  return { width: W, height: H, center, roads, river, buildings, fields, trees };
}
