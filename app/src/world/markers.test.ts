import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  deriveWorld,
  generateWorld,
  parseWorld,
  serializeWorld,
} from "./worldgen";
import { deriveSociety, markerIcon } from "./society";

describe("marcadores do autor", () => {
  it("aparecem, escondem os gerados trocados e voltam do arquivo", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 51 });
    const d = deriveWorld(m);
    const gen = deriveSociety(m, d).markers;
    const first = gen[0]!;
    const edited = {
      ...m,
      markers: [
        {
          id: "m1",
          type: "caverna",
          icon: "🐉",
          name: "Toca do Dragão",
          legend: "Cuidado.",
          x: 10,
          y: 80,
        },
      ],
      hiddenMarkers: [first.key],
    };
    const soc = deriveSociety(edited, d);
    expect(soc.markers.some((k) => k.key === first.key)).toBe(false);
    const mine = soc.markers.find((k) => k.key === "m1")!;
    expect(mine).toMatchObject({ user: true, type: "caverna", name: "Toca do Dragão" });
    expect(markerIcon(mine)).toBe("🐉");
    const back = parseWorld(serializeWorld(edited))!;
    expect(back.markers).toEqual(edited.markers);
    expect(back.hiddenMarkers).toEqual([first.key]);
    // Tipo desconhecido vira ruínas (o arquivo pode vir de outra versão).
    const odd = deriveSociety({ ...edited, markers: [{ ...edited.markers[0]!, type: "xyz" }] }, d);
    expect(odd.markers.find((k) => k.key === "m1")!.type).toBe("ruinas");
  }, 60000);
});
