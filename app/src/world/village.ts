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
  /** Elementos do povoado (opcionais): muralha, cidadela, praça, templo e favela. */
  walls?: boolean;
  citadel?: boolean;
  plaza?: boolean;
  temple?: boolean;
  shanty?: boolean;
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
      walls: o.walls === true,
      citadel: o.citadel === true,
      plaza: o.plaza === true,
      temple: o.temple === true,
      shanty: o.shanty === true,
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
  /** Prédio especial (desenhado diferente). */
  kind?: "templo";
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
  /** Muralha: polígono fechado em volta do centro (torres nos vértices). */
  wall: Pt[] | null;
  /** Cidadela: quadrado murado perto do centro. */
  citadel: Pt[] | null;
  /** Praça: círculo livre no centro. */
  plaza: { x: number; y: number; r: number } | null;
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
  const raw = o.road
    ? wander(rand, [-160, mainY], between(-0.12, 0.12), W + 320)
    : wander(rand, [W * 0.24, mainY], between(-0.15, 0.15), W * 0.52);
  // O centro do povoado fica no meio do mapa (a estrada é deslocada até ele).
  const c0 = along(raw, lineLength(raw) * between(0.45, 0.55))!.p;
  const shift: Pt = [
    W / 2 + between(-W * 0.06, W * 0.06) - c0[0],
    H / 2 + between(-H * 0.05, H * 0.05) - c0[1],
  ];
  const main = raw.map(([x, y]) => [x + shift[0], y + shift[1]] as Pt);
  roads.push({ points: main, width: o.road ? 8 : 5, main: true });
  const center: Pt = [c0[0] + shift[0], c0[1] + shift[1]];

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

  // Praça, cidadela e muralha (antes das casas, que se desviam deles).
  const plaza = o.plaza ? { x: center[0], y: center[1], r: o.size === "cidade" ? 18 : 13 } : null;
  let citadel: Pt[] | null = null;
  if (o.citadel) {
    const at = along(main, lineLength(main) * 0.5)!;
    const side = rand() < 0.5 ? -1 : 1;
    const off = (plaza?.r ?? 0) + 24;
    const cx = center[0] - Math.sin(at.angle) * side * off;
    const cy = center[1] + Math.cos(at.angle) * side * off;
    citadel = rect(cx, cy, 30, 30, at.angle + between(-0.2, 0.2));
  }
  let wall: Pt[] | null = null;
  if (o.walls) {
    const R = cfg.radius * 0.72;
    const n = 14;
    const a0 = rand() * Math.PI;
    wall = Array.from({ length: n }, (_, i) => {
      const a = a0 + (i / n) * Math.PI * 2;
      const r = R * between(0.86, 1.1);
      return [center[0] + Math.cos(a) * r * 1.15, center[1] + Math.sin(a) * r * 0.85] as Pt;
    });
  }
  const wallLine = wall ? [...wall, wall[0]!] : null;

  const blocked = (poly: Pt[]) => {
    if (citadel && overlaps(citadel, poly, 3)) return true;
    for (const p of poly) {
      if (plaza && Math.hypot(p[0] - plaza.x, p[1] - plaza.y) < plaza.r + 1.5) return true;
      if (wallLine && distToPolyline(p, wallLine) < 2.5) return true;
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
          // Com muralha, quase tudo fica dentro dela.
          const inside = !wall || insidePoly(at.p, wall);
          const prob =
            Math.exp(-((dist / cfg.radius) ** 2)) *
            (pass === 0 ? 1 : 0.6) *
            (inside ? (wall ? 1.6 : 1) : 0.25);
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

  // Templo: um prédio maior, de frente para a praça (ou o centro).
  if (o.temple) {
    for (let tries = 0; tries < 40; tries++) {
      const a = rand() * Math.PI * 2;
      const r = (plaza?.r ?? 6) + 11 + tries * 0.6;
      const cx = center[0] + Math.cos(a) * r;
      const cy = center[1] + Math.sin(a) * r;
      const corners = rect(cx, cy, 13, 20, a);
      if (blocked(corners)) continue;
      // Tira as casas que estavam no caminho.
      for (let i = buildings.length - 1; i >= 0; i--)
        if (overlaps(buildings[i]!.corners, corners, 1.5)) buildings.splice(i, 1);
      buildings.push({ corners, center: [cx, cy], floors: 3, tone: 2, kind: "templo" });
      break;
    }
  }

  // Favela: casinhas apertadas do lado de fora (da muralha ou da área central).
  if (o.shanty) {
    const limit = wall ? 0 : cfg.radius * 0.9;
    for (let tries = 0; tries < 900 && buildings.length < cfg.target * 1.5; tries++) {
      const a = rand() * Math.PI * 2;
      const r = (wall ? cfg.radius * 0.8 : limit) + rand() * cfg.radius * 0.45;
      const cx = center[0] + Math.cos(a) * r * 1.15;
      const cy = center[1] + Math.sin(a) * r * 0.85;
      if (wall && insidePoly([cx, cy], wall)) continue;
      const corners = rect(cx, cy, between(3.5, 6), between(3.5, 5.5), rand() * Math.PI);
      if (blocked(corners) || !free(corners)) continue;
      buildings.push({ corners, center: [cx, cy], floors: 1, tone: 3 });
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
      if (wall && corners.some((c) => insidePoly(c, wall))) continue;
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
    if (wall && insidePoly([x, y], wall)) continue;
    trees.push({ x, y, r });
  }

  return {
    width: W,
    height: H,
    center,
    roads,
    river,
    buildings,
    fields,
    trees,
    wall,
    citadel,
    plaza,
  };
}
