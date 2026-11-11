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

export const COLS = 320;
export const ROWS = 200;
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

export interface WorldMap {
  name: string;
  options: WorldOptions;
  heights: Uint8Array;
  burgs: Burg[];
  states: WorldState[];
}

export const DEFAULT_OPTIONS: Omit<WorldOptions, "seed"> = {
  template: "continentes",
  land: 0.34,
  states: 7,
  burgs: 50,
};

/* ---------- Ruído ---------- */

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
  const fbm = makeNoise(rand);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const aspect = COLS / ROWS;
  const blobs: { x: number; y: number; r: number }[] = [];
  const add = (n: number, r0: number, r1: number) => {
    for (let i = 0; i < n; i++)
      blobs.push({ x: between(0.15, 0.85) * aspect, y: between(0.2, 0.8), r: between(r0, r1) });
  };
  if (o.template === "pangeia") {
    blobs.push({ x: aspect / 2 + between(-0.1, 0.1), y: 0.5, r: between(0.42, 0.5) });
    add(2, 0.1, 0.18);
  } else if (o.template === "ilhas") add(14 + Math.floor(rand() * 8), 0.05, 0.12);
  else add(3 + Math.floor(rand() * 3), 0.18, 0.3);

  const raw = new Float32Array(COLS * ROWS);
  const ox = rand() * 100;
  const oy = rand() * 100;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const nx = (x / COLS) * aspect;
      const ny = y / ROWS;
      let mask = 0;
      for (const b of blobs) {
        const d = Math.hypot(nx - b.x, ny - b.y) / b.r;
        mask = Math.max(mask, 1 - d);
      }
      // Bordas do mapa viram mar.
      const edge = Math.min(nx, aspect - nx, ny, 1 - ny) / 0.12;
      const fall = Math.min(1, Math.max(0, edge));
      const n = fbm(nx * 3.2 + ox, ny * 3.2 + oy);
      const ridge = 1 - Math.abs(fbm(nx * 5 + oy, ny * 5 + ox, 4));
      raw[y * COLS + x] =
        (mask * 0.55 + n * 0.5 + ridge * ridge * 0.12) * (0.35 + 0.65 * fall) - (1 - fall) * 0.4;
    }
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
    placed.some((b) => Math.hypot(b.x - (i % COLS), b.y - Math.floor(i / COLS)) < r);
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
  { name: "Deserto quente", color: "#f1dc9a" },
  { name: "Deserto frio", color: "#b9b98c" },
  { name: "Savana", color: "#d2cf82" },
  { name: "Campos", color: "#c5d48d" },
  { name: "Floresta tropical sazonal", color: "#a9cf5f" },
  { name: "Floresta temperada", color: "#5fae5c" },
  { name: "Floresta tropical", color: "#6fbd3e" },
  { name: "Floresta úmida temperada", color: "#3f9147" },
  { name: "Taiga", color: "#4f6e3a" },
  { name: "Tundra", color: "#a08a63" },
  { name: "Geleira", color: "#e2eef0" },
  { name: "Pântano", color: "#3f8f5a" },
  { name: "Montanha", color: "#9a8f80" },
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
  roads: number[][];
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
  const cx = Math.max(0, Math.min(COLS - 1, Math.floor(x)));
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
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (coastDist[j]! > coastDist[i]! + 1) {
        coastDist[j] = coastDist[i]! + 1;
        queue.push(j);
      }
    }
  }

  // Oceano: a água ligada à borda do mapa. O resto da água é lago.
  const ocean = new Uint8Array(n);
  const oq: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % COLS;
    const y = (i / COLS) | 0;
    if (!land[i] && (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)) {
      ocean[i] = 1;
      oq.push(i);
    }
  }
  for (let q = 0; q < oq.length; q++) {
    const i = oq[q]!;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!land[j] && !ocean[j]) {
        ocean[j] = 1;
        oq.push(j);
      }
    }
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
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
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
    if (!land[i] || x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) {
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
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
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
        const dx = (d % COLS) + 0.5 - cx;
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
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (!land[j]) continue;
      const step =
        (dx && dy ? 1.414 : 1) *
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

  // Estradas: de cada cidade até a capital do seu estado, e entre capitais vizinhas.
  const roads: number[][] = [];
  const trace = (from: number) => {
    const path: number[] = [];
    let c = from;
    while (c >= 0 && path.length < 2000) {
      path.push(c);
      c = prev[c]!;
    }
    return path;
  };
  for (const b of map.burgs) {
    if (map.states.some((s) => s.capital === b.id)) continue;
    const c = cellOf(b.x, b.y);
    if (owner[c]! >= 0 && prev[c]! >= 0) roads.push(trace(c));
  }
  const best = new Map<string, [number, number, number]>();
  for (let i = 0; i < n; i++) {
    if (owner[i]! < 0) continue;
    const x = i % COLS;
    for (const j of [i + 1, i + COLS]) {
      if (j >= n || (j === i + 1 && x === COLS - 1)) continue;
      const a = owner[i]!;
      const b = owner[j]!;
      if (b < 0 || a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const c = cost[i]! + cost[j]!;
      const cur = best.get(key);
      if (!cur || c < cur[0]) best.set(key, [c, i, j]);
    }
  }
  for (const [, i, j] of best.values()) roads.push([...trace(i).reverse(), ...trace(j)]);

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
      },
      null,
      1,
    ) + "\n"
  );
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lê o arquivo gravado; qualquer coisa fora do formato é descartada (null = sem mapa). */
export function parseWorld(raw: string): WorldMap | null {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.format !== 1 || d.cols !== COLS || d.rows !== ROWS || typeof d.heights !== "string")
      return null;
    const heights = fromBase64(d.heights);
    if (heights.length !== COLS * ROWS) return null;
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
      const x = num(b.x);
      const y = num(b.y);
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
    return { name: str(d.name, 80) || "Mundo", options, heights, burgs, states };
  } catch {
    return null;
  }
}
