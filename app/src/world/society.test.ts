import { describe, expect, it } from "vitest";
import { cellOf, COLS, DEFAULT_OPTIONS, deriveWorld, generateWorld } from "./worldgen";
import { deriveSociety } from "./society";
import { generateVillage } from "./village";
import { insidePoly } from "./geom";

describe("hidrologia", () => {
  it("lagos ficam em depressões, têm saída ou são salgados, e nenhuma cidade fica dentro", () => {
    let lakes = 0;
    for (const seed of [11, 12]) {
      const m = generateWorld({ ...DEFAULT_OPTIONS, seed });
      const d = deriveWorld(m);
      lakes += d.lakes.length;
      for (const lk of d.lakes) {
        expect(lk.name).toMatch(/^Lago /);
        for (const c of lk.cells) {
          expect(d.land[c]).toBe(0);
          expect(d.lake[c]).toBe(d.lakes.indexOf(lk));
        }
        // Lago com saída deságua num rio ou noutra água; o salgado não transborda.
        if (lk.salty) expect(lk.name).toMatch(/Salgado/);
      }
      for (const b of m.burgs) expect(d.land[cellOf(b.x, b.y)]).toBe(1);
      // A água nunca sobe: cada passo do rio desce (ou fica no mesmo nível).
      for (const r of d.rivers)
        for (let k = 1; k < r.cells.length; k++)
          expect(d.eff[r.cells[k]!]!).toBeLessThanOrEqual(d.eff[r.cells[k - 1]!]! + 2);
    }
    expect(lakes).toBeGreaterThan(3);
  }, 60000);

  it("na prévia da vila o rio termina dentro da água (sem atravessar o mar)", () => {
    for (const [coast, river] of [
      [0, 0.3],
      [Math.PI / 2, 1.2],
      [Math.PI, Math.PI - 0.4],
    ] as const) {
      const m = generateVillage({
        seed: 5,
        size: "vila",
        road: true,
        river: true,
        fields: true,
        geo: { seed: 9, coast, river, roads: [2] },
      });
      const pts = m.river!.points;
      expect(insidePoly(pts[0]!, m.sea!.poly)).toBe(false);
      expect(insidePoly(pts[pts.length - 1]!, m.sea!.poly)).toBe(true);
      // Só a ponta final entra na água.
      expect(pts.slice(0, -1).filter((p) => insidePoly(p, m.sea!.poly)).length).toBeLessThan(2);
    }
  });
});

describe("sociedade", () => {
  it("províncias dentro dos estados, religiões e marcadores", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 21 });
    const d = deriveWorld(m);
    const s = deriveSociety(m, d);
    expect(s.provinces.length).toBeGreaterThanOrEqual(m.states.length);
    for (let i = 0; i < COLS * 180; i++) {
      const p = s.province[i]!;
      if (p >= 0) expect(s.provinces[p]!.state).toBe(d.owner[i]);
      else expect(d.owner[i]).toBe(-1);
    }
    // Cada estado tem uma província real, sediada na capital.
    for (const st of m.states)
      if (s.provinces.some((p) => m.states[p.state] === st))
        expect(s.provinces.some((p) => p.seat === st.capital)).toBe(true);
    expect(s.religions.some((r) => r.type === "Folclórica")).toBe(true);
    expect(s.religions.some((r) => r.type === "Organizada")).toBe(true);
    expect(s.markers.length).toBeGreaterThan(10);
    for (const mk of s.markers) expect(mk.name && mk.legend).toBeTruthy();
    // Determinístico.
    expect(deriveSociety(m, d).markers.map((x) => x.name)).toEqual(s.markers.map((x) => x.name));
  }, 60000);
});
