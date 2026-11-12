import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  deriveWorld,
  FORMS_BY_ERA,
  generateWorld,
  parseWorld,
  serializeWorld,
  withEra,
} from "./worldgen";
import { deriveSociety } from "./society";
import { settlementInfo } from "./settlement";

describe("épocas do mapa", () => {
  it("atual e futurista mudam governos, estradas, marcadores e população", () => {
    const fantasy = generateWorld({ ...DEFAULT_OPTIONS, seed: 41 });
    for (const era of ["atual", "futurista"] as const) {
      const m = withEra(fantasy, era);
      for (const s of m.states) expect(FORMS_BY_ERA[era]).toContain(s.form);
      const d = deriveWorld(m);
      expect(d.era).toBe(era);
      const principal = d.roads.find((r) => r.type === "principal");
      if (principal)
        expect(principal.name).toMatch(era === "atual" ? /^Autoestrada/ : /^Linha Maglev/);
      const soc = deriveSociety(m, d);
      expect(soc.markers.some((k) => k.type === (era === "atual" ? "aeroporto" : "elevador"))).toBe(
        true,
      );
      expect(soc.markers.some((k) => k.type === "vulcao" || k.type === "estalagem")).toBe(false);
      const cap = m.burgs.find((b) => b.id === m.states[0]!.capital)!;
      expect(settlementInfo(cap, true, m.heights, d, {}).population).toBeGreaterThan(100000);
      expect(parseWorld(serializeWorld(m))!.options.era).toBe(era);
    }
    // De volta à fantasia, as formas voltam a ser medievais.
    const back = withEra(withEra(fantasy, "futurista"), "fantasia");
    for (const s of back.states) expect(FORMS_BY_ERA.fantasia).toContain(s.form);
  }, 60000);
});
