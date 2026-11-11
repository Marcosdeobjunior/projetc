import { rng } from "./geom";

/*
 * Brasão ou bandeira gerados a partir de uma semente: campo, divisão e uma
 * figura, seguindo a regra das cores da heráldica (metal sobre cor ou cor
 * sobre metal). Gravado como opções (campo `brasao` da nota, JSON).
 */

export type EmblemKind = "brasao" | "bandeira";

export interface EmblemOptions {
  seed: number;
  kind: EmblemKind;
}

export const METALS = ["#d6a92e", "#ece6d6"] as const; // ouro, prata
export const COLOURS = ["#a8322c", "#2b5797", "#2f7a3e", "#6a3b7c", "#262421"] as const; // goles, blau, sinople, púrpura, sable

export type Division = "pleno" | "partido" | "cortado" | "banda" | "esquartelado" | "chaveirao";
export type Charge = "estrela" | "besante" | "crescente" | "torre" | "cruz" | "nenhuma";

export interface Emblem {
  kind: EmblemKind;
  /** Cores do campo (a segunda só nas divisões). */
  field: [string, string];
  division: Division;
  charge: Charge;
  chargeColor: string;
}

const DIVISIONS: Division[] = ["pleno", "partido", "cortado", "banda", "esquartelado", "chaveirao"];
const CHARGES: Charge[] = ["estrela", "besante", "crescente", "torre", "cruz", "nenhuma"];

export function parseEmblemOptions(raw: string | undefined): EmblemOptions | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<EmblemOptions>;
    if (typeof o.seed !== "number" || !Number.isFinite(o.seed)) return null;
    return { seed: o.seed >>> 0, kind: o.kind === "bandeira" ? "bandeira" : "brasao" };
  } catch {
    return null;
  }
}

export function generateEmblem(o: EmblemOptions): Emblem {
  const rand = rng(o.seed ^ 0x9e3779b9);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const metalField = rand() < 0.5;
  const metal = pick(METALS);
  const colour = pick(COLOURS);
  const division = pick(DIVISIONS);
  // Campo dividido: metal e cor; a figura vai de uma das duas.
  const field: [string, string] = metalField ? [metal, colour] : [colour, metal];
  let charge = pick(CHARGES);
  if (division === "esquartelado" && charge === "cruz") charge = "estrela";
  const chargeColor =
    division === "pleno"
      ? metalField
        ? pick(COLOURS)
        : pick(METALS)
      : rand() < 0.5
        ? pick(METALS)
        : "#262421";
  return { kind: o.kind, field, division, charge, chargeColor };
}
