import { describe, expect, it } from "vitest";
import { COLS, DEFAULT_OPTIONS, deriveWorld, generateWorld } from "./worldgen";

describe("cidades no interior", () => {
  it("pelo menos 40% das cidades ficam longe do mar", () => {
    for (const seed of [3, 4, 5]) {
      const m = generateWorld({ ...DEFAULT_OPTIONS, seed });
      const d = deriveWorld(m);
      const inland = m.burgs.filter(
        (b) => d.oceanDist[Math.floor(b.y) * COLS + Math.floor(b.x)]! > 3,
      ).length;
      expect(inland / m.burgs.length).toBeGreaterThan(0.4);
    }
  }, 60000);
});
