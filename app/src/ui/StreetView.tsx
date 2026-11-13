import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ArchStyle, VillageMap } from "../world/village";
import { insidePoly, distToPolyline, type Pt } from "../world/geom";
import { CONCRETE, MAP_COLORS, ROOFS, TEMPLE, TREES, type Viewer } from "./PlaceMap";

/*
 * Vista de rua do mini mapa, desenhada do zero num canvas: cada casa vira um
 * modelo pelo tipo de telhado (com janelas e porta), ruas e rio viram faixas no chão e árvores
 * viram copas. Projeção em perspectiva simples, recorte no plano próximo e
 * pintura de trás para frente (sem WebGL).
 */

const EYE = 1.7;
const NEAR = 0.25;
const FAR = 260;
const FOV = (72 * Math.PI) / 180;
const SKY_TOP = [126, 170, 214];
const SKY_LOW = [222, 232, 236];
const FOG = [214, 224, 226];
/** Detalhes de fachada (janelas, portas) só são desenhados de perto. */
const DETAIL = 95;
/** Direção da luz do sol (x, y do mapa com y para baixo, h para cima). */
const SUN: V3 = (() => {
  const v: V3 = [-0.45, -0.55, 0.7];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

type V3 = [number, number, number]; // x, y (mapa), h (altura)
type RGB = [number, number, number];

interface Decal {
  pts: V3[];
  color: RGB;
}

export interface Face {
  pts: V3[];
  color: RGB;
  ground?: boolean;
  /** Desenhos colados na face (janelas, portas), pintados junto com ela. */
  decals?: Decal[];
  /** Não sombrear pela luz (água, lajes de pedra no chão). */
  flat?: boolean;
}

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const GROUND = hex("#a9b27f");
const ROAD = { fantasia: hex("#cfc3a6"), atual: hex("#6b6f75") };

/** Paredes, janelas e portas de cada estilo. */
const LOOK: Record<
  ArchStyle,
  { walls: string[]; window: string; door: string; base: string; gap?: number }
> = {
  moderno: {
    walls: ["#d4d6d9", "#c2c7cd", "#e2ded6", "#cbbfae"],
    window: "#6f8797",
    door: "#4b5058",
    base: "#8d9096",
  },
  temperado: {
    walls: ["#efe6d2", "#e6d8bb", "#f3eee2", "#dccaa6"],
    window: "#46505a",
    door: "#6b4a2e",
    base: "#9b9283",
  },
  deserto: {
    walls: ["#dcb985", "#e5c796", "#d2ad78", "#ecd4a8"],
    window: "#3e352c",
    door: "#7a4f2c",
    base: "#c09a68",
    gap: 3.8,
  },
  tropical: {
    walls: ["#c9a46a", "#bb955c", "#d4b27c", "#b38b52"],
    window: "#3a3226",
    door: "#5e4228",
    base: "#8f7350",
    gap: 3.4,
  },
  frio: {
    walls: ["#7a5a3e", "#6b4f37", "#86664a", "#5f4632"],
    window: "#e8d7a0",
    door: "#3d2c1f",
    base: "#77736b",
    gap: 3.0,
  },
  neve: {
    walls: ["#8a6a4c", "#7a5a3e", "#9a7a5a", "#6b4f37"],
    window: "#f0dfa8",
    door: "#3d2c1f",
    base: "#8c8a85",
    gap: 3.0,
  },
  montanha: {
    walls: ["#aaa59b", "#9e998f", "#b4afa4", "#938e85"],
    window: "#3a3d42",
    door: "#5a4430",
    base: "#7e7a72",
    gap: 3.2,
  },
  nomade: {
    walls: ["#efe7d6", "#e6dbc3", "#f3ede0", "#dccfb4"],
    window: "#8a3b2e",
    door: "#9a4432",
    base: "#c7b896",
  },
  caca: {
    walls: ["#8b6d47", "#7d6140", "#977852", "#715737"],
    window: "#2f261b",
    door: "#3b2c1d",
    base: "#6e5a3f",
    gap: 4.5,
  },
};

/** Faixa (rua, rio) como quadriláteros no chão. */
function strip(points: Pt[], width: number, color: RGB, lift: number): Face[] {
  const faces: Face[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2);
    const ny = ((bx - ax) / len) * (width / 2);
    faces.push({
      pts: [
        [ax + nx, ay + ny, lift],
        [bx + nx, by + ny, lift],
        [bx - nx, by - ny, lift],
        [ax - nx, ay - ny, lift],
      ],
      color,
      ground: true,
    });
  }
  return faces;
}

const lerp2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist2 = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const up = (p: Pt, h: number): V3 => [p[0], p[1], h];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Parede (quad vertical) de p a q, entre as alturas z0 e z1. */
const wallQuad = (p: Pt, q: Pt, z0: number, z1: number): V3[] => [
  up(p, z0),
  up(q, z0),
  up(q, z1),
  up(p, z1),
];

/** Retângulo colado na parede p→q: u ao longo dela, z na altura, um pouco para fora. */
function onWall(p: Pt, q: Pt, out: Pt, u0: number, u1: number, z0: number, z1: number): V3[] {
  const a = lerp2(p, q, u0);
  const b = lerp2(p, q, u1);
  const o = 0.05;
  const A: Pt = [a[0] + out[0] * o, a[1] + out[1] * o];
  const B: Pt = [b[0] + out[0] * o, b[1] + out[1] * o];
  return wallQuad(A, B, z0, z1);
}

/**
 * Paredes de um polígono (casa ou cabana): com janelas por andar e uma porta na
 * parede mais perto da rua. Prédios altos do mundo real ganham faixas de vidro.
 */
function walls(
  faces: Face[],
  poly: Pt[],
  center: Pt,
  h: number,
  floors: number,
  color: RGB,
  look: (typeof LOOK)[ArchStyle],
  door: number,
  opts: { glass?: boolean; windows?: boolean; base?: boolean },
) {
  const win = hex(look.window);
  const doorC = hex(look.door);
  const baseC = hex(look.base);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const L = dist2(p, q);
    const m = lerp2(p, q, 0.5);
    const ol = dist2(m, center) || 1;
    const out: Pt = [(m[0] - center[0]) / ol, (m[1] - center[1]) / ol];
    const decals: Decal[] = [];
    if (opts.base && h > 1) decals.push({ pts: onWall(p, q, out, 0, 1, 0, 0.45), color: baseC });
    if (opts.glass) {
      // Faixa de vidro em cada andar (até 60), com o térreo mais alto.
      for (let f = 0; f < Math.min(floors, 60); f++) {
        const z = 0.4 + f * 3.2;
        decals.push({
          pts: onWall(p, q, out, 0.06, 0.94, z + (f ? 0.9 : 0.5), z + 2.6),
          color: f ? win : shade(win, 0.8),
        });
      }
    } else if (opts.windows !== false && L > 1.6) {
      const n = Math.max(1, Math.floor(L / (look.gap ?? 2.6)));
      for (let f = 0; f < Math.min(floors, 8); f++) {
        const z = 0.4 + f * 3.2;
        for (let j = 0; j < n; j++) {
          const u = (j + 0.5) / n;
          const isDoor = i === door && f === 0 && j === Math.floor(n / 2);
          const half = (isDoor ? 0.55 : 0.42) / L;
          decals.push({
            pts: onWall(p, q, out, u - half, u + half, isDoor ? 0.02 : z + 1.0, z + 2.25),
            color: isDoor ? doorC : win,
          });
        }
      }
    } else if (i === door) {
      const half = 0.55 / Math.max(L, 1.2);
      decals.push({ pts: onWall(p, q, out, 0.5 - half, 0.5 + half, 0.02, 1.9), color: doorC });
    }
    faces.push({ pts: wallQuad(p, q, 0, h), color, decals });
  }
}

/** Índice da parede (lado p→q) de frente para a rua mais próxima. */
function frontWall(poly: Pt[], roads: VillageMap["roads"]): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const m = lerp2(poly[i]!, poly[(i + 1) % poly.length]!, 0.5);
    for (const r of roads) {
      const d = distToPolyline(m, r.points);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return best;
}

/** Cone (telhado de palha, tenda) sobre um anel. */
function cone(faces: Face[], ring: Pt[], h: number, apex: V3, color: RGB) {
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    faces.push({ pts: [up(p, h), up(q, h), apex], color });
  }
}

/** Cúpula: anéis que encolhem até o topo. */
function dome(faces: Face[], c: Pt, r: number, h: number, color: RGB) {
  const N = 14;
  const rings = 4;
  const ring = (k: number) => {
    const t = (k / rings) * (Math.PI / 2);
    const rr = r * Math.cos(t);
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return [c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr, h + r * Math.sin(t)] as V3;
    });
  };
  for (let k = 0; k < rings; k++) {
    const A = ring(k);
    const B = ring(k + 1);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      faces.push({ pts: [A[i]!, A[j]!, B[j]!, B[i]!], color });
    }
  }
}

/** Telhado de duas ou quatro águas, com beiral; a cumeeira corre no lado comprido. */
function pitched(
  faces: Face[],
  k: Pt[],
  c: Pt,
  h: number,
  pitch: number,
  hip: boolean,
  roof: RGB,
  wall: RGB,
) {
  const [c0, c1, c2, c3] = k as [Pt, Pt, Pt, Pt];
  const short = dist2(c1, c2);
  const long = dist2(c0, c1);
  const rh = h + short * pitch;
  const m03 = lerp2(c0, c3, 0.5);
  const m12 = lerp2(c1, c2, 0.5);
  const inset = hip ? Math.min(0.45, short / 2 / long) : 0;
  const R0 = up(lerp2(m03, m12, inset), rh);
  const R1 = up(lerp2(m12, m03, inset), rh);
  // Beiral: o telhado sai um pouco além das paredes.
  const e = 1 + 0.5 / Math.max(2, short);
  const E = k.map((p) => lerp2(c, p, e)) as [Pt, Pt, Pt, Pt];
  const eh = h - 0.18;
  faces.push({ pts: [up(E[0], eh), up(E[1], eh), R1, R0], color: roof });
  faces.push({ pts: [up(E[2], eh), up(E[3], eh), R0, R1], color: roof });
  if (hip) {
    faces.push({ pts: [up(E[1], eh), up(E[2], eh), R1], color: roof });
    faces.push({ pts: [up(E[3], eh), up(E[0], eh), R0], color: roof });
  } else {
    // Oitões: a parede sobe em triângulo até a cumeeira.
    faces.push({ pts: [up(c1, h), up(c2, h), R1], color: wall });
    faces.push({ pts: [up(c3, h), up(c0, h), R0], color: wall });
  }
  return { R0, R1, rh };
}

/** Caixa simples (chaminé, torre, casa de máquinas). */
function box(faces: Face[], poly: Pt[], z0: number, z1: number, side: RGB, top: RGB) {
  for (let i = 0; i < poly.length; i++)
    faces.push({ pts: wallQuad(poly[i]!, poly[(i + 1) % poly.length]!, z0, z1), color: side });
  faces.push({ pts: poly.map((p) => up(p, z1)), color: top });
}

const shrinkTo = (poly: Pt[], at: Pt, k: number) => poly.map((p) => lerp2(at, p, k));

/** Monta as faces do mundo 3D uma vez por mapa. */
export function buildScene(map: VillageMap) {
  const faces: Face[] = [];
  const style: ArchStyle = map.style ?? "temperado";
  const look = LOOK[style];
  if (map.sea)
    faces.push({
      pts: map.sea.poly.map(([x, y]) => [x, y, 0.008] as V3),
      color: hex(MAP_COLORS.water),
      ground: true,
    });
  if (map.river)
    faces.push(...strip(map.river.points, map.river.width, hex(MAP_COLORS.water), 0.01));
  for (const f of map.fields)
    faces.push({
      pts: f.corners.map(([x, y]) => [x, y, 0.005] as V3),
      color: hex("#c9bb7e"),
      ground: true,
    });
  for (const r of map.roads)
    faces.push(...strip(r.points, r.width, map.era === "atual" ? ROAD.atual : ROAD.fantasia, 0.02));
  for (const d of map.docks ?? [])
    faces.push({
      pts: d.pier.map(([x, y]) => [x, y, 0.35] as V3),
      color: hex("#9c7c56"),
      ground: true,
    });

  for (const b of map.buildings) {
    const roof = b.roof ?? (map.era === "atual" ? "plano" : "duas-aguas");
    const tone = b.tone % 4;
    const wall = hex(b.kind === "armazem" ? "#b9a07a" : look.walls[tone]!);
    const roofC = hex(
      b.kind === "templo"
        ? TEMPLE[style][0]
        : b.kind === "armazem"
          ? "#8a7458"
          : style === "moderno" && roof === "plano"
            ? CONCRETE[tone]![1]
            : (ROOFS[style][tone] ?? ROOFS[style][0]!)[0],
    );
    const c = b.center;
    // Lado 0→1 como o comprido.
    let k = b.corners;
    if (dist2(k[0]!, k[1]!) < dist2(k[1]!, k[2]!)) k = [k[1]!, k[2]!, k[3]!, k[0]!];

    if (roof === "redondo" || roof === "tenda") {
      const r = Math.min(dist2(k[0]!, k[1]!), dist2(k[1]!, k[2]!)) / 2;
      const N = 10;
      const ring = Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Pt;
      });
      const tent = roof === "tenda";
      const h = tent ? 1.7 : b.kind === "templo" ? 3.4 : 2.3;
      walls(faces, ring, c, h, 1, wall, look, frontWall(ring, map.roads), {
        windows: false,
      });
      const eave = shrinkTo(ring, c, tent ? 1 : 1.18);
      const apexH = h + r * (tent ? 0.55 : 1.15) + (b.kind === "templo" ? 2 : 0);
      cone(faces, eave, h - (tent ? 0 : 0.25), [c[0], c[1], apexH], tent ? wall : roofC);
      continue;
    }

    const h = 3.2 * b.floors + 0.4;
    const door = frontWall(k, map.roads);
    const glass = style === "moderno" && roof === "plano" && b.floors >= 3;
    walls(faces, k, c, h, b.floors, wall, look, door, { glass, base: true });

    if (roof === "plano" || roof === "patio") {
      // Laje com platibanda; no pátio, o miolo fica aberto (laje em anel).
      const top = roof === "patio" ? hex("#efe3c6") : roofC;
      faces.push({ pts: k.map((p) => up(p, h)), color: shade(top, 0.92) });
      const par = shrinkTo(k, c, 0.94);
      for (let i = 0; i < 4; i++) {
        const p = k[i]!;
        const q = k[(i + 1) % 4]!;
        faces.push({ pts: wallQuad(p, q, h, h + 0.5), color: wall });
        // Lado de dentro da platibanda (visto de cima).
        faces.push({
          pts: [
            up(par[(i + 1) % 4]!, h + 0.5),
            up(par[i]!, h + 0.5),
            up(par[i]!, h),
            up(par[(i + 1) % 4]!, h),
          ],
          color: shade(wall, 0.85),
        });
      }
      if (b.kind === "templo")
        dome(
          faces,
          c,
          Math.min(dist2(k[0]!, k[1]!), dist2(k[1]!, k[2]!)) * 0.36,
          h,
          hex("#ece2cc"),
        );
      else if (style === "moderno" && b.floors >= 4) {
        const m = shrinkTo(k, lerp2(c, k[0]!, 0.3), 0.25);
        box(faces, m, h, h + 2.2, hex("#b4b8bc"), hex("#a3a7ab"));
      }
      continue;
    }

    const res = pitched(
      faces,
      k,
      c,
      h,
      roof === "quatro-aguas" ? 0.45 : 0.55,
      roof === "quatro-aguas",
      roofC,
      wall,
    );
    if (b.kind === "templo") {
      // Torre com telhado em pirâmide numa das pontas.
      const t = [k[0]!, lerp2(k[0]!, k[1]!, 0.28), lerp2(k[3]!, k[2]!, 0.28), k[3]!];
      const tc = lerp2(lerp2(t[0]!, t[2]!, 0.5), lerp2(t[1]!, t[3]!, 0.5), 0.5);
      const th = res.rh + 6;
      box(faces, t, 0, th, wall, roofC);
      cone(faces, shrinkTo(t, tc, 1.1), th, [tc[0], tc[1], th + 5], roofC);
    } else if (b.kind !== "armazem" && style !== "tropical" && style !== "caca" && b.tone !== 2) {
      // Chaminé perto da cumeeira.
      const at = lerp2(lerp2(k[0]!, k[1]!, 0.72), lerp2(k[3]!, k[2]!, 0.72), 0.3);
      const ch = [
        [at[0] - 0.35, at[1] - 0.35],
        [at[0] + 0.35, at[1] - 0.35],
        [at[0] + 0.35, at[1] + 0.35],
        [at[0] - 0.35, at[1] + 0.35],
      ] as Pt[];
      box(faces, ch, h, res.rh + 0.8, hex(look.base), shade(hex(look.base), 0.6));
    }
  }
  // Muralha e cidadela: paredes altas dos dois lados (sem telhado).
  const stone = hex("#a39a88");
  const wallFaces = (pts: Pt[], h: number) => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const quad: V3[] = [
        [p[0], p[1], 0],
        [q[0], q[1], 0],
        [q[0], q[1], h],
        [p[0], p[1], h],
      ];
      faces.push({ pts: quad, color: stone });
      faces.push({ pts: [...quad].reverse(), color: stone });
    }
  };
  if (map.wall) wallFaces(map.wall, 7);
  if (map.citadel) wallFaces(map.citadel, 11);
  if (map.plaza) {
    const { x, y, r } = map.plaza;
    faces.push({
      pts: Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [x + Math.cos(a) * r, y + Math.sin(a) * r, 0.03] as V3;
      }),
      color: hex(map.era === "atual" ? "#c9c6bf" : "#ddd2b6"),
      ground: true,
    });
  }
  return faces;
}

function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(",")})`;
}

/** Pode ficar nesse ponto? (fora das casas e do rio) */
export function walkable(map: VillageMap, p: Pt): boolean {
  if (p[0] < 0 || p[1] < 0 || p[0] > map.width || p[1] > map.height) return false;
  if (map.sea && insidePoly(p, map.sea.poly)) return false;
  if (map.river && distToPolyline(p, map.river.points) < map.river.width / 2 - 0.5) {
    // Atravessa o rio só pela ponte (onde há rua).
    if (!map.roads.some((r) => distToPolyline(p, r.points) < r.width / 2)) return false;
  }
  // Muralha: só passa pelos portões (onde a rua cruza); a cidadela é fechada.
  const onRoad = map.roads.some((r) => distToPolyline(p, r.points) < r.width / 2);
  if (map.wall && !onRoad && distToPolyline(p, [...map.wall, map.wall[0]!]) < 1.2) return false;
  if (map.citadel && insidePoly(p, map.citadel)) return false;
  return !map.buildings.some(
    (b) => insidePoly(p, b.corners) || distToPolyline(p, [...b.corners, b.corners[0]!]) < 0.4,
  );
}

export function StreetView({
  map,
  scene,
  viewer,
  onMove,
}: {
  map: VillageMap;
  scene: Face[];
  viewer: Viewer;
  onMove(v: Viewer): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const state = useRef(viewer);
  useEffect(() => {
    state.current = viewer;
  }, [viewer]);
  const pitch = useRef(0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  // Desenha o quadro.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = W / 2 / Math.tan(FOV / 2);
    const horizon = H / 2 + pitch.current * H;
    const { x: cx, y: cy, yaw } = viewer;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, mix(SKY_TOP, SKY_TOP, 0));
    sky.addColorStop(1, mix(SKY_LOW, SKY_LOW, 0));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Math.max(0, horizon));
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    // Chão no tom do bioma (areia no deserto, branco no gelo, verde no resto).
    const soil = map.ground ? (hex(map.ground).map((v) => v * 0.74) as number[]) : GROUND;
    ground.addColorStop(0, mix(soil, FOG, 0.75));
    ground.addColorStop(1, mix(soil, soil, 0));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Sol (fixo no céu, a noroeste) e morros ao longe, que giram com o olhar.
    const sunYaw = Math.atan2(-SUN[1], -SUN[0]) + Math.PI;
    const rel = Math.atan2(Math.sin(sunYaw - yaw), Math.cos(sunYaw - yaw));
    if (Math.abs(rel) < FOV) {
      const sx = W / 2 + f * Math.tan(rel);
      const sy = horizon - H * 0.32;
      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, H * 0.35);
      glow.addColorStop(0, "rgba(255,248,225,0.95)");
      glow.addColorStop(0.08, "rgba(255,244,210,0.6)");
      glow.addColorStop(1, "rgba(255,244,210,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, Math.max(0, horizon));
    }
    const peaks = map.style === "montanha" || map.style === "neve" ? 0.16 : 0.05;
    for (const [layer, amp, tone] of [
      [0, peaks, 0.55],
      [1, peaks * 0.55, 0.35],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= W; x += 6) {
        const a = yaw + Math.atan((x - W / 2) / f) + layer * 1.7;
        const n =
          Math.sin(a * 3) * 0.5 + Math.sin(a * 7 + 1.3) * 0.3 + Math.sin(a * 13 + 0.4) * 0.2;
        ctx.lineTo(x, horizon - H * amp * (0.55 + 0.45 * n));
      }
      ctx.lineTo(W, horizon);
      ctx.closePath();
      ctx.fillStyle = mix(
        soil.map((v) => v * 0.8),
        FOG,
        tone + 0.1,
      );
      ctx.fill();
    }

    const cam = (p: V3): V3 => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      return [-dx * sin + dy * cos, dx * cos + dy * sin, p[2] - EYE]; // direita, frente, cima
    };
    const drawn: {
      d: number;
      pts: [number, number][];
      color: string;
      ground: boolean;
      decals: { pts: [number, number][]; color: string }[];
    }[] = [];
    for (const face of scene) {
      // Descarta o que está longe ou atrás, rápido.
      const p0 = face.pts[0]!;
      const far = Math.hypot(p0[0] - cx, p0[1] - cy);
      if (far > FAR + 40) continue;
      const pts = face.pts.map(cam);
      if (pts.every((p) => p[1] < NEAR)) continue;
      // Recorte no plano próximo.
      const clipped: V3[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (a[1] >= NEAR) clipped.push(a);
        if (a[1] >= NEAR !== b[1] >= NEAR) {
          const t = (NEAR - a[1]) / (b[1] - a[1]);
          clipped.push([a[0] + (b[0] - a[0]) * t, NEAR, a[2] + (b[2] - a[2]) * t]);
        }
      }
      if (clipped.length < 3) continue;
      const toScreen = (p: V3) =>
        [W / 2 + (f * p[0]) / p[1], horizon - (f * p[2]) / p[1]] as [number, number];
      const screen = clipped.map(toScreen);
      // Face de costas (paredes e telhados): não desenha.
      if (!face.ground) {
        let area = 0;
        for (let i = 0; i < screen.length; i++) {
          const a = screen[i]!;
          const b = screen[(i + 1) % screen.length]!;
          area += a[0] * b[1] - b[0] * a[1];
        }
        if (area > 0) continue;
      }
      const depth = clipped.reduce((s, p) => s + p[1], 0) / clipped.length;
      // Luz: normal da face (3D) contra o sol; o lado na sombra fica mais escuro.
      let light = 1;
      if (!face.ground && !face.flat && face.pts.length >= 3) {
        const [a, b, c] = face.pts as [V3, V3, V3];
        const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        // A ordem dos vértices deixa a normal para dentro: inverte.
        const dot = -(nx * SUN[0] + ny * SUN[1] + nz * SUN[2]) / nl;
        light = 0.86 + 0.26 * Math.max(0, dot) - 0.1 * Math.max(0, -dot);
      }
      const color = (face.color as number[]).map((v) => Math.min(255, v * light));
      const fog = Math.min(1, Math.max(0, (depth - 70) / (FAR - 70)));
      // Janelas e portas: projetadas como a face, só de perto.
      const decals: { pts: [number, number][]; color: string }[] = [];
      if (face.decals && depth < DETAIL)
        for (const dc of face.decals) {
          const q = dc.pts.map(cam);
          if (q.some((p) => p[1] < NEAR)) continue;
          decals.push({
            pts: q.map(toScreen),
            color: mix(
              dc.color.map((v) => Math.min(255, v * (0.85 + 0.15 * light))),
              FOG,
              fog * 0.7,
            ),
          });
        }
      drawn.push({
        d: depth,
        pts: screen,
        color: mix(color, FOG, fog * 0.7),
        ground: !!face.ground,
        decals,
      });
    }
    // Árvores entram na mesma ordenação que as casas (copa redonda sobre um tronco).
    type Item = { d: number; ground: boolean; draw(): void };
    const items: Item[] = drawn.map((d) => ({
      d: d.d,
      ground: d.ground,
      draw() {
        ctx.beginPath();
        d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
        if (d.ground) {
          // Fecha as frestas entre faixas vizinhas.
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(40,32,24,0.3)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
        for (const dc of d.decals) {
          ctx.beginPath();
          dc.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = dc.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(40,32,24,0.35)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      },
    }));
    const tree = TREES[map.style ?? "temperado"];
    for (const t of map.trees) {
      const p = cam([t.x, t.y, 0]);
      if (p[1] < NEAR + 0.5 || p[1] > FAR) continue;
      items.push({
        d: p[1],
        ground: false,
        draw() {
          const sx = W / 2 + (f * p[0]) / p[1];
          const base = horizon + (f * EYE) / p[1];
          const crownH = 3 + t.r * 1.2;
          const top = horizon - (f * (crownH - EYE)) / p[1];
          const rr = (f * t.r * 0.9) / p[1];
          const fog = Math.min(1, Math.max(0, (p[1] - 70) / (FAR - 70))) * 0.7;
          const leaf = hex(tree.fill).map((v) => v * 0.78);
          const dark = hex(tree.edge);
          ctx.fillStyle = mix([92, 70, 48], FOG, fog);
          if (tree.kind === "pinho") {
            const tall = (f * (t.r * 2.6 + 2)) / p[1];
            ctx.fillRect(sx - rr * 0.08, base - tall * 0.25, rr * 0.16, tall * 0.25);
            for (let i = 0; i < 3; i++) {
              const y0 = base - tall * (0.2 + i * 0.26);
              const w = rr * (1.1 - i * 0.28);
              ctx.beginPath();
              ctx.moveTo(sx - w, y0);
              ctx.lineTo(sx + w, y0);
              ctx.lineTo(sx, y0 - tall * 0.42);
              ctx.closePath();
              ctx.fillStyle = mix(i % 2 ? leaf : dark, FOG, fog);
              ctx.fill();
            }
            return;
          }
          if (tree.kind === "palma") {
            const tall = (f * (t.r * 1.8 + 3.5)) / p[1];
            const tx = sx + rr * 0.25;
            ctx.strokeStyle = mix([120, 92, 60], FOG, fog);
            ctx.lineWidth = Math.max(1, rr * 0.14);
            ctx.beginPath();
            ctx.moveTo(sx, base);
            ctx.quadraticCurveTo(sx, base - tall * 0.6, tx, base - tall);
            ctx.stroke();
            ctx.strokeStyle = mix(leaf, FOG, fog);
            ctx.lineWidth = Math.max(1, rr * 0.18);
            for (let i = 0; i < 7; i++) {
              const a = (i / 7) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(tx, base - tall);
              ctx.quadraticCurveTo(
                tx + Math.cos(a) * rr * 0.6,
                base - tall - rr * 0.5,
                tx + Math.cos(a) * rr * 1.3,
                base - tall + rr * (0.25 + 0.35 * Math.abs(Math.sin(a))),
              );
              ctx.stroke();
            }
            return;
          }
          ctx.fillRect(sx - rr * 0.12, top, rr * 0.24, base - top);
          ctx.beginPath();
          ctx.arc(sx, top, rr, 0, Math.PI * 2);
          ctx.fillStyle = mix(
            dark.map((v) => v * 1.1),
            FOG,
            fog,
          );
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx - rr * 0.22, top - rr * 0.22, rr * 0.68, 0, Math.PI * 2);
          ctx.fillStyle = mix(leaf, FOG, fog);
          ctx.fill();
        },
      });
    }
    // Chão primeiro, depois o resto de trás para frente.
    items.sort((a, b) => (a.ground !== b.ground ? (a.ground ? -1 : 1) : b.d - a.d));
    for (const it of items) it.draw();
  }, [map, scene, viewer]);

  // Andar com as teclas enquanto estiverem apertadas.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;
      if (k.size) {
        let { x, y, yaw } = state.current;
        const turn =
          (k.has("ArrowLeft") || k.has("a") ? -1 : 0) + (k.has("ArrowRight") || k.has("d") ? 1 : 0);
        const go =
          (k.has("ArrowUp") || k.has("w") ? 1 : 0) - (k.has("ArrowDown") || k.has("s") ? 1 : 0);
        yaw += turn * dt * 1.8;
        const speed = (k.has("Shift") ? 14 : 6) * dt * go;
        const nx = x + Math.cos(yaw) * speed;
        const ny = y + Math.sin(yaw) * speed;
        if (walkable(map, [nx, ny])) {
          x = nx;
          y = ny;
        } else if (walkable(map, [nx, y])) x = nx;
        else if (walkable(map, [x, ny])) y = ny;
        onMove({ x, y, yaw });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, onMove]);

  const keyName = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const MOVE_KEYS = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "w",
    "a",
    "s",
    "d",
    "Shift",
  ];
  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw: viewer.yaw, pitch: pitch.current };
  };
  const onDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = canvas.current?.clientWidth ?? 600;
    pitch.current = Math.max(-0.35, Math.min(0.35, d.pitch + (e.clientY - d.y) / 600));
    onMove({ ...viewer, yaw: d.yaw - ((e.clientX - d.x) / w) * FOV });
  };

  return (
    <canvas
      ref={canvas}
      className="street-view"
      tabIndex={0}
      aria-label="Vista de rua. Setas ou W A S D para andar e virar; arraste para olhar em volta."
      onKeyDown={(e) => {
        const k = keyName(e);
        if (MOVE_KEYS.includes(k)) {
          e.preventDefault();
          keys.current.add(k);
        }
      }}
      onKeyUp={(e) => keys.current.delete(keyName(e))}
      onBlur={() => keys.current.clear()}
      onPointerDown={onDown}
      onPointerMove={onDrag}
      onPointerUp={() => (drag.current = null)}
    />
  );
}
