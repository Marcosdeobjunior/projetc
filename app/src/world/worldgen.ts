import { rng } from "./geom";

/*
 * Mapa-múndi do projeto: gerador procedural e modelo de dados.
 *
 * O que é gravado (`.talia/mapa-mundi.json`) é só o essencial e editável: a
 * altura de cada célula de uma grade (o relevo, que o pincel muda), as cidades
 * e os estados (nome, cor, capital). Todo o resto (clima, biomas, rios,
 * fronteiras, estradas) é derivado disso em `deriveWorld`, então editar o
 * relevo ou mudar uma capital refaz rios e fronteiras na hora.
 */

/** Planeta inteiro em projeção equirretangular: 1 célula = 1° de longitude e de latitude. */
export const COLS = 360;
export const ROWS = 180;
/** Grade antiga (só uma região), convertida ao abrir. */
const OLD_COLS = 320;
const OLD_ROWS = 200;

/** Coluna com volta ao mundo (a longitude dá a volta). */
export const wrapCol = (x: number) => ((x % COLS) + COLS) % COLS;
/** Diferença de coluna pelo caminho mais curto (pode atravessar a costura). */
export const dCol = (a: number, b: number) => {
  let d = a - b;
  if (d > COLS / 2) d -= COLS;
  if (d < -COLS / 2) d += COLS;
  return d;
};
export const SEA = 128;

export type Template = "continentes" | "ilhas" | "pangeia";

export const TEMPLATES: { value: Template; label: string }[] = [
  { value: "continentes", label: "Continentes" },
  { value: "ilhas", label: "Arquipélago" },
  { value: "pangeia", label: "Pangeia" },
];

export interface WorldOptions {
  seed: number;
  template: Template;
  /** Fração de terra (0,15 a 0,6). */
  land: number;
  states: number;
  burgs: number;
}

export interface Burg {
  id: string;
  name: string;
  /** Posição em células (pode ter fração). */
  x: number;
  y: number;
  /** Nota "lugar" do Mundo ligada a esta cidade. */
  noteId?: string;
}

export interface WorldState {
  id: string;
  name: string;
  color: string;
  /** Cidade capital (de onde o estado se espalha). */
  capital: string;
  /** Lugar do Mundo que é este estado. */
  noteId?: string;
}

/** Tipos de rota, da maior para a menor. */
export type RouteType = "principal" | "estrada" | "trilha" | "maritima";

export const ROUTE_TYPES: { value: RouteType; label: string; hint: string }[] = [
  { value: "principal", label: "Rodovia principal", hint: "Grande eixo entre capitais e regiões" },
  { value: "estrada", label: "Estrada", hint: "Liga cidades; caminhos de romeiros, de comércio" },
  { value: "trilha", label: "Trilha", hint: "Caminho estreito entre povoados, serras e matas" },
  { value: "maritima", label: "Rota marítima", hint: "Travessia por mar entre portos" },
];

/** Rota desenhada à mão (com nome), por pontos de passagem em células. */
export interface Route {
  id: string;
  name: string;
  type: RouteType;
  points: [number, number][];
}

export interface WorldMap {
  name: string;
  options: WorldOptions;
  heights: Uint8Array;
  burgs: Burg[];
  states: WorldState[];
  /** Rotas desenhadas (as estradas geradas não ficam aqui: são calculadas). */
  routes?: Route[];
}

export const DEFAULT_OPTIONS: Omit<WorldOptions, "seed"> = {
  template: "continentes",
  land: 0.34,
  states: 7,
  burgs: 50,
};

/* ---------- Ruído ---------- */

/** Ruído 3D (Perlin) em [-1, 1], fractal: amostrado sobre a esfera, não distorce nos polos. */
function makeNoise3(rand: () => number) {
  const perm = new Uint16Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return (g & 1 ? -u : u) + (g & 2 ? -v : v);
  };
  const noise = (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = perm[X]! + Y;
    const AA = perm[A]! + Z;
    const AB = perm[A + 1]! + Z;
    const B = perm[X + 1]! + Y;
    const BA = perm[B]! + Z;
    const BB = perm[B + 1]! + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA]!, x, y, z), grad(perm[BA]!, x - 1, y, z), u),
        lerp(grad(perm[AB]!, x, y - 1, z), grad(perm[BB]!, x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad(perm[AA + 1]!, x, y, z - 1), grad(perm[BA + 1]!, x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1]!, x, y - 1, z - 1), grad(perm[BB + 1]!, x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  };
  return (x: number, y: number, z: number, octaves = 6) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

/** Largura real de uma célula em cada linha (encolhe perto dos polos): cos(latitude). */
const ROW_COS = Array.from({ length: 180 }, (_, y) =>
  Math.max(0.12, Math.cos(Math.PI / 2 - ((y + 0.5) / 180) * Math.PI)),
);
/** Comprimento de um passo entre células vizinhas, medido sobre a esfera. */
const stepLen = (dx: number, dy: number, y: number) => Math.hypot(dx * ROW_COS[y]!, dy);

/** Ponto da esfera unitária no centro de uma célula. */
export function cellOnSphere(x: number, y: number): [number, number, number] {
  const lon = (x / COLS) * 2 * Math.PI;
  const lat = Math.PI / 2 - (y / ROWS) * Math.PI;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function makeNoise(rand: () => number) {
  const perm = new Uint16Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const grad = (h: number, x: number, y: number) => {
    const g = h & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return (g & 1 ? -u : u) + (g & 2 ? -2 * v : 2 * v);
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x: number, y: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X]! + Y]!;
    const ab = perm[perm[X]! + Y + 1]!;
    const ba = perm[perm[X + 1]! + Y]!;
    const bb = perm[perm[X + 1]! + Y + 1]!;
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) / 2.2;
  };
  /** Ruído fractal em [-1, 1]. */
  return (x: number, y: number, octaves = 6) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

/* ---------- Nomes ---------- */

const ONSETS = [
  "",
  "b",
  "br",
  "c",
  "d",
  "f",
  "g",
  "gr",
  "l",
  "m",
  "n",
  "p",
  "r",
  "s",
  "t",
  "tr",
  "v",
  "z",
  "al",
  "or",
  "el",
];
const VOWELS = ["a", "e", "i", "o", "u", "a", "e", "o", "ia", "ei", "ou", "ae"];
const CODAS = ["", "", "", "n", "r", "s", "l", "m", "nd", "rt", "th"];
const ENDINGS = [
  "ia",
  "or",
  "en",
  "ar",
  "ion",
  "eth",
  "ura",
  "and",
  "ost",
  "ir",
  "ena",
  "un",
  "ás",
  "el",
];

export function makeNamer(seed: number) {
  const rand = rng(seed ^ 0x51ed27);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)]!;
  const used = new Set<string>();
  return () => {
    for (let tries = 0; tries < 30; tries++) {
      const syl = 1 + Math.floor(rand() * 2);
      let s = "";
      for (let i = 0; i < syl; i++)
        s += pick(ONSETS) + pick(VOWELS) + (i === syl - 1 ? "" : pick(CODAS));
      s += pick(ENDINGS);
      s = s.replace(/(.)\1\1/g, "$1$1");
      const name = s.charAt(0).toUpperCase() + s.slice(1);
      if (name.length >= 4 && name.length <= 11 && !used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return "Terra " + (used.size + 1);
  };
}

/* ---------- Geração ---------- */

const STATE_COLORS = [
  "#c9605a",
  "#d39b4a",
  "#d8c24f",
  "#86b55a",
  "#4fa58f",
  "#4f8fc0",
  "#7a6fc4",
  "#b065a8",
  "#c97a8f",
  "#8c8f4a",
  "#5a9ab0",
  "#a87a4f",
  "#6a9a5a",
  "#c47a5a",
  "#7f8fb0",
  "#b0a05a",
  "#5ab08f",
  "#a05a7a",
];

export function stateColor(i: number) {
  return STATE_COLORS[i % STATE_COLORS.length]!;
}

let idCounter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function generateHeights(o: WorldOptions): Uint8Array {
  const rand = rng(o.seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const aspect = COLS / ROWS; // 2: o planeta tem o dobro de largura que altura
  const blobs: { x: number; y: number; r: number }[] = [];
  const add = (n: number, r0: number, r1: number) => {
    for (let i = 0; i < n; i++)
      blobs.push({ x: rand() * aspect, y: between(0.26, 0.74), r: between(r0, r1) });
  };
  if (o.template === "pangeia") {
    blobs.push({ x: rand() * aspect, y: between(0.42, 0.58), r: between(0.4, 0.48) });
    add(3, 0.08, 0.16);
  } else if (o.template === "ilhas") add(24 + Math.floor(rand() * 12), 0.05, 0.11);
  else add(5 + Math.floor(rand() * 3), 0.16, 0.28);

  const raw = new Float32Array(COLS * ROWS);
  // Tudo sobre a esfera: ruído 3D e distância pelo arco (formas iguais no equador e nos polos).
  const noise3 = makeNoise3(rand);
  const o1 = [rand() * 50, rand() * 50, rand() * 50] as const;
  const o2 = [rand() * 50, rand() * 50, rand() * 50] as const;
  const centers = blobs.map((b) => ({
    p: cellOnSphere((b.x / aspect) * COLS, b.y * ROWS),
    r: b.r,
  }));
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const [px, py, pz] = cellOnSphere(x + 0.5, y + 0.5);
      let mask = 0;
      for (const b of centers) {
        const dot = px * b.p[0] + py * b.p[1] + pz * b.p[2];
        const ang = Math.acos(Math.max(-1, Math.min(1, dot))) / Math.PI; // 0 a 1 (meia volta)
        mask = Math.max(mask, 1 - ang / b.r);
      }
      const n = noise3(px * 1.05 + o1[0], py * 1.05 + o1[1], pz * 1.05 + o1[2]);
      const ridge = 1 - Math.abs(noise3(px * 1.6 + o2[0], py * 1.6 + o2[1], pz * 1.6 + o2[2], 4));
      raw[y * COLS + x] = mask * 0.55 + n * 0.5 + ridge * ridge * 0.12;
    }
  }
  // No mapa plano tudo precisa caber inteiro: gira o planeta para que a borda
  // (180°) caia no meridiano com menos terra e põe mar nessa faixa e nas latitudes
  // altas (onde o plano deforma). Assim nenhum continente é cortado na borda.
  {
    const sorted0 = Float32Array.from(raw).sort();
    const t0 =
      sorted0[Math.floor((1 - Math.min(0.6, Math.max(0.15, o.land))) * (sorted0.length - 1))]!;
    const colLand = new Float64Array(COLS);
    for (let i = 0; i < raw.length; i++) if (raw[i]! >= t0) colLand[i % COLS]! += 1;
    let bestX = 0;
    let bestSum = Infinity;
    for (let x = 0; x < COLS; x++) {
      let sum = 0;
      for (let k = -12; k <= 12; k++) sum += colLand[wrapCol(x + k)]!;
      if (sum < bestSum) {
        bestSum = sum;
        bestX = x;
      }
    }
    const rolled = new Float32Array(raw.length);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) rolled[y * COLS + x] = raw[y * COLS + wrapCol(x + bestX)]!;
    raw.set(rolled);
  }
  // Nível do mar pela fração de terra pedida: o quantil vira 128.
  const sorted = Float32Array.from(raw).sort();
  const t = sorted[Math.floor((1 - Math.min(0.6, Math.max(0.15, o.land))) * (sorted.length - 1))]!;
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i]!;
    out[i] =
      v < t
        ? Math.round(((v - lo) / (t - lo || 1)) * 127)
        : Math.min(255, 128 + Math.round(Math.pow((v - t) / (hi - t || 1), 0.9) * 127));
  }
  // Mar na borda de 180° e nas latitudes altas, com profundidade média (sem faixa
  // escura nem clara): terra ali vira mar raso; o mar mantém a profundidade natural.
  for (let y = 0; y < ROWS; y++) {
    const lat = Math.abs(90 - ((y + 0.5) / ROWS) * 180);
    const polar = Math.min(1, Math.max(0, (lat - 58) / 12));
    for (let x = 0; x < COLS; x++) {
      const edge = Math.min(x + 0.5, COLS - x - 0.5);
      const f = Math.max(polar, Math.max(0, 1 - edge / 12));
      if (f <= 0) continue;
      const i = y * COLS + x;
      const v = out[i]!;
      const target = v >= 112 ? 112 : v;
      out[i] = Math.round(v + (target - v) * f);
      if (f >= 1 && out[i]! >= SEA) out[i] = 112;
    }
  }
  return out;
}

export function generateWorld(o: WorldOptions, name = "Mundo"): WorldMap {
  const heights = generateHeights(o);
  const map: WorldMap = { name, options: o, heights, burgs: [], states: [] };
  const d = deriveWorld({ ...map });
  const rand = rng(o.seed ^ 0xabcdef);
  const namer = makeNamer(o.seed);
  // Lugares bons para cidades: terra baixa, perto do mar ou de rio, clima ameno.
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    if (!d.land[i]) continue;
    const e = (heights[i]! - SEA) / 127;
    if (e > 0.6 || d.temp[i]! < 0.12) continue;
    const coast = d.oceanDist[i]! <= 1 ? 0.5 : d.coastDist[i]! <= 1 ? 0.25 : 0;
    const river = d.flux[i]! > d.riverMin ? 0.7 : 0;
    scored.push({ i, s: d.moist[i]! * 0.4 + coast + river - e * 0.8 + rand() * 0.35 });
  }
  scored.sort((a, b) => b.s - a.s);
  const landCells = scored.length || 1;
  const capSpacing = Math.max(14, Math.sqrt(landCells / Math.max(1, o.states)) * 0.75);
  const placed: Burg[] = [];
  const near = (i: number, r: number) =>
    placed.some((b) => Math.hypot(dCol(b.x, i % COLS), b.y - Math.floor(i / COLS)) < r);
  for (const { i } of scored) {
    if (placed.length >= o.states) break;
    if (near(i, capSpacing)) continue;
    placed.push({
      id: newId("c"),
      name: namer(),
      x: (i % COLS) + 0.5,
      y: Math.floor(i / COLS) + 0.5,
    });
  }
  map.states = placed.map((b, k) => ({
    id: newId("e"),
    name: namer(),
    color: stateColor(k),
    capital: b.id,
  }));
  for (const { i } of scored) {
    if (placed.length >= o.burgs) break;
    if (near(i, 6)) continue;
    placed.push({
      id: newId("c"),
      name: namer(),
      x: (i % COLS) + 0.5,
      y: Math.floor(i / COLS) + 0.5,
    });
  }
  map.burgs = placed;
  return map;
}

/* ---------- Derivados: clima, biomas, rios, estados, estradas ---------- */

export const BIOMES = [
  { name: "Mar", color: "#4b7fa8" },
  { name: "Deserto quente", color: "#e2c88f" },
  { name: "Deserto frio", color: "#c4bc98" },
  { name: "Savana", color: "#c9bd74" },
  { name: "Campos", color: "#a8c07a" },
  { name: "Floresta tropical sazonal", color: "#86ae58" },
  { name: "Floresta temperada", color: "#5c9a50" },
  { name: "Floresta tropical", color: "#3e8a3c" },
  { name: "Floresta úmida temperada", color: "#3b7a4b" },
  { name: "Taiga", color: "#4e6c49" },
  { name: "Tundra", color: "#a7a487" },
  { name: "Geleira", color: "#eef3f5" },
  { name: "Pântano", color: "#5d8659" },
  { name: "Montanha", color: "#8f8577" },
] as const;

export interface Derived {
  land: Uint8Array;
  temp: Float32Array;
  moist: Float32Array;
  biome: Uint8Array;
  coastDist: Uint16Array;
  flux: Float32Array;
  down: Int32Array;
  riverMin: number;
  /** Rios: células da nascente à foz (`mouth`: ponto na costa, quando chega à água). */
  rivers: { cells: number[]; width: number; mouth?: [number, number] }[];
  /** Água ligada à borda do mapa (o resto é lago) e distância até ela. */
  ocean: Uint8Array;
  oceanDist: Uint16Array;
  /** Estado de cada célula (índice em `states`) ou -1. */
  owner: Int16Array;
  /** Estradas geradas, por tipo: principal (entre capitais), estrada (cidade → capital), trilha. */
  roads: { cells: number[]; type: RouteType; name: string }[];
  /** Pontes: onde uma estrada cruza um rio (posição em células e direção da estrada). */
  bridges: { x: number; y: number; angle: number; type: RouteType }[];
  /** Caminho das rotas desenhadas (pontos em células), na ordem de `map.routes`. */
  routes: { id: string; points: [number, number][] }[];
}

const N8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/** Fila de prioridade (mínimo) com arrays que crescem, sem alocar a cada troca. */
class Heap {
  private items = new Int32Array(1024);
  private keys = new Float64Array(1024);
  size = 0;
  push(item: number, key: number) {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      items.set(this.items);
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.items = items;
      this.keys = keys;
    }
    const a = this.items;
    const k = this.keys;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      a[i] = a[p]!;
      k[i] = k[p]!;
      i = p;
    }
    a[i] = item;
    k[i] = key;
  }
  /** Tira o menor; a chave dele fica em `lastKey`. */
  lastKey = 0;
  pop(): number {
    const a = this.items;
    const k = this.keys;
    const top = a[0]!;
    this.lastKey = k[0]!;
    const n = --this.size;
    const item = a[n]!;
    const key = k[n]!;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const m = r < n && k[r]! < k[l]! ? r : l;
      if (k[m]! >= key) break;
      a[i] = a[m]!;
      k[i] = k[m]!;
      i = m;
    }
    a[i] = item;
    k[i] = key;
    return top;
  }
}

export function cellOf(x: number, y: number): number {
  const cx = wrapCol(Math.floor(x));
  const cy = Math.max(0, Math.min(ROWS - 1, Math.floor(y)));
  return cy * COLS + cx;
}

export function deriveWorld(map: WorldMap): Derived {
  const n = COLS * ROWS;
  const h = map.heights;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = h[i]! >= SEA ? 1 : 0;

  // Distância até o mar (em células), para umidade e portos.
  const coastDist = new Uint16Array(n).fill(65535);
  const queue: number[] = [];
  for (let i = 0; i < n; i++)
    if (!land[i]) {
      coastDist[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(nx);
      if (coastDist[j]! > coastDist[i]! + 1) {
        coastDist[j] = coastDist[i]! + 1;
        queue.push(j);
      }
    }
  }

  // Oceano: o maior corpo d'água (num planeta, os mares se ligam); o resto é lago.
  const ocean = new Uint8Array(n);
  {
    const comp = new Int32Array(n).fill(-1);
    let best = -1;
    let bestSize = 0;
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (land[s] || comp[s]! >= 0) continue;
      const q = [s];
      comp[s] = id;
      for (let k = 0; k < q.length; k++) {
        const i = q[k]!;
        const x = i % COLS;
        const y = (i / COLS) | 0;
        for (const [dx, dy] of N8) {
          const ny = y + dy;
          if (ny < 0 || ny >= ROWS) continue;
          const j = ny * COLS + wrapCol(x + dx);
          if (!land[j] && comp[j]! < 0) {
            comp[j] = id;
            q.push(j);
          }
        }
      }
      if (q.length > bestSize) {
        bestSize = q.length;
        best = id;
      }
      id++;
    }
    for (let i = 0; i < n; i++) if (comp[i] === best) ocean[i] = 1;
  }
  // Distância até o oceano (portos só na costa do oceano, não em lagos nem rios).
  const oceanDist = new Uint16Array(n).fill(65535);
  const dq: number[] = [];
  for (let i = 0; i < n; i++)
    if (ocean[i]) {
      oceanDist[i] = 0;
      dq.push(i);
    }
  for (let q = 0; q < dq.length; q++) {
    const i = dq[q]!;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(nx);
      if (oceanDist[j]! > oceanDist[i]! + 1) {
        oceanDist[j] = oceanDist[i]! + 1;
        dq.push(j);
      }
    }
  }

  const rand = rng(map.options.seed ^ 0x77);
  const fbm = makeNoise(rand);
  const temp = new Float32Array(n);
  const moist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % COLS;
    const y = (i / COLS) | 0;
    const lat = Math.abs(y / ROWS - 0.5) * 2;
    const e = land[i] ? (h[i]! - SEA) / 127 : 0;
    temp[i] = Math.max(
      0,
      Math.min(1, 1 - Math.pow(lat, 1.3) - e * 0.55 + fbm(x / 40, y / 40, 3) * 0.08),
    );
    const base = fbm(x / 55 + 50, y / 55 + 50, 4) * 0.5 + 0.5;
    moist[i] = Math.max(
      0,
      Math.min(1, base * 0.65 + 0.4 * Math.exp(-coastDist[i]! / 22) - lat * 0.1),
    );
  }

  // Preenche depressões (priority-flood) para a água sempre ter para onde escorrer.
  const filled = new Float32Array(n);
  const done = new Uint8Array(n);
  const heap = new Heap();
  for (let i = 0; i < n; i++) {
    const x = i % COLS;
    const y = (i / COLS) | 0;
    void x;
    if (!land[i] || y === 0 || y === ROWS - 1) {
      filled[i] = h[i]!;
      done[i] = 1;
      if (!land[i]) heap.push(i, h[i]!);
    }
  }
  const down = new Int32Array(n).fill(-1);
  while (heap.size) {
    const i = heap.pop();
    const hi = heap.lastKey;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(nx);
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = Math.max(h[j]!, hi + 0.01);
      down[j] = i;
      heap.push(j, filled[j]!);
    }
  }

  // Vazão: cada célula manda a chuva para baixo, das mais altas para as mais baixas.
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => land[i]);
  order.sort((a, b) => filled[b]! - filled[a]!);
  const flux = new Float32Array(n);
  for (const i of order) {
    flux[i]! += moist[i]! * 0.6 + 0.1;
    const d = down[i]!;
    if (d >= 0 && land[d]) flux[d]! += flux[i]!;
  }
  const landFlux = order.map((i) => flux[i]!).sort((a, b) => b - a);
  const riverMin = Math.max(12, landFlux[Math.floor(landFlux.length * 0.035)] ?? 12);

  // Rios: das nascentes até o mar (ou até encontrar outro rio).
  const isRiver = (i: number) => land[i] && flux[i]! >= riverMin;
  const hasUp = new Uint8Array(n);
  for (const i of order) if (isRiver(i) && down[i]! >= 0) hasUp[down[i]!] = 1;
  const visited = new Uint8Array(n);
  const rivers: Derived["rivers"] = [];
  for (const i of order) {
    if (!isRiver(i) || hasUp[i]) continue;
    const cells = [i];
    let c = i;
    visited[c] = 1;
    let mouth: [number, number] | undefined;
    while (down[c]! >= 0) {
      const d = down[c]!;
      if (!land[d]) {
        // Foz: termina exatamente na linha da costa, sem entrar na água.
        const t = Math.max(0, Math.min(1, (h[c]! - (SEA - 0.5)) / (h[c]! - h[d]! || 1)));
        const cx = (c % COLS) + 0.5;
        const cy = Math.floor(c / COLS) + 0.5;
        const dx = dCol(d % COLS, c % COLS);
        const dy = Math.floor(d / COLS) + 0.5 - cy;
        mouth = [cx + dx * t, cy + dy * t];
        break;
      }
      cells.push(d);
      if (visited[d]) break;
      visited[d] = 1;
      c = d;
    }
    if (cells.length > 3)
      rivers.push({
        cells,
        mouth,
        width: Math.min(3, 0.6 + Math.sqrt(flux[c]! / riverMin) * 0.55),
      });
  }

  // Biomas.
  const biome = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    const t = temp[i]!;
    const m = moist[i]!;
    const e = (h[i]! - SEA) / 127;
    biome[i] =
      e > 0.84
        ? t < 0.35
          ? 11
          : 13
        : t < 0.12
          ? 11
          : t < 0.28
            ? m < 0.3
              ? 10
              : 9
            : m > 0.82 && e < 0.08
              ? 12
              : t < 0.6
                ? m < 0.22
                  ? 2
                  : m < 0.45
                    ? 4
                    : m < 0.7
                      ? 6
                      : 8
                : m < 0.2
                  ? 1
                  : m < 0.38
                    ? 3
                    : m < 0.62
                      ? 5
                      : 7;
  }

  // Estados: cada capital se espalha pela terra, mais devagar em montanhas e desertos.
  const owner = new Int16Array(n).fill(-1);
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const sh = new Heap();
  const burgById = new Map(map.burgs.map((b) => [b.id, b]));
  map.states.forEach((s, k) => {
    const cap = burgById.get(s.capital);
    if (!cap) return;
    const c = cellOf(cap.x, cap.y);
    if (!land[c]) return;
    cost[c] = 0;
    owner[c] = k;
    sh.push(c, 0);
  });
  const terrainCost = [0, 2.2, 1.6, 0.6, 0.2, 0.7, 0.9, 1.4, 1.2, 1.6, 2.2, 6, 2.5, 4];
  const maxCost = Math.max(60, Math.sqrt(order.length / Math.max(1, map.states.length)) * 5);
  while (sh.size) {
    const i = sh.pop();
    const ci = sh.lastKey;
    if (ci > cost[i]!) continue;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(nx);
      if (!land[j]) continue;
      const step =
        stepLen(dx, dy, y) *
        (1 +
          terrainCost[biome[j]!]! +
          Math.max(0, (h[j]! - h[i]!) / 6) +
          (isRiver(j) && !isRiver(i) ? 1.5 : 0));
      const nc = ci + step;
      if (nc < cost[j]! && nc < maxCost) {
        cost[j] = nc;
        owner[j] = owner[i]!;
        prev[j] = i;
        sh.push(j, nc);
      }
    }
  }

  // Estradas, com custo de engenharia: rampa (quadrática, as estradas contornam as
  // encostas), altitude, terreno (pântano, geleira, mata fechada), pontes (cruzar rio
  // custa caro, então a ponte vai onde o rio é mais estreito), vales ao lado dos rios
  // (mais baratos) e estradas já existentes (atraem as novas, formando uma rede).
  const roads: Derived["roads"] = [];
  const bridges: Derived["bridges"] = [];
  const onRoad = new Uint8Array(n);
  const river = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (land[i] && flux[i]! >= riverMin) river[i] = 1;
  const nearRiver = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!river[i]) continue;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const ny = y + dy;
      if (ny >= 0 && ny < ROWS) nearRiver[ny * COLS + wrapCol(x + dx)] = 1;
    }
  }
  // Aspereza fixa por célula (quebra as retas perfeitas da grade).
  const rough = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.sin(i * 12.9898 + map.options.seed * 0.001) * 43758.5453;
    rough[i] = (s - Math.floor(s)) * 0.22;
  }
  const BIOME_ROAD = [0, 0.5, 0.3, 0.1, 0, 0.35, 0.3, 0.7, 0.45, 0.5, 0.6, 5, 1.6, 1.2];
  // 16 direções: as 8 vizinhas e os "pulos de cavalo" (menos retas e diagonais forçadas).
  const DIRS: [number, number][] = [
    ...N8.map(([dx, dy]) => [dx, dy] as [number, number]),
    [1, 2],
    [2, 1],
    [-1, 2],
    [-2, 1],
    [1, -2],
    [2, -1],
    [-1, -2],
    [-2, -1],
  ];
  const roadStep = (i: number, j: number, dx: number, dy: number, y: number) => {
    const len = stepLen(dx, dy, y);
    // Rampa: diferença de altura por distância (em "metros por célula" aproximados).
    const grade = Math.abs(h[j]! - h[i]!) / Math.max(0.35, len);
    const e = Math.max(0, (h[j]! - SEA) / 127);
    let k =
      1 + (grade * 0.28) ** 2 + Math.max(0, e - 0.42) * 6 + BIOME_ROAD[biome[j]!]! + rough[j]!;
    if (nearRiver[j] && !river[j]) k *= 0.85; // vale plano ao lado do rio
    if (onRoad[j]) k *= 0.5; // aproveita a estrada que já existe
    let c = len * k;
    if (river[j] && !river[i]) c += 3 + Math.sqrt(flux[j]! / riverMin) * 2.5; // ponte
    return c;
  };
  // Busca A*/Dijkstra com arrays reaproveitados (um "carimbo" por busca, sem limpar tudo).
  const dist = new Float64Array(n);
  const back = new Int32Array(n);
  const stamp = new Int32Array(n);
  let run = 0;
  const findPath = (
    from: number,
    isGoal: (c: number) => boolean,
    limit: number,
    target?: number,
  ): number[] | null => {
    run++;
    const tx = target === undefined ? 0 : target % COLS;
    const ty = target === undefined ? 0 : (target / COLS) | 0;
    const guess = (c: number) =>
      target === undefined
        ? 0
        : Math.hypot(dCol(c % COLS, tx) * ROW_COS[(c / COLS) | 0]!, ((c / COLS) | 0) - ty) * 0.9;
    const q = new Heap();
    stamp[from] = run;
    dist[from] = 0;
    back[from] = -1;
    q.push(from, guess(from));
    while (q.size) {
      const i = q.pop();
      const di = dist[i]!;
      if (q.lastKey - guess(i) > di + 1e-9) continue;
      if (isGoal(i)) {
        const path = [i];
        let c = i;
        while (back[c]! >= 0) {
          c = back[c]!;
          path.push(c);
        }
        return path.reverse();
      }
      if (di > limit) break;
      const x = i % COLS;
      const y = (i / COLS) | 0;
      for (const [dx, dy] of DIRS) {
        const ny = y + dy;
        if (ny < 0 || ny >= ROWS) continue;
        const j = ny * COLS + wrapCol(x + dx);
        if (!land[j]) continue;
        // Pulo de cavalo só se as células do meio também forem terra.
        if (Math.abs(dx) + Math.abs(dy) === 3) {
          const mx = x + Math.sign(dx) * (Math.abs(dx) === 2 ? 1 : 0);
          const my = y + Math.sign(dy) * (Math.abs(dy) === 2 ? 1 : 0);
          if (!land[my * COLS + wrapCol(mx)]) continue;
        }
        const nd = di + roadStep(i, j, dx, dy, y);
        if (stamp[j] !== run || nd < dist[j]!) {
          stamp[j] = run;
          dist[j] = nd;
          back[j] = i;
          q.push(j, nd + guess(j));
        }
      }
    }
    return null;
  };
  /** Completa os pulos de cavalo com a célula do meio (o caminho fica contínuo). */
  const fill = (path: number[]) => {
    const out: number[] = [];
    for (let k = 0; k < path.length; k++) {
      const c = path[k]!;
      if (k) {
        const p = path[k - 1]!;
        const dx = dCol(c % COLS, p % COLS);
        const dy = ((c / COLS) | 0) - ((p / COLS) | 0);
        if (Math.abs(dx) + Math.abs(dy) === 3) {
          const mx = (p % COLS) + Math.sign(dx) * (Math.abs(dx) === 2 ? 1 : 0);
          const my = ((p / COLS) | 0) + Math.sign(dy) * (Math.abs(dy) === 2 ? 1 : 0);
          out.push(my * COLS + wrapCol(mx));
        }
      }
      out.push(c);
    }
    return out;
  };
  const addRoad = (cells: number[], type: RouteType, name: string) => {
    const full = fill(cells);
    for (const c of full) onRoad[c] = Math.max(onRoad[c]!, type === "principal" ? 2 : 1);
    roads.push({ cells: full, type, name });
    for (let k = 1; k < full.length; k++) {
      const c = full[k]!;
      if (!river[c] || river[full[k - 1]!]) continue;
      const nx = full[Math.min(full.length - 1, k + 1)]!;
      const pv = full[k - 1]!;
      bridges.push({
        x: (c % COLS) + 0.5,
        y: Math.floor(c / COLS) + 0.5,
        angle: Math.atan2(((nx / COLS) | 0) - ((pv / COLS) | 0), dCol(nx % COLS, pv % COLS)),
        type,
      });
    }
  };

  const byId = new Map(map.burgs.map((b) => [b.id, b]));
  const capitalIds = new Set(map.states.map((s) => s.capital));
  // Rodovias entre capitais de estados vizinhos (os pares vêm da fronteira).
  const pairs = new Set<string>();
  for (let i = 0; i < n; i++) {
    const a = owner[i]!;
    if (a < 0) continue;
    const x = i % COLS;
    for (const j of [x === COLS - 1 ? i - (COLS - 1) : i + 1, i + COLS]) {
      if (j >= n) continue;
      const b = owner[j]!;
      if (b < 0 || a === b) continue;
      pairs.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
  }
  for (const key of pairs) {
    const [a, b] = key.split("-").map(Number) as [number, number];
    const ca = byId.get(map.states[a]!.capital);
    const cb = byId.get(map.states[b]!.capital);
    if (!ca || !cb) continue;
    const from = cellOf(ca.x, ca.y);
    const to = cellOf(cb.x, cb.y);
    const path = findPath(from, (c) => c === to, 4000, to);
    if (path) addRoad(path, "principal", `Rodovia ${ca.name}–${cb.name}`);
  }
  // Estradas: de cada cidade até a capital do seu estado (pela rede que já existe).
  for (const b of map.burgs) {
    if (capitalIds.has(b.id)) continue;
    const c = cellOf(b.x, b.y);
    const k = owner[c]!;
    if (k < 0) continue;
    const cap = byId.get(map.states[k]!.capital);
    if (!cap) continue;
    const to = cellOf(cap.x, cap.y);
    const path = findPath(c, (x) => x === to || onRoad[x] === 2, 3000, to);
    if (path && path.length > 1) addRoad(path, "estrada", `Estrada de ${b.name}`);
  }
  // Trilhas: de cada povoado ao vizinho mais perto, se o caminho for novo.
  const burgCells = new Map(map.burgs.map((b) => [cellOf(b.x, b.y), b]));
  const seen = new Set<string>();
  for (const b of map.burgs) {
    const from = cellOf(b.x, b.y);
    if (!land[from]) continue;
    const path = findPath(from, (c) => c !== from && burgCells.has(c), 45);
    if (!path) continue;
    const other = burgCells.get(path[path.length - 1]!)!;
    const key = [b.id, other.id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const fresh = path.filter((c) => !onRoad[c]).length;
    if (fresh / path.length < 0.6) continue;
    addRoad(path, "trilha", `Trilha ${b.name}–${other.name}`);
  }

  // Rotas desenhadas: entre pontos de passagem seguem o terreno (as marítimas vão retas).
  const routes: Derived["routes"] = (map.routes ?? []).map((r) => {
    if (r.type === "maritima" || r.points.length < 2) return { id: r.id, points: r.points };
    const pts: [number, number][] = [r.points[0]!];
    for (let k = 1; k < r.points.length; k++) {
      const a = cellOf(...r.points[k - 1]!);
      const b = cellOf(...r.points[k]!);
      const path = land[a] && land[b] ? findPath(a, (c) => c === b, 6000, b) : null;
      if (path)
        for (const c of fill(path).slice(1, -1))
          pts.push([(c % COLS) + 0.5, Math.floor(c / COLS) + 0.5]);
      pts.push(r.points[k]!);
    }
    return { id: r.id, points: pts };
  });

  return {
    land,
    temp,
    moist,
    biome,
    coastDist,
    ocean,
    oceanDist,
    flux,
    down,
    riverMin,
    rivers,
    owner,
    roads,
    bridges,
    routes,
  };
}

/* ---------- Gravação ---------- */

export const WORLD_MAP_FILE = ".talia/mapa-mundi.json";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serializeWorld(map: WorldMap): string {
  return (
    JSON.stringify(
      {
        format: 1,
        name: map.name,
        cols: COLS,
        rows: ROWS,
        options: map.options,
        heights: toBase64(map.heights),
        states: map.states,
        burgs: map.burgs,
        routes: map.routes ?? [],
      },
      null,
      1,
    ) + "\n"
  );
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lê o arquivo gravado; qualquer coisa fora do formato é descartada (null = sem mapa). */
/** Reamostra (bilinear) uma grade de alturas para COLS × ROWS. */
function resample(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const fx = Math.min(w - 1.001, ((x + 0.5) * w) / COLS - 0.5);
      const fy = Math.min(h - 1.001, ((y + 0.5) * h) / ROWS - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const y0 = Math.max(0, Math.floor(fy));
      const tx = Math.max(0, fx - x0);
      const ty = Math.max(0, fy - y0);
      const i = y0 * w + x0;
      const a = src[i]!;
      const b = src[i + 1]!;
      const c = src[i + w]!;
      const dd = src[i + w + 1]!;
      out[y * COLS + x] = Math.round((a + (b - a) * tx) * (1 - ty) + (c + (dd - c) * tx) * ty);
    }
  return out;
}

export function parseWorld(raw: string): WorldMap | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.format !== 1 || typeof d.heights !== "string") return null;
    // Mapas antigos (só uma região, 320×200) são esticados para o planeta (360×180).
    const old = d.cols === OLD_COLS && d.rows === OLD_ROWS;
    if (!old && (d.cols !== COLS || d.rows !== ROWS)) return null;
    const stored = fromBase64(d.heights);
    if (stored.length !== (old ? OLD_COLS * OLD_ROWS : COLS * ROWS)) return null;
    const heights = old ? resample(stored, OLD_COLS, OLD_ROWS) : stored;
    const sx = old ? COLS / OLD_COLS : 1;
    const sy = old ? ROWS / OLD_ROWS : 1;
    const o = (d.options ?? {}) as Record<string, unknown>;
    const options: WorldOptions = {
      seed: (num(o.seed) ?? 1) >>> 0,
      template: TEMPLATES.some((t) => t.value === o.template)
        ? (o.template as Template)
        : "continentes",
      land: Math.min(0.6, Math.max(0.15, num(o.land) ?? DEFAULT_OPTIONS.land)),
      states: Math.min(30, Math.max(1, Math.round(num(o.states) ?? DEFAULT_OPTIONS.states))),
      burgs: Math.min(300, Math.max(1, Math.round(num(o.burgs) ?? DEFAULT_OPTIONS.burgs))),
    };
    const burgs: Burg[] = [];
    for (const b of Array.isArray(d.burgs)
      ? (d.burgs as Record<string, unknown>[]).slice(0, 500)
      : []) {
      const bx = num(b.x);
      const by = num(b.y);
      const x = bx === null ? null : bx * sx;
      const y = by === null ? null : by * sy;
      const id = str(b.id, 64);
      if (!id || x === null || y === null || x < 0 || y < 0 || x > COLS || y > ROWS) continue;
      const burg: Burg = { id, name: str(b.name, 80) || "Cidade", x, y };
      if (typeof b.noteId === "string" && b.noteId) burg.noteId = b.noteId.slice(0, 64);
      burgs.push(burg);
    }
    const ids = new Set(burgs.map((b) => b.id));
    const states: WorldState[] = [];
    for (const s of Array.isArray(d.states)
      ? (d.states as Record<string, unknown>[]).slice(0, 60)
      : []) {
      const id = str(s.id, 64);
      const capital = str(s.capital, 64);
      const color = /^#[0-9a-f]{6}$/i.test(str(s.color, 7))
        ? str(s.color, 7)
        : stateColor(states.length);
      if (!id || !ids.has(capital) || states.some((x) => x.capital === capital)) continue;
      const state: WorldState = { id, name: str(s.name, 80) || "Reino", color, capital };
      if (typeof s.noteId === "string" && s.noteId) state.noteId = s.noteId.slice(0, 64);
      states.push(state);
    }
    const routes: Route[] = [];
    for (const r of Array.isArray(d.routes)
      ? (d.routes as Record<string, unknown>[]).slice(0, 500)
      : []) {
      const id = str(r.id, 64);
      const type = ROUTE_TYPES.some((x) => x.value === r.type) ? (r.type as RouteType) : "estrada";
      const points = (Array.isArray(r.points) ? (r.points as unknown[]) : [])
        .slice(0, 200)
        .filter(
          (p): p is [number, number] =>
            Array.isArray(p) &&
            typeof p[0] === "number" &&
            typeof p[1] === "number" &&
            p[0] >= 0 &&
            p[1] >= 0 &&
            p[0] * sx <= COLS &&
            p[1] * sy <= ROWS,
        )
        .map((p) => [p[0] * sx, p[1] * sy] as [number, number]);
      if (!id || points.length < 2) continue;
      routes.push({ id, name: str(r.name, 80) || "Rota", type, points });
    }
    return { name: str(d.name, 80) || "Mundo", options, heights, burgs, states, routes };
  } catch {
    return null;
  }
}
