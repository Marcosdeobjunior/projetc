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
import { localGeo, ruralPopulation, settlementInfo } from "./settlement";
import { generateVillage } from "./village";

describe("mundo real × fantasia", () => {
  it("o mundo real muda governos, estradas, marcadores e população das cidades", () => {
    const fantasy = generateWorld({ ...DEFAULT_OPTIONS, seed: 41 });
    const m = withEra(fantasy, "atual");
    for (const s of m.states) expect(FORMS_BY_ERA.atual).toContain(s.form);
    const d = deriveWorld(m);
    expect(d.era).toBe("atual");
    const principal = d.roads.find((r) => r.type === "principal");
    if (principal) expect(principal.name).toMatch(/^Autoestrada/);
    const soc = deriveSociety(m, d);
    expect(soc.markers.some((k) => k.type === "aeroporto")).toBe(true);
    expect(soc.markers.some((k) => k.type === "vulcao" || k.type === "estalagem")).toBe(false);
    const cap = m.burgs.find((b) => b.id === m.states[0]!.capital)!;
    expect(settlementInfo(cap, true, m.heights, d, {}).population).toBeGreaterThan(100000);
    expect(parseWorld(serializeWorld(m))!.options.era).toBe("atual");
    // De volta à fantasia, as formas voltam a ser medievais.
    for (const s of withEra(m, "fantasia").states) expect(FORMS_BY_ERA.fantasia).toContain(s.form);
    // Um arquivo com uma época que não existe mais abre como fantasia.
    const raw = JSON.parse(serializeWorld(m));
    raw.options.era = "futurista";
    expect(parseWorld(JSON.stringify(raw))!.options.era).toBeUndefined();
  }, 60000);

  it("população, aquecimento, cidades e prédios", () => {
    const f = generateWorld({ ...DEFAULT_OPTIONS, seed: 41 });
    const res = (["fantasia", "atual"] as const).map((era) => {
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
        urban: d.biome.filter((b) => b === 14).length,
        floors: Math.max(...v.buildings.map((b) => b.floors)),
      };
    });
    const [old, now] = res as [(typeof res)[0], (typeof res)[0]];
    expect(now.pop).toBeGreaterThan(old.pop * 5);
    expect(now.temp).toBeGreaterThan(old.temp);
    expect(old.urban).toBe(0);
    expect(now.urban).toBeGreaterThan(0);
    expect(old.floors).toBeLessThanOrEqual(3);
    expect(now.floors).toBeGreaterThan(3);
  }, 60000);
});
