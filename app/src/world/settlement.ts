import { hashSeed } from "./geom";
import { cellOf, COLS, SEA, type Burg, type Derived } from "./worldgen";
import { parseMapOptions, type MapOptions, type MapSize } from "./village";

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
): SettlementInfo {
  const c = cellOf(burg.x, burg.y);
  const seed = hashSeed(burg.id);
  const coastal = d.coastDist[c]! <= 2;
  const x = c % COLS;
  let river = false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const j = c + dy * COLS + dx;
      if (x + dx < 0 || x + dx >= COLS || j < 0 || j >= d.flux.length) continue;
      if (d.land[j] && d.flux[j]! >= d.riverMin) river = true;
    }
  const population =
    parsePopulation(fields.populacao) ??
    (capital ? 6000 + (seed % 18000) : 200 + (seed % 4800) * (coastal || river ? 1.4 : 1)) | 0;
  const stored = parseElements(fields.elementos);
  const elements: Set<ElementKey> =
    fields.elementos !== undefined
      ? stored
      : new Set<ElementKey>([
          ...(coastal ? (["porto"] as const) : []),
          ...(capital || population >= 5000 ? (["muralhas"] as const) : []),
          ...(capital ? (["cidadela"] as const) : []),
          ...(population >= 1000 ? (["praca"] as const) : []),
          ...(population >= 2500 ? (["templo"] as const) : []),
        ]);
  // "Capital" segue o mapa (é ele que diz quem é capital).
  if (capital) elements.add("capital");
  else elements.delete("capital");
  const type =
    fields.tipoPovoado ||
    (coastal ? "Porto" : river ? "Fluvial" : metres(heights[c]!) > 1800 ? "Montanha" : "Genérico");
  const saved = parseMapOptions(fields.mapa);
  const preview: MapOptions = {
    ...(saved ?? {
      seed,
      size: sizeFor(population),
      road: true,
      river,
      fields: true,
    }),
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
    culture: fields.cultura ?? "",
    tags: fields.etiquetas ?? "",
    elements,
    tempC: Math.round(-14 + d.temp[c]! * 42),
    elevation: metres(heights[c]!),
    coastal,
    river,
    preview,
  };
}
