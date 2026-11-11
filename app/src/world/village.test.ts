import { describe, expect, it } from "vitest";
import { defaultMapOptions, generateVillage, parseMapOptions } from "./village";
import { generateEmblem, parseEmblemOptions } from "./heraldry";
import { insidePoly, overlaps } from "./geom";
import { buildScene, walkable } from "../ui/StreetView";

describe("mapa da região", () => {
  it("é determinístico pela semente", () => {
    const a = generateVillage(defaultMapOptions(42));
    const b = generateVillage(defaultMapOptions(42));
    const c = generateVillage(defaultMapOptions(43));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("cidade tem mais casas que aldeia, e casas não se sobrepõem", () => {
    const aldeia = generateVillage({ ...defaultMapOptions(7), size: "aldeia" });
    const cidade = generateVillage({ ...defaultMapOptions(7), size: "cidade" });
    expect(cidade.buildings.length).toBeGreaterThan(aldeia.buildings.length * 2);
    const bs = cidade.buildings;
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++)
        expect(overlaps(bs[i]!.corners, bs[j]!.corners)).toBe(false);
  });

  it("respeita as opções de rio e campos", () => {
    const m = generateVillage({ ...defaultMapOptions(5), river: false, fields: false });
    expect(m.river).toBeNull();
    expect(m.fields).toHaveLength(0);
  });

  it("lê opções gravadas e recusa lixo", () => {
    expect(parseMapOptions('{"seed":3,"size":"cidade","river":false}')).toMatchObject({
      seed: 3,
      size: "cidade",
      road: true,
      river: false,
      fields: true,
    });
    expect(parseMapOptions('{"size":"vila"}')).toBeNull();
    expect(parseMapOptions("não é json")).toBeNull();
    expect(parseMapOptions('{"seed":3,"size":"metrópole"}')!.size).toBe("vila");
  });

  it("a vista de rua não deixa entrar nas casas", () => {
    const m = generateVillage(defaultMapOptions(11));
    const b = m.buildings[0]!;
    expect(insidePoly(b.center, b.corners)).toBe(true);
    expect(walkable(m, b.center)).toBe(false);
    expect(buildScene(m).length).toBeGreaterThan(m.buildings.length * 8);
  });
});

describe("elementos do povoado", () => {
  it("muralha, cidadela, praça e templo aparecem e as casas desviam deles", () => {
    const o = { ...defaultMapOptions(21), size: "cidade" as const };
    const m = generateVillage({ ...o, walls: true, citadel: true, plaza: true, temple: true });
    expect(m.wall?.length).toBeGreaterThan(8);
    expect(m.citadel).toHaveLength(4);
    expect(m.plaza).not.toBeNull();
    expect(m.buildings.filter((b) => b.kind === "templo")).toHaveLength(1);
    for (const b of m.buildings) {
      expect(overlaps(b.corners, m.citadel!)).toBe(false);
      for (const c of b.corners)
        expect(Math.hypot(c[0] - m.plaza!.x, c[1] - m.plaza!.y)).toBeGreaterThan(m.plaza!.r);
    }
    const plain = generateVillage(o);
    expect(plain.wall).toBeNull();
    expect(plain.citadel).toBeNull();
  });
});

describe("brasão e bandeira", () => {
  it("são determinísticos e leem as opções gravadas", () => {
    const o = parseEmblemOptions('{"seed":9,"kind":"bandeira"}')!;
    expect(o).toEqual({ seed: 9, kind: "bandeira" });
    expect(generateEmblem(o)).toEqual(generateEmblem({ seed: 9, kind: "bandeira" }));
    expect(parseEmblemOptions("{}")).toBeNull();
  });
});
