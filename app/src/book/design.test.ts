import { describe, expect, it } from "vitest";
import { coverSpread, DEFAULT_DESIGN, estimatePages, spineWidth } from "./design";

describe("projeto gráfico", () => {
  it("estima páginas e lombada de um romance comum", () => {
    // ~60 mil palavras em 14×21 dá por volta de 220–300 páginas.
    const pages = estimatePages(DEFAULT_DESIGN.layout, 60_000, 20);
    expect(pages).toBeGreaterThan(200);
    expect(pages).toBeLessThan(320);
    expect(pages % 2).toBe(0);
    // 240 páginas em pólen: ~16 mm de lombada.
    expect(spineWidth(DEFAULT_DESIGN.layout, 240)).toBeCloseTo(16.2, 1);
  });

  it("monta a capa aberta com sangria e orelhas", () => {
    const d = { ...DEFAULT_DESIGN, cover: { ...DEFAULT_DESIGN.cover, flaps: true, flapWidth: 80 } };
    const s = coverSpread(d, 240);
    expect(s.parts.map((p) => p.part)).toEqual(["flapBack", "back", "spine", "front", "flapFront"]);
    expect(s.width).toBeCloseTo(3 + 80 + 140 + 16.2 + 140 + 80 + 3, 1);
    expect(s.height).toBe(216);
  });
});
