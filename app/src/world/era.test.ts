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

describe("épocas: mundo de verdade", () => {
  it("população, aquecimento, mar mais alto, cidades e lavouras", async () => {
    const { ruralPopulation } = await import("./settlement");
    const { generateVillage } = await import("./village");
    const { localGeo } = await import("./settlement");
    const f = generateWorld({ ...DEFAULT_OPTIONS, seed: 41 });
    const res = (["fantasia", "atual", "futurista"] as const).map((era) => {
      const m = withEra(f, era);
      const d = deriveWorld(m);
      let t = 0;
      let k = 0;
      for (let i = 0; i < d.land.length; i++)
        if (d.land[i]) {
          t += d.tempC[i]!;
          k++;
        }
      const v = generateVillage({
        seed: 3,
        size: "cidade",
        road: true,
        river: false,
        fields: true,
        geo: localGeo(m.burgs[0]!, d),
      });
      return {
        pop: ruralPopulation(d),
        temp: t / k,
        land: k,
        urban: d.biome.filter((b) => b === 14).length,
        floors: Math.max(...v.buildings.map((b) => b.floors)),
      };
    });
    const [old, now, future] = res as [(typeof res)[0], (typeof res)[0], (typeof res)[0]];
    expect(now.pop).toBeGreaterThan(old.pop * 5);
    expect(now.temp).toBeGreaterThan(old.temp);
    expect(future.temp).toBeGreaterThan(now.temp);
    expect(future.land).toBeLessThan(now.land); // o mar subiu
    expect(old.urban).toBe(0);
    expect(now.urban).toBeGreaterThan(0);
    expect(old.floors).toBeLessThanOrEqual(3);
    expect(future.floors).toBeGreaterThan(now.floors);
  }, 60000);
});
