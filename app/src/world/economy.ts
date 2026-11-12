import { hashSeed } from "./geom";
import { cellPopulation } from "./settlement";
import type { Society } from "./society";
import {
  cellOf,
  COLS,
  dCol,
  ROWS,
  SEA,
  wrapCol,
  type Derived,
  type Era,
  type WorldMap,
} from "./worldgen";

/*
 * Economia dos estados e das cidades. Cada cidade tem uma vocação (o caminho
 * da sua economia) tirada do lugar: terra boa e rio dão agricultura, costa dá
 * pesca e comércio, serras e minas dão mineração, matas dão madeira, praias
 * quentes, neve e lugares famosos dão turismo, e capitais e cidades grandes,
 * serviços e indústria. O autor pode escolher outra vocação para a cidade.
 * O estado soma as cidades e o campo.
 */

export const SECTORS = [
  "agricultura",
  "pecuaria",
  "pesca",
  "mineracao",
  "madeira",
  "industria",
  "comercio",
  "turismo",
  "servicos",
] as const;
export type Sector = (typeof SECTORS)[number];

const LABELS: Record<Era, Record<Sector, string>> = {
  fantasia: {
    agricultura: "Agrícola",
    pecuaria: "Pastoril",
    pesca: "Pesqueira",
    mineracao: "Mineira",
    madeira: "Madeireira",
    industria: "Artesanal",
    comercio: "Mercantil",
    turismo: "Peregrinação e termas",
    servicos: "Administrativa e religiosa",
  },
  atual: {
    agricultura: "Agronegócio",
    pecuaria: "Pecuária",
    pesca: "Pesqueira",
    mineracao: "Mineração",
    madeira: "Florestal",
    industria: "Industrial",
    comercio: "Comércio e logística",
    turismo: "Turística",
    servicos: "Serviços e finanças",
  },
};
export const sectorLabel = (s: Sector, era: Era) => LABELS[era][s];

export const SECTOR_COLORS: Record<Sector, string> = {
  agricultura: "#9bbf4a",
  pecuaria: "#d8b45a",
  pesca: "#4a9fc4",
  mineracao: "#8a7f74",
  madeira: "#3f8a4f",
  industria: "#c0603f",
  comercio: "#7a63c4",
  turismo: "#e07fae",
  servicos: "#3f6fc0",
};

export interface CityEconomy {
  /** Vocação (o setor que manda), e se foi escolhida pelo autor. */
  main: Sector;
  chosen: boolean;
  /** Peso de cada setor (somam 1). */
  shares: Record<Sector, number>;
  products: string[];
  /** Renda por pessoa por ano (moedas de ouro na fantasia, dólares no mundo real). */
  perCapita: number;
  /** Riqueza de 1 a 5. */
  wealth: number;
}

export interface StateEconomy {
  main: Sector;
  shares: Record<Sector, number>;
  products: string[];
  gdp: number;
  perCapita: number;
  population: number;
}

/** Moeda e formato da renda por época. */
export function money(v: number, era: Era): string {
  if (era === "atual") {
    if (v >= 1e12)
      return `US$ ${(v / 1e12).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tri`;
    if (v >= 1e9)
      return `US$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
    if (v >= 1e6)
      return `US$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    return `US$ ${Math.round(v).toLocaleString("pt-BR")}`;
  }
  if (v >= 1e9)
    return `${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi de moedas`;
  if (v >= 1e6)
    return `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi de moedas`;
  return `${Math.round(v).toLocaleString("pt-BR")} moedas`;
}

const zero = (): Record<Sector, number> =>
  Object.fromEntries(SECTORS.map((s) => [s, 0])) as Record<Sector, number>;

const FARM = new Set([3, 4, 5, 6, 8, 15]);
const GRAZE = new Set([3, 4, 10]);
const FOREST = new Set([5, 6, 7, 8, 9]);

function pick<T>(list: readonly T[], seed: number, n: number): T[] {
  const out: T[] = [];
  for (let k = 0; out.length < Math.min(n, list.length) && k < 40; k++) {
    const v = list[(seed + k * 7) % list.length]!;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** O que cada setor produz, pelo clima e pela época. */
function productsFor(s: Sector, tempC: number, era: Era, seed: number, ores: string[]): string[] {
  const real = era === "atual";
  switch (s) {
    case "agricultura":
      return pick(
        tempC > 22
          ? ["arroz", "cana-de-açúcar", "frutas tropicais", "café", "cacau", "algodão"]
          : tempC > 11
            ? ["trigo", "uvas e vinho", "azeite", "milho", "cevada", "soja"]
            : ["centeio", "batata", "cevada", "aveia"],
        seed,
        2,
      );
    case "pecuaria":
      return pick(["gado", "lã", "couro", "cavalos", "queijo"], seed, 2);
    case "pesca":
      return pick(
        tempC > 20 ? ["peixe", "camarão", "sal", "pérolas"] : ["peixe", "bacalhau", "sal"],
        seed,
        2,
      );
    case "mineracao":
      return ores.length ? ores.slice(0, 2) : pick(["ferro", "cobre", "pedra", "carvão"], seed, 2);
    case "madeira":
      return pick(["madeira", "resina", "carvão vegetal", "papel"], seed, 2);
    case "industria":
      return pick(
        real
          ? ["aço", "automóveis", "máquinas", "eletrônicos", "químicos", "têxteis"]
          : ["ferramentas", "tecidos", "armas", "cerâmica", "vidro"],
        seed,
        2,
      );
    case "comercio":
      return real ? ["logística", "atacado"] : ["feiras", "caravanas"];
    case "turismo":
      return real ? ["hotéis e resorts", "gastronomia"] : ["peregrinos", "estalagens"];
    case "servicos":
      return real
        ? pick(["bancos", "software", "universidades", "saúde"], seed, 2)
        : ["corte", "clero"];
  }
}

export interface EconomyInput {
  map: WorldMap;
  d: Derived;
  society: Society;
  /** População de cada cidade (pelo id). */
  population: Map<string, number>;
  /** Vocação escolhida pelo autor (pelo id da cidade). */
  chosen?: Map<string, Sector>;
}

export function computeEconomy({ map, d, society, population, chosen }: EconomyInput) {
  const era = d.era;
  const real = era === "atual";
  const capitals = new Set(map.states.map((s) => s.capital));
  const cities = new Map<string, CityEconomy>();
  const pending: {
    b: (typeof map.burgs)[number];
    s: Record<Sector, number>;
    tempC: number;
    ores: string[];
    big: number;
    roads: number;
  }[] = [];
  for (const b of map.burgs) {
    const c = cellOf(b.x, b.y);
    const cx = c % COLS;
    const cy = Math.floor(c / COLS);
    let farm = 0;
    let graze = 0;
    let forest = 0;
    let n = 0;
    let elev = 0;
    let moist = 0;
    let lake = false;
    let river = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const y = cy + dy;
        if (y < 0 || y >= ROWS) continue;
        const j = y * COLS + wrapCol(cx + dx);
        if (d.lake[j]! >= 0) lake = true;
        if (!d.land[j]) continue;
        n++;
        const bio = d.biome[j]!;
        if (FARM.has(bio)) farm++;
        if (GRAZE.has(bio)) graze++;
        if (FOREST.has(bio)) forest++;
        elev += Math.max(0, (map.heights[j]! - SEA) / 127);
        moist += d.moist[j]!;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && d.flux[j]! >= d.riverMin) river = true;
      }
    n = Math.max(1, n);
    elev /= n;
    moist /= n;
    const tempC = d.tempC[c]!;
    const coastal = d.oceanDist[c]! <= 1;
    const pop = population.get(b.id) ?? 1000;
    const big = Math.max(0, Math.log10(pop) - (real ? 4 : 2.5)) / (real ? 2.5 : 2);
    const capital = capitals.has(b.id);
    const near = society.markers.filter((m) => Math.hypot(dCol(m.x, b.x), m.y - b.y) < 4);
    const has = (...types: string[]) => near.filter((m) => types.includes(m.type)).length;
    const ores = near
      .filter((m) => m.type === "mina" || m.type === "mineradora")
      .map((m) => /de ([a-zà-ú ]+?) de /i.exec(m.name)?.[1] ?? "")
      .filter(Boolean);
    let roads = 0;
    for (const r of d.roads)
      if (
        r.type !== "trilha" &&
        r.cells.some((x) => Math.hypot(dCol(x % COLS, cx), Math.floor(x / COLS) - cy) <= 1.5)
      )
        roads++;
    const mild = tempC > 4 && tempC < 30 ? 1 : 0.4;
    const s = zero();
    s.agricultura = (farm / n) * (0.4 + moist) * mild * (river ? 1.35 : 1);
    s.pecuaria = (graze / n) * 0.8 * (tempC > -2 ? 1 : 0.5);
    s.pesca = coastal ? (real ? 0.45 : 0.85) : lake ? 0.45 : 0;
    s.mineracao = Math.max(0, elev - 0.15) * 1.6 + (ores.length + has("mineradora")) * 0.5;
    s.madeira = (forest / n) * 0.75;
    s.industria = real
      ? big * 1.3 + (coastal ? 0.2 : 0) + Math.min(3, roads) * 0.15 + s.mineracao * 0.35
      : big * 0.6 + (river ? 0.25 : 0) + (s.mineracao + s.madeira) * 0.35;
    s.comercio =
      (coastal ? 0.6 : 0) + Math.min(4, roads) * 0.18 + (capital ? 0.25 : 0) + (river ? 0.12 : 0);
    s.turismo = real
      ? (coastal && tempC > 18 ? 0.6 : 0) +
        (elev > 0.55 ? 0.35 : 0) +
        has("parque", "estancia", "gruta", "reserva", "arqueologico") * 0.35 +
        (lake ? 0.2 : 0)
      : has("termas", "bosque", "ruinas", "cachoeira") * 0.3;
    s.servicos = (capital ? (real ? 0.9 : 0.6) : 0) + big * (real ? 0.7 : 0.25);
    pending.push({ b, s, tempC, ores, big, roads });
  }
  // Vocação pela vantagem de cada lugar em relação ao mundo (a cidade que mais se
  // destaca em pesca é pesqueira, mesmo que plante também): assim há caminhos
  // diferentes, e não só agricultura.
  const mean = zero();
  for (const p of pending) {
    const tot = SECTORS.reduce((a, k) => a + p.s[k], 0) || 1;
    for (const k of SECTORS) mean[k] += p.s[k] / tot / Math.max(1, pending.length);
  }
  for (const { b, s, tempC, ores, big, roads } of pending) {
    const total = SECTORS.reduce((a, k) => a + s[k], 0) || 1;
    for (const k of SECTORS) s[k] /= total;
    let main = SECTORS.reduce(
      (a, k) => (s[k] / Math.max(0.04, mean[k]) > s[a] / Math.max(0.04, mean[a]) ? k : a),
      "agricultura" as Sector,
    );
    const pickByAuthor = chosen?.get(b.id);
    if (pickByAuthor) {
      // A vocação escolhida passa a pesar mais (sem apagar o resto).
      s[pickByAuthor] = Math.max(s[pickByAuthor], 0.45);
      const t2 = SECTORS.reduce((a, k) => a + s[k], 0);
      for (const k of SECTORS) s[k] /= t2;
      main = pickByAuthor;
    }
    // Renda: setores de mais valor (indústria, serviços, comércio, turismo) e
    // cidades maiores e mais ligadas rendem mais por pessoa.
    const value =
      s.agricultura * 0.6 +
      s.pecuaria * 0.6 +
      s.pesca * 0.6 +
      s.mineracao * 1.1 +
      s.madeira * 0.7 +
      s.industria * 1.5 +
      s.comercio * 1.4 +
      s.turismo * 1.2 +
      s.servicos * 1.7;
    const factor = value * (1 + big * 0.6) * (1 + Math.min(4, roads) * 0.06);
    const perCapita = real ? 6000 + factor * 26000 : 8 + factor * 30;
    const wealth = Math.max(1, Math.min(5, Math.round(factor * 3)));
    const seed = hashSeed(b.id);
    const ranked = [...SECTORS].sort((a, z) => s[z] - s[a]).slice(0, 3);
    const products = [
      ...new Set(
        ranked.flatMap((k, i) => productsFor(k, tempC, era, seed + i, ores).slice(0, i ? 1 : 2)),
      ),
    ];
    cities.set(b.id, { main, chosen: !!pickByAuthor, shares: s, products, perCapita, wealth });
  }

  // Estados: as cidades (pela população) mais o campo (agricultura, pecuária e
  // madeira pelas terras de cada um).
  const states = new Map<string, StateEconomy>();
  const stateShares = new Map<string, Record<Sector, number>>();
  map.states.forEach((st, k) => {
    // Metade da vocação vem das cidades (pela população), metade do campo.
    const s = zero();
    const town = zero();
    let pop = 0;
    let gdp = 0;
    const products = new Map<string, number>();
    for (const b of map.burgs) {
      if (d.owner[cellOf(b.x, b.y)] !== k) continue;
      const e = cities.get(b.id)!;
      const p = population.get(b.id) ?? 0;
      pop += p;
      gdp += p * e.perCapita;
      for (const x of SECTORS) town[x] += e.shares[x] * p;
      e.products.forEach((pr, i) => products.set(pr, (products.get(pr) ?? 0) + p / (i + 1)));
    }
    let rural = 0;
    let farm = 0;
    let graze = 0;
    let forest = 0;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (d.owner[i] !== k) continue;
      const cp = cellPopulation(d, i);
      rural += cp;
      const bio = d.biome[i]!;
      if (FARM.has(bio)) farm += cp;
      else if (GRAZE.has(bio)) graze += cp;
      else if (FOREST.has(bio)) forest += cp;
    }
    s.agricultura += farm * 0.8;
    s.pecuaria += graze * 0.8;
    s.madeira += forest * 0.5;
    const rest = Math.max(0, rural - farm * 0.8 - graze * 0.8 - forest * 0.5);
    s.comercio += rest * 0.1;
    s.servicos += rest * 0.1;
    const ruralTotal = SECTORS.reduce((a, x) => a + s[x], 0) || 1;
    const townTotal = SECTORS.reduce((a, x) => a + town[x], 0);
    for (const x of SECTORS)
      s[x] = townTotal
        ? (s[x] / ruralTotal) * 0.45 + (town[x] / townTotal) * 0.55
        : s[x] / ruralTotal;
    pop += rural;
    gdp += rural * (real ? 9000 : 6);
    const total = SECTORS.reduce((a, x) => a + s[x], 0) || 1;
    for (const x of SECTORS) s[x] /= total;
    stateShares.set(st.id, s);
    states.set(st.id, {
      main: "agricultura",
      shares: s,
      products: [...products]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([p]) => p),
      gdp,
      perCapita: pop ? gdp / pop : 0,
      population: Math.round(pop),
    });
  });
  // Vocação do estado: o setor em que ele mais se destaca entre os estados.
  const smean = zero();
  for (const s of stateShares.values())
    for (const k of SECTORS) smean[k] += s[k] / Math.max(1, stateShares.size);
  for (const [id, s] of stateShares)
    states.get(id)!.main = SECTORS.reduce(
      (a, k) => (s[k] / Math.max(0.03, smean[k]) > s[a] / Math.max(0.03, smean[a]) ? k : a),
      "agricultura" as Sector,
    );
  return { cities, states };
}
