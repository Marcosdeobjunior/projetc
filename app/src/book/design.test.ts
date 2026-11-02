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

describe("segurança do projeto gráfico", () => {
  it("recusa valores estranhos vindos do arquivo", async () => {
    const { sanitizeDesign, DEFAULT_DESIGN: D } = await import("./design");
    const d = sanitizeDesign({
      cover: {
        background: "red;}</style>",
        image: "../../x.png",
        titleFont: "comic",
        synopsis: "ok",
      },
      layout: { marginTop: "0}</style><b id=x>", trim: "huge", size: 11, ornament: "✦" },
    });
    expect(d.cover.background).toBe(D.cover.background);
    expect(d.cover.image).toBe("");
    expect(d.cover.titleFont).toBe(D.cover.titleFont);
    expect(d.cover.synopsis).toBe("ok");
    expect(d.layout.marginTop).toBe(D.layout.marginTop);
    expect(d.layout.trim).toBe(D.layout.trim);
    expect(d.layout.size).toBe(11);
    expect(d.layout.ornament).toBe("✦");
  });

  it("o título não fecha a tag <style> do PDF", async () => {
    const { cssString } = await import("../export/html");
    const s = cssString('Livro</style><img src=x onerror=alert(1)>"\\');
    expect(s).not.toMatch(/<|>/);
    expect(s.slice(1, -1)).not.toMatch(/(^|[^\\])"/);
  });
});
