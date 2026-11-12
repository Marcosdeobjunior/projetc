import { rng } from "./geom";
import { makeMarkovNamer, NAME_BASES } from "./names";

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
  /** Época do mundo: muda nomes, governos, marcadores e o estilo do mapa. */
  era?: Era;
}

export type Era = "fantasia" | "atual" | "futurista";
export const ERAS: { value: Era; label: string; hint: string }[] = [
  { value: "fantasia", label: "Fantasia", hint: "Reinos, castelos, trilhas e ruínas antigas" },
  { value: "atual", label: "Atual", hint: "Países, rodovias, aeroportos e metrópoles" },
  { value: "futurista", label: "Futurista", hint: "Megacidades, linhas maglev e espaçoportos" },
];
export const eraOf = (map: { options: WorldOptions }): Era => map.options.era ?? "fantasia";

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
  /** Forma de governo (Reino, Império, República…). */
  form?: StateForm;
}

export const STATE_FORMS = [
  "Reino",
  "Império",
  "Principado",
  "Ducado",
  "República",
  "Teocracia",
  "Canato",
  "Liga",
  "Federação",
  "União",
  "Estado",
  "Corporação",
  "Consórcio",
  "Diretório",
  "Colônia",
  "Hegemonia",
] as const;
export type StateForm = (typeof STATE_FORMS)[number];

/** Tipo de governo, que cada época escreve do seu jeito. */
type Archetype = "monarquia" | "imperio" | "menor" | "republica" | "teocracia" | "tribal" | "liga";
const ERA_FORMS: Record<Era, Record<Archetype, StateForm>> = {
  fantasia: {
    monarquia: "Reino",
    imperio: "Império",
    menor: "Principado",
    republica: "República",
    teocracia: "Teocracia",
    tribal: "Canato",
    liga: "Liga",
  },
  atual: {
    monarquia: "Reino",
    imperio: "Federação",
    menor: "Estado",
    republica: "República",
    teocracia: "Teocracia",
    tribal: "República",
    liga: "União",
  },
  futurista: {
    monarquia: "Diretório",
    imperio: "Hegemonia",
    menor: "Colônia",
    republica: "Federação",
    teocracia: "Teocracia",
    tribal: "Consórcio",
    liga: "Corporação",
  },
};
const ARCHETYPE: Record<StateForm, Archetype> = {
  Reino: "monarquia",
  Império: "imperio",
  Principado: "menor",
  Ducado: "menor",
  República: "republica",
  Teocracia: "teocracia",
  Canato: "tribal",
  Liga: "liga",
  Federação: "imperio",
  União: "liga",
  Estado: "menor",
  Corporação: "liga",
  Consórcio: "tribal",
  Diretório: "monarquia",
  Colônia: "menor",
  Hegemonia: "imperio",
};
/** Formas de governo oferecidas em cada época. */
export const FORMS_BY_ERA: Record<Era, StateForm[]> = {
  fantasia: [
    "Reino",
    "Império",
    "Principado",
    "Ducado",
    "República",
    "Teocracia",
    "Canato",
    "Liga",
  ],
  atual: ["República", "Federação", "Reino", "Estado", "União", "Teocracia"],
  futurista: [
    "Federação",
    "Hegemonia",
    "Corporação",
    "Consórcio",
    "Diretório",
    "Colônia",
    "Teocracia",
  ],
};
/** A forma equivalente noutra época (um Império vira Federação, depois Hegemonia…). */
export function formForEra(form: StateForm | undefined, era: Era): StateForm {
  const f = form ?? "Reino";
  if (FORMS_BY_ERA[era].includes(f)) return f;
  return ERA_FORMS[era][ARCHETYPE[f]];
}
/** Troca a época do mapa, convertendo as formas de governo. */
export function withEra(map: WorldMap, era: Era): WorldMap {
  return {
    ...map,
    options: { ...map.options, era },
    states: map.states.map((s) => ({ ...s, form: formForEra(s.form, era) })),
  };
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

/** Tipos de cultura (como cada povo ocupa o terreno). */
export type CultureType =
  "navegante" | "montanhes" | "ribeirinho" | "lacustre" | "nomade" | "cacador" | "generico";

export const CULTURE_TYPES: Record<CultureType, string> = {
  navegante: "Navegante",
  montanhes: "Montanhês",
  ribeirinho: "Ribeirinho",
  lacustre: "Lacustre",
  nomade: "Nômade",
  cacador: "Caçador",
  generico: "Genérico",
};

/** Um povo: nome, base de nomes (o "sotaque" dos lugares), tipo, cor e centro. */
export interface Culture {
  id: string;
  name: string;
  base: string;
  type: CultureType;
  color: string;
  x: number;
  y: number;
}

export interface WorldMap {
  name: string;
  options: WorldOptions;
  heights: Uint8Array;
  burgs: Burg[];
  states: WorldState[];
  /** Rotas desenhadas (as estradas geradas não ficam aqui: são calculadas). */
  routes?: Route[];
  /** Culturas (povos); o território de cada uma é calculado a partir do centro. */
  cultures?: Culture[];
  /** Clima do planeta ("Configurar mundo"); sem ele, o clima da Terra. */
  climate?: WorldClimate;
}

/**
 * Clima do planeta: temperatura média ao nível do mar no equador e em cada polo
 * (°C), chuva em % do normal, e a direção do vento em cada faixa de 30° de
 * latitude (graus da bússola para onde ele sopra: 0 = norte, 90 = leste…), do
 * norte (90°–60°N) ao sul (60°–90°S).
 */
export interface WorldClimate {
  equator: number;
  northPole: number;
  southPole: number;
  precipitation: number;
  winds: number[];
}

/** Ventos da Terra: alísios (de nordeste/sudeste), ventos de oeste e polares de leste. */
export const EARTH_WINDS = [225, 45, 225, 315, 135, 315];
export const DEFAULT_CLIMATE: WorldClimate = {
  equator: 28,
  northPole: -17,
  southPole: -17,
  precipitation: 100,
  winds: EARTH_WINDS,
};

export const CLIMATE_PRESETS: { label: string; hint: string; climate: WorldClimate }[] = [
  { label: "Terra", hint: "Como o nosso planeta", climate: DEFAULT_CLIMATE },
  {
    label: "Era do gelo",
    hint: "Polos e serras gelados, desertos frios",
    climate: { ...DEFAULT_CLIMATE, equator: 20, northPole: -40, southPole: -45, precipitation: 80 },
  },
  {
    label: "Estufa",
    hint: "Quente e úmido até perto dos polos",
    climate: { ...DEFAULT_CLIMATE, equator: 34, northPole: 6, southPole: 4, precipitation: 130 },
  },
  {
    label: "Árido",
    hint: "Pouca chuva: desertos e estepes",
    climate: { ...DEFAULT_CLIMATE, precipitation: 45 },
  },
  {
    label: "Úmido",
    hint: "Muita chuva: florestas e pântanos",
    climate: { ...DEFAULT_CLIMATE, precipitation: 160 },
  },
];

/** Clima válido (limita os números e completa o que faltar). */
export function normalizeClimate(c: Partial<WorldClimate> | undefined | null): WorldClimate {
  const clamp = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const winds = Array.isArray(c?.winds) ? c.winds : [];
  return {
    equator: clamp(c?.equator, -20, 50, DEFAULT_CLIMATE.equator),
    northPole: clamp(c?.northPole, -60, 30, DEFAULT_CLIMATE.northPole),
    southPole: clamp(c?.southPole, -60, 30, DEFAULT_CLIMATE.southPole),
    precipitation: clamp(c?.precipitation, 0, 500, DEFAULT_CLIMATE.precipitation),
    winds: EARTH_WINDS.map((w, k) => {
      const v = winds[k];
      return typeof v === "number" && Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : w;
    }),
  };
}

/** Temperatura média ao nível do mar numa latitude (graus, + = norte). */
export function seaLevelTemp(c: WorldClimate, lat: number): number {
  const pole = lat >= 0 ? c.northPole : c.southPole;
  return pole + (c.equator - pole) * (1 - Math.pow(Math.min(90, Math.abs(lat)) / 90, 1.6));
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
export const stepLen = (dx: number, dy: number, y: number) => Math.hypot(dx * ROW_COS[y]!, dy);

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

const CULTURE_COLORS = [
  "#d98c6a",
  "#7fb0d6",
  "#b7c46a",
  "#c08ac9",
  "#e3c25a",
  "#6dbfa5",
  "#d9768f",
  "#9a9ad6",
  "#c9a27a",
  "#8cc47a",
  "#d6a0c2",
  "#7ac0c9",
];

/**
 * Culturas: centros em lugares bons e afastados; o tipo vem do lugar (costa,
 * serra, rio, lago, deserto ou campo, mata) e a base de nomes vem do clima.
 */
function placeCultures(o: WorldOptions, d: Derived, heights: Uint8Array): Culture[] {
  const rand = rng(o.seed ^ 0x5eed);
  const n = COLS * ROWS;
  const cand: { i: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (!d.land[i] || d.biome[i] === 11 || d.biome[i] === 13) continue;
    // Centros de povos: clima bom, mas também no interior (não só na costa).
    const inland = Math.min(1, d.oceanDist[i]! / 8);
    cand.push({ i, s: d.moist[i]! * 0.4 + d.temp[i]! * 0.4 + inland * 0.4 + rand() * 0.6 });
  }
  cand.sort((a, b) => b.s - a.s);
  const count = Math.max(4, Math.min(12, o.states + 3));
  const spacing = Math.max(18, Math.sqrt(cand.length / count) * 1.1);
  const centers: number[] = [];
  for (const { i } of cand) {
    if (centers.length >= count) break;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    if (centers.some((c) => Math.hypot(dCol(c % COLS, x), ((c / COLS) | 0) - y) < spacing))
      continue;
    centers.push(i);
  }
  const usedBases = new Map<string, number>();
  const pickBase = (options: string[]) => {
    const sorted = [...options].sort((a, b) => (usedBases.get(a) ?? 0) - (usedBases.get(b) ?? 0));
    const best = sorted.filter((b) => (usedBases.get(b) ?? 0) === (usedBases.get(sorted[0]!) ?? 0));
    const base = best[Math.floor(rand() * best.length)]!;
    usedBases.set(base, (usedBases.get(base) ?? 0) + 1);
    return base;
  };
  return centers.map((i, k) => {
    const b = d.biome[i]!;
    const tc = d.tempC[i]!;
    const type: CultureType =
      d.oceanDist[i]! <= 1 && rand() < 0.45
        ? "navegante"
        : d.coastDist[i]! <= 1 && !d.ocean[i]
          ? "lacustre"
          : (heights[i]! - SEA) / 127 > 0.42
            ? "montanhes"
            : d.flux[i]! >= d.riverMin * 2
              ? "ribeirinho"
              : [1, 2, 3, 4].includes(b)
                ? "nomade"
                : [5, 6, 7, 8, 9].includes(b) && d.oceanDist[i]! > 2
                  ? "cacador"
                  : "generico";
    const base =
      [1, 3].includes(b) || (tc >= 20 && d.moist[i]! < 0.35)
        ? pickBase(["desertica"])
        : tc < 6
          ? pickBase(["nordica", "eslava"])
          : [7, 8].includes(b)
            ? pickBase(["elfica", "celta"])
            : pickBase(["lusitana", "latina", "celta", "eslava"]);
    const namer = makeMarkovNamer(base, o.seed + k * 104729);
    return {
      id: newId("p"),
      name: namer(),
      base,
      type,
      color: CULTURE_COLORS[k % CULTURE_COLORS.length]!,
      x: (i % COLS) + 0.5,
      y: Math.floor(i / COLS) + 0.5,
    };
  });
}

export function generateWorld(o: WorldOptions, name = "Mundo", climate?: WorldClimate): WorldMap {
  const heights = generateHeights(o);
  const map: WorldMap = {
    name,
    options: o,
    heights,
    burgs: [],
    states: [],
    ...(climate ? { climate } : {}),
  };
  const d0 = deriveWorld({ ...map });
  map.cultures = placeCultures(o, d0, heights);
  const d = deriveWorld({ ...map });
  const rand = rng(o.seed ^ 0xabcdef);
  // Nomes no "sotaque" da cultura do lugar (cadeia de Markov da base de nomes dela).
  const used = new Set<string>();
  const namers = new Map(
    map.cultures.map((c, k) => [k, makeMarkovNamer(c.base, o.seed + k * 7919, used)]),
  );
  const fallback = makeNamer(o.seed);
  const nameAt = (i: number) => namers.get(d.culture[i]!)?.() ?? fallback();
  // Lugares bons para cidades (como num mundo real): bioma habitável, clima ameno,
  // terreno plano, água por perto — rio (mais ainda num encontro de rios), lago ou
  // mar. A costa ajuda, mas não domina: o interior também recebe cidades.
  const HABITABLE = [0, 0.35, 0.25, 0.75, 1, 0.85, 1, 0.7, 0.8, 0.45, 0.2, 0, 0.3, 0.15, 1, 1];
  const scored: { i: number; s: number; inland: boolean }[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    if (!d.land[i]) continue;
    const e = (heights[i]! - SEA) / 127;
    if (e > 0.62 || d.temp[i]! < 0.12) continue;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    // Declive local (terreno plano é melhor para cidade).
    let slope = 0;
    for (const [dx, dy] of N8) {
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      slope = Math.max(slope, Math.abs(heights[ny * COLS + wrapCol(x + dx)]! - heights[i]!));
    }
    const flux = d.flux[i]! / d.riverMin;
    const river = flux >= 1 ? 0.35 + Math.min(0.45, Math.sqrt(flux) * 0.12) : 0;
    const coast = d.oceanDist[i]! <= 1 ? 0.3 : d.coastDist[i]! <= 1 ? 0.25 : 0;
    const climate = 1 - Math.abs(d.temp[i]! - 0.62) * 1.4;
    scored.push({
      i,
      s:
        HABITABLE[d.biome[i]!]! * 0.8 +
        climate * 0.4 +
        river +
        coast -
        slope / 40 -
        e * 0.6 +
        rand() * 0.3,
      inland: d.oceanDist[i]! > 3,
    });
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
      name: nameAt(i),
      x: (i % COLS) + 0.5,
      y: Math.floor(i / COLS) + 0.5,
    });
  }
  map.states = placed.map((b, k) => ({
    id: newId("e"),
    name: nameAt(cellOf(b.x, b.y)),
    color: stateColor(k),
    capital: b.id,
  }));
  // Demais cidades: pelo menos metade no interior (longe do mar), o resto onde for melhor.
  const spacing = Math.max(4, Math.min(8, Math.sqrt(landCells / Math.max(1, o.burgs)) * 0.6));
  const place = (pool: typeof scored, until: number) => {
    for (const { i } of pool) {
      if (placed.length >= until) break;
      if (near(i, spacing)) continue;
      placed.push({
        id: newId("c"),
        name: nameAt(i),
        x: (i % COLS) + 0.5,
        y: Math.floor(i / COLS) + 0.5,
      });
    }
  };
  const towns = o.burgs - placed.length;
  place(
    scored.filter((c) => c.inland),
    placed.length + Math.ceil(towns * 0.5),
  );
  place(scored, o.burgs);
  map.burgs = placed;
  // Forma de governo pelo tamanho do território e pelo povo da capital.
  const dd = deriveWorld(map);
  const areas = map.states.map((_, k) => dd.owner.reduce((a, v) => a + (v === k ? 1 : 0), 0));
  const sortedAreas = [...areas].sort((a, b) => a - b);
  const median = sortedAreas[Math.floor(sortedAreas.length / 2)] ?? 1;
  map.states.forEach((s, k) => {
    const cap = placed.find((b) => b.id === s.capital)!;
    const cult = map.cultures?.[dd.culture[cellOf(cap.x, cap.y)]!];
    const area = areas[k]!;
    const roll = rand();
    s.form =
      cult?.type === "nomade" && roll < 0.6
        ? "Canato"
        : area > median * 1.8 && roll < 0.7
          ? "Império"
          : roll < 0.08
            ? "Teocracia"
            : roll < 0.2
              ? "República"
              : cult?.type === "navegante" && roll < 0.3
                ? "Liga"
                : area < median * 0.45
                  ? roll < 0.6
                    ? "Principado"
                    : "Ducado"
                  : "Reino";
    s.form = formForEra(s.form, o.era ?? "fantasia");
  });
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
  { name: "Área urbana", color: "#a6a39d" },
  { name: "Lavouras", color: "#d9cf7a" },
] as const;

export interface Derived {
  land: Uint8Array;
  /** Temperatura normalizada (0 = −14 °C ou menos, 1 = 28 °C ou mais) e em °C. */
  temp: Float32Array;
  tempC: Float32Array;
  /** Umidade (chuva trazida pelos ventos), de 0 a 1. */
  moist: Float32Array;
  /** Ruído suave (para detalhes como placas de gelo). */
  noise: Float32Array;
  biome: Uint8Array;
  coastDist: Uint16Array;
  flux: Float32Array;
  down: Int32Array;
  riverMin: number;
  /** Rios: células da nascente à foz (`mouth`: ponto na costa, quando chega à água). */
  rivers: {
    cells: number[];
    width: number;
    mouth?: [number, number];
    source?: [number, number];
  }[];
  /** Lagos: células, se é salgado (sem saída), profundidade e a célula de saída. */
  lakes: { cells: number[]; salty: boolean; depth: number; outlet: number; name: string }[];
  /** Época do mapa. */
  era: Era;
  /** Lago de cada célula (índice em `lakes`) ou −1. */
  lake: Int16Array;
  /** Alturas para desenhar (lagos como água). */
  eff: Uint8Array;
  /** Água ligada à borda do mapa (o resto é lago) e distância até ela. */
  ocean: Uint8Array;
  oceanDist: Uint16Array;
  /** Estado de cada célula (índice em `states`) ou -1. */
  owner: Int16Array;
  /** Cultura de cada célula (índice em `cultures`) ou −1. */
  culture: Int16Array;
  /** Estradas geradas, por tipo: principal (entre capitais), estrada (cidade → capital), trilha. */
  roads: { cells: number[]; type: RouteType; name: string }[];
  /** Pontes: onde uma estrada cruza um rio (posição em células e direção da estrada). */
  bridges: { x: number; y: number; angle: number; type: RouteType }[];
  /** Caminho das rotas desenhadas (pontos em células), na ordem de `map.routes`. */
  routes: { id: string; points: [number, number][] }[];
}

export const N8 = [
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
export class Heap {
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

/*
 * Clima. Temperatura: quente e quase constante nos trópicos, caindo até os
 * polos, e −6,5 °C por quilômetro de altitude. Chuva: os ventos predominantes
 * de cada faixa de latitude (alísios de leste até 30°, ventos de oeste até 60°,
 * ventos polares de leste depois) carregam a umidade do oceano; sobre a terra
 * chove, mais ainda ao subir encostas, e do outro lado da serra o ar chega seco
 * (sombra de chuva). As faixas de latitude chovem diferente (muita chuva no
 * equador e por volta de 55°, pouca nos desertos subtropicais e nos polos).
 */
const RAIN_BY_LAT = [4, 2, 2, 2, 1, 1, 1.2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];

function climate(map: WorldMap, land: Uint8Array, fbm: ReturnType<typeof makeNoise>) {
  const n = COLS * ROWS;
  const h = map.heights;
  const cfg = normalizeClimate(map.climate);
  const era = eraOf(map);
  const temp = new Float32Array(n);
  const tempC = new Float32Array(n);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % COLS;
    const y = (i / COLS) | 0;
    // Média anual ao nível do mar (na Terra: ~28 °C no equador, ~16 °C a 40°,
    // ~7 °C a 55°, −17 °C no polo), com os valores escolhidos em "Configurar mundo".
    const sea = seaLevelTemp(cfg, 90 - ((y + 0.5) / ROWS) * 180);
    const km = land[i] ? (((h[i]! - SEA) / 127) ** 1.6 * 5200) / 1000 : 0;
    // Aquecimento da época (mais forte perto dos polos): +1,2 °C hoje, +3,5 °C no futuro.
    const warm = era === "atual" ? 1.2 : era === "futurista" ? 3.5 : 0;
    const lat = Math.abs(90 - ((y + 0.5) / ROWS) * 180);
    const t = sea + warm * (1 + (lat / 90) * 1.5) - km * 6.5 + fbm(x / 30, y / 30, 3) * 2.5;
    tempC[i] = t;
    temp[i] = Math.max(0, Math.min(1, (t + 14) / 42));
    noise[i] = fbm(x / 9 + 30, y / 9 + 30, 4) * 0.5 + 0.5;
  }

  // Ventos: cada linha é percorrida no sentido do vento, dando a volta ao mundo
  // a partir de um ponto de oceano (o ar chega úmido).
  const rain = new Float32Array(n);
  for (let y = 0; y < ROWS; y++) {
    const lat = 90 - ((y + 0.5) / ROWS) * 180;
    const a = Math.abs(lat);
    // Vento da faixa: o lado leste-oeste dele carrega a umidade; vento quase
    // norte-sul traz menos umidade, vinda dos dois lados.
    const wind = (cfg.winds[Math.min(5, Math.floor((90 - lat) / 30))]! * Math.PI) / 180;
    const east = Math.sin(wind);
    const dirs = Math.abs(east) >= 0.3 ? [east > 0 ? 1 : -1] : [1, -1];
    const band = RAIN_BY_LAT[Math.min(RAIN_BY_LAT.length - 1, (a / 5) | 0)]!;
    const maxHum = (30 * band) / dirs.length;
    let start = -1;
    for (let x = 0; x < COLS; x++) if (!land[y * COLS + x]) start = x;
    if (start < 0) continue; // linha toda de terra: sem fonte de umidade
    for (const dir of dirs) {
      let hum = maxHum;
      for (let k = 1; k <= COLS * 2; k++) {
        const x = wrapCol(start + dir * k);
        const i = y * COLS + x;
        const prev = y * COLS + wrapCol(x - dir);
        if (!land[i]) {
          hum = Math.min(maxHum, hum + 6); // o ar se recarrega sobre a água
          continue;
        }
        const rise = Math.max(0, h[i]! - h[prev]!);
        const e = (h[i]! - SEA) / 127;
        // Chuva normal + chuva de encosta (o ar sobe, esfria e chove).
        let p = Math.max(hum / 22, 0.5) + rise * (0.12 + e * 1.0);
        if (e > 0.82) p = hum; // cordilheira muito alta: despeja tudo, passa seco
        p = Math.min(p, hum);
        if (k > COLS) rain[i]! += p; // só a segunda volta conta (o ar já "deu a volta")
        // Parte da chuva volta ao ar (rios, lagos e plantas evaporam): a umidade avança.
        hum = Math.max(0, hum - p * 0.55);
      }
    }
  }
  // Um pouco de chuva do mar em toda costa, e suaviza (o ar não é tão preciso).
  const moistRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) moistRaw[i] = rain[i]!;
  let cur = moistRaw;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % COLS;
      const y = (i / COLS) | 0;
      let sum = cur[i]! * 2;
      let w = 2;
      for (const [dx, dy] of N8) {
        const ny = y + dy;
        if (ny < 0 || ny >= ROWS) continue;
        const j = ny * COLS + wrapCol(x + dx);
        if (!land[j]) continue;
        sum += cur[j]!;
        w++;
      }
      next[i] = sum / w;
    }
    cur = next;
  }
  // Normaliza pela distribuição das terras (0 = árido, 1 = muito úmido).
  const vals: number[] = [];
  for (let i = 0; i < n; i++) if (land[i]) vals.push(cur[i]!);
  vals.sort((a, b) => a - b);
  const p95 = vals[Math.floor(vals.length * 0.95)] ?? 1;
  // A chuva do planeta ("Precipitação") multiplica a umidade de todas as terras.
  const rainK = cfg.precipitation / 100;
  const moist = new Float32Array(n);
  for (let i = 0; i < n; i++)
    moist[i] = land[i]
      ? Math.min(
          1,
          (Math.sqrt(Math.min(1, cur[i]! / (p95 || 1))) * 0.92 + noise[i]! * 0.08) * rainK,
        )
      : 0.6;
  return { temp, tempC, moist, noise };
}

/** Bioma pela temperatura (°C), umidade (0–1) e altitude (0–1 acima do mar). */
export function biomeFor(tc: number, m: number, e: number): number {
  if (e > 0.84) return tc < -2 ? 11 : 13;
  if (tc < -8) return 11; // gelo permanente
  if (m > 0.86 && e < 0.08 && tc > 2) return 12; // pântano
  const band = Math.min(4, Math.floor(m * 5)); // 0 árido … 4 muito úmido
  if (tc < 0) return band <= 1 ? 10 : 9; // tundra / taiga
  if (tc < 6) return band === 0 ? 10 : 9;
  if (tc < 18) {
    // temperado
    return band === 0 ? 2 : band === 1 ? 4 : band <= 3 ? 6 : 8;
  }
  // quente
  return band === 0 ? 1 : band === 1 ? 3 : band === 2 ? 5 : band === 3 ? 5 : 7;
}

export function deriveWorld(map: WorldMap): Derived {
  const n = COLS * ROWS;
  const h = map.heights;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = h[i]! >= SEA ? 1 : 0;
  // No futuro o mar subiu (o gelo derreteu): as terras mais baixas da costa
  // ficam embaixo d'água, menos onde há cidade (protegida por diques).
  const flooded = new Uint8Array(n);
  if (eraOf(map) === "futurista") {
    const keep = new Set(map.burgs.map((b) => cellOf(b.x, b.y)));
    for (let i = 0; i < n; i++) {
      if (!land[i] || h[i]! > SEA + 1 || keep.has(i)) continue;
      const x = i % COLS;
      const y = (i / COLS) | 0;
      for (const [dx, dy] of N8) {
        const ny = y + dy;
        if (ny < 0 || ny >= ROWS) continue;
        if (h[ny * COLS + wrapCol(x + dx)]! < SEA) {
          flooded[i] = 1;
          break;
        }
      }
    }
    for (let i = 0; i < n; i++) if (flooded[i]) land[i] = 0;
  }

  const rand = rng(map.options.seed ^ 0x77);
  const fbm = makeNoise(rand);
  const { temp, tempC, moist, noise } = climate(map, land, fbm);

  // Preenche depressões (priority-flood): a água sempre acha por onde escorrer, e
  // `filled` é o nível que a água alcança em cada célula.
  const filled = new Float32Array(n);
  const done = new Uint8Array(n);
  const heap = new Heap();
  for (let i = 0; i < n; i++) {
    const y = (i / COLS) | 0;
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
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(x + dx);
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = Math.max(h[j]!, hi + 0.01);
      down[j] = i;
      heap.push(j, filled[j]!);
    }
  }

  // A água desce pelo maior declive (pelo nível da água, que nunca sobe rio
  // abaixo); nas planícies de um lago, segue o caminho do preenchimento.
  for (let i = 0; i < n; i++) {
    if (!land[i] || down[i]! < 0) continue;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    let best = down[i]!;
    let bestS =
      (filled[best]! - filled[i]!) / stepLen(dCol(best % COLS, x), ((best / COLS) | 0) - y, y);
    for (const [dx, dy] of N8) {
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapCol(x + dx);
      if (filled[j]! >= filled[i]!) continue;
      const s = (filled[j]! - filled[i]!) / stepLen(dx, dy, y);
      if (s < bestS) {
        bestS = s;
        best = j;
      }
    }
    down[i] = best;
  }

  // Lagos: depressões fundas o bastante viram água, até o nível de transbordo
  // (menos onde há cidade: a cidade fica na margem).
  const burgAt = new Set(map.burgs.map((b) => cellOf(b.x, b.y)));
  const lakeId = new Int16Array(n).fill(-1);
  const lakes: Derived["lakes"] = [];
  {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (!land[s] || seen[s] || filled[s]! - h[s]! < 0.3) continue;
      const comp = [s];
      seen[s] = 1;
      let depth = 0;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k]!;
        depth = Math.max(depth, filled[i]! - h[i]!);
        const x = i % COLS;
        const y = (i / COLS) | 0;
        for (const [dx, dy] of N8) {
          const ny = y + dy;
          if (ny < 0 || ny >= ROWS) continue;
          const j = ny * COLS + wrapCol(x + dx);
          if (!seen[j] && land[j] && filled[j]! - h[j]! >= 0.3) {
            seen[j] = 1;
            comp.push(j);
          }
        }
      }
      if (comp.length < 2 || depth < 1 || lakes.length >= 32000) continue;
      if (comp.some((i) => burgAt.has(i))) continue;
      const id = lakes.length;
      for (const i of comp) lakeId[i] = id;
      lakes.push({ cells: comp, salty: false, depth, outlet: -1, name: "" });
    }
    // Saída de cada lago: a célula do lago que escoa para fora dele.
    for (const lk of lakes)
      for (const i of lk.cells) {
        const d = down[i]!;
        if (d >= 0 && lakeId[d] !== lakeId[i]) {
          lk.outlet = i;
          break;
        }
      }
  }

  // Vazão: o que escoa é a chuva menos a evaporação (maior no calor). Desce das
  // células mais altas (nível da água) para as mais baixas.
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => land[i]);
  order.sort((a, b) => filled[b]! - filled[a]!);
  const runoff = (i: number) => Math.max(0.03, moist[i]! - (0.06 + temp[i]! * 0.32)) * 1.4;
  const accumulate = (blocked: Uint8Array | null) => {
    const f = new Float32Array(n);
    for (const i of order) {
      f[i]! += runoff(i);
      if (blocked && blocked[i]) continue; // lago salgado: a água fica nele
      const d = down[i]!;
      if (d >= 0 && land[d]) f[d]! += f[i]!;
    }
    return f;
  };
  let flux = accumulate(null);
  // Lago que evapora mais do que recebe não transborda (lago salgado, sem saída).
  const closed = new Uint8Array(n);
  let anyClosed = false;
  for (const lk of lakes) {
    if (lk.outlet < 0) continue;
    const inflow = flux[lk.outlet]!;
    const t = lk.cells.reduce((a, i) => a + temp[i]!, 0) / lk.cells.length;
    // Evaporação da superfície menos a chuva que cai no próprio lago.
    const m = lk.cells.reduce((a, i) => a + moist[i]!, 0) / lk.cells.length;
    const evaporation = lk.cells.length * Math.max(0, 0.1 + t * 0.9 - m);
    if (inflow < evaporation) {
      lk.salty = true;
      closed[lk.outlet] = 1;
      anyClosed = true;
    }
  }
  if (anyClosed) flux = accumulate(closed);

  // Lagos viram água de verdade (a partir daqui, terra é só terra).
  for (const lk of lakes) for (const i of lk.cells) land[i] = 0;
  // Alturas "efetivas" para desenhar: lago = água (mais escura onde é mais fundo).
  const eff = new Uint8Array(h);
  for (let i = 0; i < n; i++) if (flooded[i]) eff[i] = SEA - 3;
  for (const lk of lakes)
    for (const i of lk.cells) eff[i] = Math.max(70, Math.round(SEA - 3 - (filled[i]! - h[i]!) * 3));

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

  const landFlux = order
    .filter((i) => land[i])
    .map((i) => flux[i]!)
    .sort((a, b) => b - a);
  const riverMin = Math.max(6, landFlux[Math.floor(landFlux.length * 0.035)] ?? 6);

  // Rios: das nascentes até o mar ou um lago (ou até encontrar outro rio). Um rio
  // que sai de um lago começa na margem dele.
  const isRiver = (i: number) => land[i] && flux[i]! >= riverMin;
  const hasUp = new Uint8Array(n);
  for (const i of order) if (isRiver(i) && down[i]! >= 0) hasUp[down[i]!] = 1;
  const visited = new Uint8Array(n);
  const rivers: Derived["rivers"] = [];
  const shore = (from: number, to: number) => {
    const t = Math.max(0, Math.min(1, (eff[from]! - (SEA - 0.5)) / (eff[from]! - eff[to]! || 1)));
    const cx = (from % COLS) + 0.5;
    const cy = Math.floor(from / COLS) + 0.5;
    return [cx + dCol(to % COLS, from % COLS) * t, cy + (Math.floor(to / COLS) + 0.5 - cy) * t] as [
      number,
      number,
    ];
  };
  for (const i of order) {
    if (!isRiver(i) || hasUp[i]) continue;
    const cells = [i];
    let c = i;
    visited[c] = 1;
    let mouth: [number, number] | undefined;
    // Nasce num lago? Começa na margem.
    let source: [number, number] | undefined;
    for (const lk of lakes)
      if (lk.outlet >= 0 && down[lk.outlet] === i) source = shore(i, lk.outlet);
    while (down[c]! >= 0) {
      const d = down[c]!;
      if (!land[d]) {
        mouth = shore(c, d); // foz exatamente na margem
        break;
      }
      cells.push(d);
      if (visited[d]) break;
      visited[d] = 1;
      c = d;
    }
    if (cells.length > 3 || (source && cells.length > 1))
      rivers.push({
        cells,
        mouth,
        source,
        width: Math.min(3, 0.6 + Math.sqrt(flux[c]! / riverMin) * 0.55),
      });
  }

  // Biomas: matriz de temperatura (°C) × umidade, como no diagrama de Whittaker.
  // O rio umedece a célula (mata ciliar). Montanhas altas viram rocha/neve.
  const biome = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    const e = (h[i]! - SEA) / 127;
    const tc = tempC[i]!;
    let m = moist[i]!;
    if (flux[i]! >= riverMin) m = Math.min(1, m + 0.12);
    biome[i] = biomeFor(tc, m, e);
  }
  // Hoje e no futuro: cidades viram manchas urbanas e o campo em volta vira
  // lavoura (no futuro menos, com fazendas verticais e matas replantadas).
  {
    const era = eraOf(map);
    if (era !== "fantasia") {
      const caps = new Set(map.states.map((s) => s.capital));
      const hash = (i: number) => {
        const s = Math.sin(i * 78.233 + map.options.seed * 0.0007) * 43758.5453;
        return s - Math.floor(s);
      };
      const farmP = era === "atual" ? 0.55 : 0.25;
      const FARMABLE = new Set([3, 4, 5, 6, 8]);
      for (const b of map.burgs) {
        const c = cellOf(b.x, b.y);
        const cx = c % COLS;
        const cy = (c / COLS) | 0;
        const big = caps.has(b.id);
        const urban = big ? (era === "futurista" ? 1.5 : 1) : era === "futurista" ? 0.5 : 0;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const y = cy + dy;
            if (y < 0 || y >= ROWS) continue;
            const j = y * COLS + wrapCol(cx + dx);
            if (!land[j] || biome[j] === 11 || biome[j] === 13) continue;
            const dist = Math.hypot(dx, dy);
            if (dist <= urban || j === c) biome[j] = 14;
            else if (biome[j] !== 14 && FARMABLE.has(biome[j]!) && hash(j) < farmP * (1 - dist / 4))
              biome[j] = 15;
          }
      }
    }
  }

  // Culturas: cada povo se espalha a partir do centro, com custos do seu jeito de
  // viver (o nômade avança rápido em campos e desertos, o caçador nas matas, o
  // montanhês nas serras, o navegante pela costa, o ribeirinho pelos rios).
  const culture = new Int16Array(n).fill(-1);
  {
    const cults = map.cultures ?? [];
    const BIOME_COST = [0, 4, 3, 1.2, 1, 1.4, 1.4, 1.6, 1.8, 4, 10, 40, 3, 6, 0.6, 0.8];
    const cost = new Float64Array(n).fill(Infinity);
    const q = new Heap();
    const native: number[] = [];
    cults.forEach((c, k) => {
      const i = cellOf(c.x, c.y);
      native[k] = biome[i]!;
      if (!land[i]) return;
      cost[i] = 0;
      culture[i] = k;
      q.push(i, 0);
    });
    const landCount = land.reduce((a, v) => a + v, 0);
    const limit = Math.max(80, Math.sqrt(landCount / Math.max(1, cults.length)) * 20);
    while (q.size) {
      const i = q.pop();
      const ci = q.lastKey;
      if (ci > cost[i]!) continue;
      const k = culture[i]!;
      const type = cults[k]!.type;
      const x = i % COLS;
      const y = (i / COLS) | 0;
      for (const [dx, dy] of N8) {
        const ny = y + dy;
        if (ny < 0 || ny >= ROWS) continue;
        const j = ny * COLS + wrapCol(x + dx);
        if (!land[j]) continue;
        const b = biome[j]!;
        const e = (h[j]! - SEA) / 127;
        let c = b === native[k] ? 0.4 : BIOME_COST[b]!;
        if (type === "nomade") c *= [1, 2, 3, 4].includes(b) ? 0.35 : 3;
        else if (type === "cacador") c *= [5, 6, 7, 8, 9].includes(b) ? 0.5 : 2;
        if (type === "montanhes") c += e > 0.4 ? 0 : 3;
        else c += e > 0.6 ? 4 : e > 0.4 ? 1 : 0;
        const onRiver = flux[j]! >= riverMin;
        if (type === "ribeirinho") c *= onRiver ? 0.3 : 1.5;
        else if (onRiver) c += 0.8;
        if (type === "navegante") c *= coastDist[j]! <= 1 ? 0.4 : 1.6;
        if (type === "lacustre" && coastDist[j]! <= 1 && !ocean[j]) c *= 0.4;
        const nc = ci + stepLen(dx, dy, y) * (1 + c);
        if (nc < cost[j]! && nc < limit) {
          cost[j] = nc;
          culture[j] = k;
          q.push(j, nc);
        }
      }
    }
  }

  // Nomes dos lagos, no idioma do povo que vive em volta.
  {
    const cults = map.cultures ?? [];
    const used = new Set<string>();
    const namers = new Map<number, () => string>();
    lakes.forEach((lk, k) => {
      let ci = -1;
      for (const i of lk.cells) {
        const x = i % COLS;
        const y = (i / COLS) | 0;
        for (const [dx, dy] of N8) {
          const ny = y + dy;
          if (ny < 0 || ny >= ROWS) continue;
          const j = ny * COLS + wrapCol(x + dx);
          if (culture[j]! >= 0) ci = culture[j]!;
        }
        if (ci >= 0) break;
      }
      let namer = namers.get(ci);
      if (!namer) {
        namer = makeMarkovNamer(
          cults[ci]?.base ?? NAME_BASES[k % NAME_BASES.length]!.id,
          map.options.seed + 31337 + ci * 977,
          used,
        );
        namers.set(ci, namer);
      }
      lk.name = (lk.salty ? "Lago Salgado " : "Lago ") + namer();
    });
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
  const terrainCost = [0, 2.2, 1.6, 0.6, 0.2, 0.7, 0.9, 1.4, 1.2, 1.6, 2.2, 6, 2.5, 4, 0.2, 0.3];
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
  const BIOME_ROAD = [0, 0.5, 0.3, 0.1, 0, 0.35, 0.3, 0.7, 0.45, 0.5, 0.6, 5, 1.6, 1.2, 0, 0.05];
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
  // Nomes das estradas pela época (rodovias numeradas hoje, linhas maglev no futuro).
  const era = eraOf(map);
  let roadNo = 0;
  const stateCode = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 2)
      .toUpperCase();
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
    if (path)
      addRoad(
        path,
        "principal",
        era === "atual"
          ? `Autoestrada A${++roadNo}`
          : era === "futurista"
            ? `Linha Maglev ${ca.name}–${cb.name}`
            : `Rodovia ${ca.name}–${cb.name}`,
      );
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
    if (path && path.length > 1)
      addRoad(
        path,
        "estrada",
        era === "atual"
          ? `Rodovia ${stateCode(map.states[k]!.name)}-${100 + ++roadNo}`
          : era === "futurista"
            ? `Via Expressa ${b.name}`
            : `Estrada de ${b.name}`,
      );
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
    addRoad(
      path,
      "trilha",
      era === "atual"
        ? `Estrada vicinal ${b.name}–${other.name}`
        : era === "futurista"
          ? `Corredor ${b.name}–${other.name}`
          : `Trilha ${b.name}–${other.name}`,
    );
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
    tempC,
    moist,
    noise,
    biome,
    coastDist,
    ocean,
    oceanDist,
    flux,
    down,
    riverMin,
    rivers,
    lakes,
    era: eraOf(map),
    lake: lakeId,
    eff,
    owner,
    culture,
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
        cultures: map.cultures ?? [],
        ...(map.climate ? { climate: map.climate } : {}),
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
      ...(ERAS.some((e) => e.value === o.era) && o.era !== "fantasia" ? { era: o.era as Era } : {}),
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
      if (STATE_FORMS.includes(s.form as StateForm)) state.form = s.form as StateForm;
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
    const cultures: Culture[] = [];
    for (const c of Array.isArray(d.cultures)
      ? (d.cultures as Record<string, unknown>[]).slice(0, 40)
      : []) {
      const id = str(c.id, 64);
      const cx = num(c.x);
      const cy = num(c.y);
      if (!id || cx === null || cy === null) continue;
      cultures.push({
        id,
        name: str(c.name, 80) || "Povo",
        base: NAME_BASES.some((b) => b.id === c.base) ? (c.base as string) : "lusitana",
        type: (Object.keys(CULTURE_TYPES).includes(c.type as string)
          ? c.type
          : "generico") as CultureType,
        color: /^#[0-9a-f]{6}$/i.test(str(c.color, 7)) ? str(c.color, 7) : CULTURE_COLORS[0]!,
        x: Math.max(0, Math.min(COLS, cx * sx)),
        y: Math.max(0, Math.min(ROWS, cy * sy)),
      });
    }
    const climate =
      d.climate && typeof d.climate === "object"
        ? normalizeClimate(d.climate as Partial<WorldClimate>)
        : undefined;
    return {
      name: str(d.name, 80) || "Mundo",
      options,
      heights,
      burgs,
      states,
      routes,
      cultures,
      ...(climate ? { climate } : {}),
    };
  } catch {
    return null;
  }
}
