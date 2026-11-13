import { BIOMES, cellOf, COLS, ROWS, type Derived, type WorldMap } from "./worldgen";
import { bigNumber, cellPopulation, settlementInfo } from "./settlement";

/*
 * População e clima de um lugar ligado ao mapa-múndi (cidade ou estado), lidos
 * do mapa. A ficha mostra estes valores no lugar de campos digitados à mão.
 */

export interface PlaceFacts {
  /** "cidade" ou "estado": de onde veio o número. */
  source: "cidade" | "estado";
  population: number;
  populationText: string;
  climate: string;
}

/** Nome do clima pela temperatura média (°C) e pela umidade (0 a 1). */
export function climateName(t: number, moist: number): string {
  const band =
    t >= 24
      ? "Tropical"
      : t >= 18
        ? "Subtropical"
        : t >= 10
          ? "Temperado"
          : t >= 2
            ? "Frio"
            : t >= -8
              ? "Subpolar"
              : "Polar";
  const wet =
    moist < 0.22 ? "árido" : moist < 0.4 ? "seco" : moist < 0.65 ? "úmido" : "muito úmido";
  return `${band} ${wet}`;
}

const deg = (t: number) => `${Math.round(t).toLocaleString("pt-BR")} °C`;

/** Resumo do clima de um conjunto de células: nome, temperaturas e bioma que domina. */
export function climateOf(d: Derived, cells: number[]): string {
  const land = cells.filter((i) => d.land[i]);
  if (!land.length) return "";
  let t = 0;
  let m = 0;
  let lo = Infinity;
  let hi = -Infinity;
  const biomes = new Map<number, number>();
  for (const i of land) {
    const c = d.tempC[i]!;
    t += c;
    m += d.moist[i]!;
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
    biomes.set(d.biome[i]!, (biomes.get(d.biome[i]!) ?? 0) + 1);
  }
  t /= land.length;
  m /= land.length;
  const top = [...biomes].sort((a, b) => b[1] - a[1])[0]![0];
  const range = hi - lo >= 3 ? ` (de ${deg(lo)} a ${deg(hi)})` : "";
  const biome = BIOMES[top]?.name ?? "";
  return `${climateName(t, m)} · média de ${deg(t)}${range}${biome ? ` · ${biome.toLowerCase()}` : ""}`;
}

/**
 * Fatos do mapa para a ficha `noteId`, se ela for uma cidade ou um estado do
 * mapa-múndi; senão, null. `fieldsOf` dá os campos de outra ficha (as cidades do
 * estado podem ter a população trocada à mão no "Editar povoado").
 */
export function placeFacts(
  map: WorldMap,
  d: Derived,
  noteId: string,
  fieldsOf: (noteId: string | undefined) => Record<string, string>,
): PlaceFacts | null {
  const capitals = new Set(map.states.map((s) => s.capital));
  const burg = map.burgs.find((b) => b.noteId === noteId);
  if (burg) {
    const c = cellOf(burg.x, burg.y);
    const info = settlementInfo(burg, capitals.has(burg.id), map.heights, d, fieldsOf(noteId));
    // Clima da cidade: a célula dela e as vizinhas (evita um ponto isolado).
    const cells: number[] = [];
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const y = cy + dy;
        if (y >= 0 && y < ROWS) cells.push(y * COLS + ((cx + dx + COLS) % COLS));
      }
    return {
      source: "cidade",
      population: info.population,
      populationText: bigNumber(info.population),
      climate: climateOf(d, [c, ...cells.filter((i) => i !== c && d.land[i])]),
    };
  }
  const k = map.states.findIndex((s) => s.noteId === noteId);
  if (k < 0) return null;
  const cells: number[] = [];
  let rural = 0;
  for (let i = 0; i < COLS * ROWS; i++) {
    if (d.owner[i] !== k) continue;
    cells.push(i);
    rural += cellPopulation(d, i);
  }
  let urban = 0;
  for (const b of map.burgs) {
    if (d.owner[cellOf(b.x, b.y)] !== k) continue;
    urban += settlementInfo(b, capitals.has(b.id), map.heights, d, fieldsOf(b.noteId)).population;
  }
  const population = Math.round(rural) + urban;
  return {
    source: "estado",
    population,
    populationText: bigNumber(population),
    climate: climateOf(d, cells),
  };
}
