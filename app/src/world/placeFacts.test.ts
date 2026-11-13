import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, deriveWorld, generateWorld } from "./worldgen";
import { climateName, placeFacts } from "./placeFacts";

describe("população e clima lidos do mapa", () => {
  const map = generateWorld({ ...DEFAULT_OPTIONS, seed: 9, states: 3, burgs: 12 });
  map.burgs.forEach((b, i) => (b.noteId = `c${i}`));
  map.states.forEach((s, i) => (s.noteId = `e${i}`));
  const d = deriveWorld(map);
  const none = () => ({});

  it("cidade: população do povoado e clima do lugar; troca à mão vale", () => {
    const f = placeFacts(map, d, "c0", none)!;
    expect(f.source).toBe("cidade");
    expect(f.population).toBeGreaterThan(0);
    expect(f.climate).toMatch(/média de -?\d+ °C/);
    const edited = placeFacts(map, d, "c0", (id): Record<string, string> =>
      id === "c0" ? { populacao: "1234" } : {},
    )!;
    expect(edited.population).toBe(1234);
  });

  it("estado soma as cidades e o campo", () => {
    const s = placeFacts(map, d, "e0", none)!;
    expect(s.source).toBe("estado");
    const cities = map.burgs
      .map((_, i) => placeFacts(map, d, `c${i}`, none)!)
      .reduce((a, f) => a + f.population, 0);
    const all = map.states.reduce(
      (a, _, i) => a + placeFacts(map, d, `e${i}`, none)!.population,
      0,
    );
    expect(s.population).toBeGreaterThan(0);
    expect(all).toBeGreaterThan(cities * 0.5);
  });

  it("lugar fora do mapa não tem fatos, e o nome do clima segue temperatura e chuva", () => {
    expect(placeFacts(map, d, "outro", none)).toBeNull();
    expect(climateName(27, 0.8)).toBe("Tropical muito úmido");
    expect(climateName(-15, 0.1)).toBe("Polar árido");
  });
});
