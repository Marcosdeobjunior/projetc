import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, deriveWorld, generateWorld, withEra } from "./worldgen";
import { deriveSociety } from "./society";
import { settlementInfo } from "./settlement";
import { computeEconomy, SECTORS } from "./economy";

function setup(era: "fantasia" | "atual") {
  const m = withEra(generateWorld({ ...DEFAULT_OPTIONS, seed: 71 }), era);
  const d = deriveWorld(m);
  const society = deriveSociety(m, d);
  const caps = new Set(m.states.map((s) => s.capital));
  const population = new Map(
    m.burgs.map((b) => [b.id, settlementInfo(b, caps.has(b.id), m.heights, d, {}).population]),
  );
  return { m, d, society, population };
}

describe("economia", () => {
  it("cidades com caminhos diferentes, pelo lugar, e estados com PIB", () => {
    const { m, d, society, population } = setup("atual");
    const e = computeEconomy({ map: m, d, society, population });
    const mains = new Set([...e.cities.values()].map((c) => c.main));
    expect(mains.size).toBeGreaterThanOrEqual(5);
    for (const c of e.cities.values()) {
      const sum = SECTORS.reduce((a, s) => a + c.shares[s], 0);
      expect(sum).toBeCloseTo(1, 5);
      expect(c.products.length).toBeGreaterThan(0);
      expect(c.wealth).toBeGreaterThanOrEqual(1);
      expect(c.wealth).toBeLessThanOrEqual(5);
    }
    // Cidades pesqueiras ficam à beira d'água.
    for (const b of m.burgs)
      if (e.cities.get(b.id)!.main === "pesca") {
        const c = Math.floor(b.y) * 360 + Math.floor(b.x);
        expect(d.coastDist[c]!).toBeLessThanOrEqual(3);
      }
    for (const st of m.states) expect(e.states.get(st.id)!.gdp).toBeGreaterThan(0);
  }, 60000);

  it("a vocação escolhida pelo autor vale", () => {
    const { m, d, society, population } = setup("fantasia");
    const b = m.burgs[0]!;
    const e = computeEconomy({
      map: m,
      d,
      society,
      population,
      chosen: new Map([[b.id, "turismo"]]),
    });
    expect(e.cities.get(b.id)).toMatchObject({ main: "turismo", chosen: true });
  }, 60000);

  it("há estados ricos e pobres, e o autor pode mudar a riqueza e a vocação", () => {
    const { m, d, society, population } = setup("atual");
    const e = computeEconomy({ map: m, d, society, population });
    const list = [...e.states.values()];
    const tiers = new Set(list.map((s) => s.wealth));
    expect(tiers.has("rico")).toBe(true);
    expect(tiers.has("pobre")).toBe(true);
    const per = list.map((s) => s.perCapita).sort((a, b) => a - b);
    expect(per[per.length - 1]! / per[0]!).toBeGreaterThan(2);
    const poorest = list.find((s) => s.rank === list.length)!;
    const id = [...e.states.entries()].find(([, v]) => v === poorest)![0];
    const e2 = computeEconomy({
      map: m,
      d,
      society,
      population,
      stateChoices: new Map([[id, { riqueza: "rico", vocacao: "turismo" }]]),
    });
    expect(e2.states.get(id)).toMatchObject({
      wealth: "rico",
      wealthChosen: true,
      main: "turismo",
      chosen: true,
    });
    expect(e2.states.get(id)!.perCapita).toBeGreaterThan(poorest.perCapita * 3);
  }, 60000);
});
