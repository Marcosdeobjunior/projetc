import { hashSeed, rng } from "./geom";
import { cellOf, COLS, dCol, ROWS, SEA, type Burg, type Derived } from "./worldgen";
import {
  parseMapOptions,
  type ArchStyle,
  type MapOptions,
  type MapSize,
  type VillageGeo,
} from "./village";

/*
 * Dados de um povoado do mapa-múndi (o "Editar povoado"). Ficam nos campos do
 * lugar ligado à cidade: `populacao`, `grupo`, `tipoPovoado`, `cultura`,
 * `elementos` (lista separada por vírgulas), `etiquetas` e `mapa` (as opções da
 * prévia, a mesma do "Mapa da região" da ficha). O que não foi escrito tem um
 * valor padrão tirado do mapa (clima, costa, rio, capital).
 */

export const GROUPS = ["Metrópole", "Cidade", "Vila", "Aldeia", "Povoado"] as const;
export const SETTLEMENT_TYPES = [
  "Genérico",
  "Porto",
  "Fluvial",
  "Lacustre",
  "Montanha",
  "Fronteira",
  "Nômade",
  "Caça",
] as const;

export const ELEMENTS = [
  { key: "capital", label: "Capital" },
  { key: "porto", label: "Porto" },
  { key: "muralhas", label: "Muralhas" },
  { key: "cidadela", label: "Cidadela" },
  { key: "praca", label: "Praça" },
  { key: "templo", label: "Templo" },
  { key: "favela", label: "Favela" },
] as const;
export type ElementKey = (typeof ELEMENTS)[number]["key"];

export function groupFor(pop: number): (typeof GROUPS)[number] {
  return pop >= 20000
    ? "Metrópole"
    : pop >= 5000
      ? "Cidade"
      : pop >= 1000
        ? "Vila"
        : pop >= 150
          ? "Aldeia"
          : "Povoado";
}

export function sizeFor(pop: number): MapSize {
  return pop >= 6000 ? "cidade" : pop >= 1000 ? "vila" : "aldeia";
}

export function parsePopulation(raw: string | undefined): number | null {
  const n = Number((raw ?? "").replace(/[^\d]/g, ""));
  return raw && Number.isFinite(n) && n > 0 ? n : null;
}

export function parseElements(raw: string | undefined): Set<ElementKey> {
  const keys = new Set(ELEMENTS.map((e) => e.key as string));
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ElementKey => keys.has(s)),
  );
}

export interface SettlementInfo {
  population: number;
  group: string;
  type: string;
  culture: string;
  tags: string;
  elements: Set<ElementKey>;
  /** Temperatura média (°C) e altitude (m), tiradas do mapa. */
  tempC: number;
  elevation: number;
  coastal: boolean;
  river: boolean;
  preview: MapOptions;
}

/** Altitude em metros de uma altura da grade (negativa no mar). */
export function metres(h: number): number {
  return h >= SEA
    ? Math.round(((h - SEA) / 127) ** 1.6 * 5200)
    : -Math.round(((SEA - h) / SEA) * 4000);
}

export function settlementInfo(
  burg: Burg,
  capital: boolean,
  heights: Uint8Array,
  d: Derived,
  fields: Record<string, string>,
  /** Culturas do mapa (para sugerir a cultura do lugar). */
  cultures?: { name: string }[],
): SettlementInfo {
  const c = cellOf(burg.x, burg.y);
  const seed = hashSeed(burg.id);
  // Porto só à beira do oceano (rio e lago não fazem porto).
  const coastal = d.oceanDist[c]! <= 2;
  const lake = !coastal && d.coastDist[c]! <= 2;
  const x = c % COLS;
  let river = false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const j = c + dy * COLS + dx;
      if (x + dx < 0 || x + dx >= COLS || j < 0 || j >= d.flux.length) continue;
      if (d.land[j] && d.flux[j]! >= d.riverMin) river = true;
    }
  // No mundo real as cidades são muito maiores (metrópoles de milhões).
  const scale = d.era === "atual" ? 60 : 1;
  const population =
    parsePopulation(fields.populacao) ??
    ((capital ? 6000 + (seed % 18000) : 200 + (seed % 4800) * (coastal || river ? 1.4 : 1)) *
      scale) |
      0;
  // Elementos pela população (em milhares), com sorteio fixo por cidade: cidades
  // grandes quase sempre têm muralha e cidadela; favela e templo vêm com o tamanho.
  const pr = rng(seed ^ 0x5a17);
  const P = (p: number) => pr() < p;
  const k = population / 1000 / scale;
  // No mundo real, muralha e cidadela são raras (centros históricos).
  const old = scale === 1;
  const citadel =
    (old || P(0.15)) && (capital || (k > 50 && P(0.75)) || (k > 15 && P(0.5)) || P(0.1));
  const walls =
    (old || P(0.1)) && (capital || k > 30 || (k > 20 && P(0.75)) || (k > 10 && P(0.5)) || P(0.1));
  const shanty = k > 60 || (k > 40 && P(0.75)) || (k > 20 && walls && P(0.4));
  const temple = k > 50 || (k > 35 && P(0.75)) || (k > 20 && P(0.5)) || (k > 3 && P(0.2));
  const plaza = k > 1 || P(0.5);
  const stored = parseElements(fields.elementos);
  const elements: Set<ElementKey> =
    fields.elementos !== undefined
      ? stored
      : new Set<ElementKey>([
          ...(coastal ? (["porto"] as const) : []),
          ...(walls ? (["muralhas"] as const) : []),
          ...(citadel ? (["cidadela"] as const) : []),
          ...(plaza ? (["praca"] as const) : []),
          ...(temple ? (["templo"] as const) : []),
          ...(shanty ? (["favela"] as const) : []),
        ]);
  // "Capital" segue o mapa (é ele que diz quem é capital).
  if (capital) elements.add("capital");
  else elements.delete("capital");
  // Tipo pelo lugar: porto, lago, serra, rio grande; povoados pequenos em campo ou
  // deserto são nômades, e em mata, de caçadores.
  const biome = d.land[c] ? d.biome[c]! : 4;
  const type =
    fields.tipoPovoado ||
    (coastal
      ? "Porto"
      : lake
        ? "Lacustre"
        : metres(heights[c]!) > 1800
          ? "Montanha"
          : river
            ? "Fluvial"
            : population < 1500 && [1, 2, 3, 4].includes(biome)
              ? "Nômade"
              : population < 1500 && [5, 6, 7, 8, 9].includes(biome)
                ? "Caça"
                : "Genérico");
  const saved = parseMapOptions(fields.mapa);
  const geo: VillageGeo = {
    ...localGeo(burg, d),
    // No mundo real a cidade é moderna (só os nômades seguem em tendas).
    style:
      d.era === "atual" && type !== "Nômade"
        ? "moderno"
        : archStyle(biome, type, d.tempC[c]!, metres(heights[c]!)),
    population,
    port: elements.has("porto") || type === "Porto" || type === "Lacustre",
  };
  const preview: MapOptions = {
    ...(saved ?? {
      seed,
      size: sizeFor(population),
      road: true,
      river,
      fields: true,
    }),
    geo,
    walls: elements.has("muralhas"),
    citadel: elements.has("cidadela"),
    plaza: elements.has("praca"),
    temple: elements.has("templo"),
    shanty: elements.has("favela"),
  };
  return {
    population,
    group: fields.grupo || groupFor(population),
    type,
    culture: fields.cultura ?? cultures?.[d.culture[c]!]?.name ?? "",
    tags: fields.etiquetas ?? "",
    elements,
    tempC: Math.round(d.tempC[c]!),
    elevation: metres(heights[c]!),
    coastal,
    river,
    preview,
  };
}

/**
 * Estilo das construções: o tipo do povoado manda primeiro (nômades moram em
 * tendas, caçadores em cabanas), depois a altitude, o frio e o bioma.
 */
export function archStyle(biome: number, type: string, tempC: number, elev: number): ArchStyle {
  if (type === "Nômade") return "nomade";
  if (type === "Caça") return biome === 5 || biome === 7 ? "tropical" : "caca";
  if (type === "Montanha" || elev > 1800 || biome === 13) return "montanha";
  if (biome === 11 || biome === 10 || tempC < -3) return "neve";
  if (biome === 9) return "frio";
  if (biome === 1 || biome === 2) return "deserto";
  if (biome === 3 || biome === 5 || biome === 7) return "tropical";
  if (biome === 12) return tempC > 20 ? "tropical" : "temperado";
  return "temperado";
}

/** Cor do chão e árvores da prévia, pelo bioma do mapa-múndi. */
const BIOME_LOOK: { ground: string; trees: number; farmland: boolean }[] = [
  { ground: "#ece2c9", trees: 1, farmland: true }, // mar (não usado)
  { ground: "#efdcab", trees: 0.08, farmland: false }, // deserto quente
  { ground: "#e3dcc0", trees: 0.12, farmland: false }, // deserto frio
  { ground: "#ebdfb2", trees: 0.45, farmland: true }, // savana
  { ground: "#e6e3c0", trees: 0.45, farmland: true }, // campos
  { ground: "#e1e3bc", trees: 1.2, farmland: true }, // floresta tropical sazonal
  { ground: "#dfe2bf", trees: 1.4, farmland: true }, // floresta temperada
  { ground: "#d8e0b8", trees: 1.9, farmland: true }, // floresta tropical
  { ground: "#d9e0bf", trees: 1.8, farmland: true }, // floresta úmida temperada
  { ground: "#dfe1cf", trees: 1.5, farmland: false }, // taiga
  { ground: "#e6e5da", trees: 0.15, farmland: false }, // tundra
  { ground: "#f1f4f4", trees: 0, farmland: false }, // geleira
  { ground: "#dbe0c4", trees: 0.9, farmland: false }, // pântano
  { ground: "#e3ddcf", trees: 0.35, farmland: false }, // montanha
  { ground: "#dedbd4", trees: 0.25, farmland: false }, // área urbana
  { ground: "#e8e2bc", trees: 0.3, farmland: true }, // lavouras
];

/** Gente por célula inteira (no equador) e por hábitat, conforme a época. */
const RURAL_DENSITY = { fantasia: 50_000, atual: 900_000 } as const;
const URBAN_DENSITY = { fantasia: 0, atual: 10_000_000 } as const;
const HABITAT = [0, 0.05, 0.03, 0.5, 0.9, 0.7, 0.8, 0.5, 0.6, 0.15, 0.03, 0, 0.2, 0.08, 1, 1];

/** Gente no campo de uma célula (pela área, o bioma e a época). */
export function cellPopulation(d: Derived, i: number): number {
  if (!d.land[i]) return 0;
  const y = Math.floor(i / COLS);
  const area = Math.cos(((y + 0.5) / ROWS - 0.5) * Math.PI);
  const b = d.biome[i]!;
  return area * (b === 14 ? URBAN_DENSITY[d.era] : RURAL_DENSITY[d.era] * (HABITAT[b] ?? 0.3));
}

/** População fora das cidades do mapa (campo e periferias), pela área habitável. */
export function ruralPopulation(d: Derived): number {
  let sum = 0;
  for (let i = 0; i < d.land.length; i++) sum += cellPopulation(d, i);
  return Math.round(sum);
}

/** Número grande em palavras ("8,1 bilhões"). */
export function bigNumber(n: number): string {
  const f = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (n >= 1e9) return `${f(n / 1e9)} ${n >= 2e9 ? "bilhões" : "bilhão"}`;
  if (n >= 1e6) return `${f(n / 1e6)} ${n >= 2e6 ? "milhões" : "milhão"}`;
  return n.toLocaleString("pt-BR");
}

/**
 * Geografia em volta da cidade, lida do mapa-múndi: de que lado está a água,
 * para onde o rio corre e em que direções saem as estradas.
 */
export function localGeo(burg: Burg, d: Derived): VillageGeo {
  const c = cellOf(burg.x, burg.y);
  const cx = c % COLS;
  const cy = Math.floor(c / COLS);
  // Água por perto (mar ou lago): direção média das células de água num raio de 3.
  let wx = 0;
  let wy = 0;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const y = cy + dy;
      if (y < 0 || y >= ROWS || (!dx && !dy)) continue;
      const j = y * COLS + ((cx + dx + COLS) % COLS);
      if (d.land[j]) continue;
      const w = 1 / (dx * dx + dy * dy);
      wx += dx * w;
      wy += dy * w;
    }
  const coast = Math.hypot(wx, wy) > 0.05 ? Math.atan2(wy, wx) : null;
  // Rio: a célula de rio mais perto e para onde ela escorre.
  let river: number | null = null;
  let bestR = Infinity;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const y = cy + dy;
      if (y < 0 || y >= ROWS) continue;
      const j = y * COLS + ((cx + dx + COLS) % COLS);
      if (!d.land[j] || d.flux[j]! < d.riverMin) continue;
      const dist = dx * dx + dy * dy;
      if (dist >= bestR) continue;
      let to = j;
      for (let k = 0; k < 3 && d.down[to]! >= 0; k++) to = d.down[to]!;
      if (to === j) continue;
      const ddx = dCol(to % COLS, j % COLS);
      const ddy = Math.floor(to / COLS) - Math.floor(j / COLS);
      river = Math.atan2(ddy, ddx);
      bestR = dist;
    }
  // Estradas: em cada estrada que passa pela cidade, a direção de um ponto adiante e atrás.
  const roads: number[] = [];
  const addDir = (a: number) => {
    if (!roads.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.6))
      roads.push(a);
  };
  const order = [...d.roads].sort((a, b) => ROAD_RANK[a.type] - ROAD_RANK[b.type]);
  for (const r of order) {
    let k = -1;
    let best = Infinity;
    r.cells.forEach((cell, i) => {
      const dist = Math.hypot(dCol(cell % COLS, cx), Math.floor(cell / COLS) - cy);
      if (dist < best) {
        best = dist;
        k = i;
      }
    });
    if (best > 1.5) continue;
    for (const step of [-4, 4]) {
      const cell = r.cells[Math.max(0, Math.min(r.cells.length - 1, k + step))]!;
      const ddx = dCol(cell % COLS, cx);
      const ddy = Math.floor(cell / COLS) - cy;
      if (Math.hypot(ddx, ddy) >= 1.5) addDir(Math.atan2(ddy, ddx));
    }
  }
  const look = BIOME_LOOK[d.land[c] ? d.biome[c]! : 4] ?? BIOME_LOOK[4]!;
  return {
    seed: hashSeed(burg.id + "#geo"),
    coast,
    river,
    roads,
    ground: look.ground,
    trees: look.trees,
    farmland: look.farmland,
    ...(d.era !== "fantasia" ? { era: d.era } : {}),
  };
}

const ROAD_RANK = { principal: 0, estrada: 1, trilha: 2, maritima: 3 } as const;
