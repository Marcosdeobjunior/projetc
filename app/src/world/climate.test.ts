import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIMATE,
  DEFAULT_OPTIONS,
  deriveWorld,
  generateWorld,
  normalizeClimate,
  parseWorld,
  seaLevelTemp,
  serializeWorld,
  COLS,
  ROWS,
} from "./worldgen";

const avg = (a: Float32Array, land: Uint8Array) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++)
    if (land[i]) {
      s += a[i]!;
      n++;
    }
  return s / n;
};

describe("clima do planeta", () => {
  it("equador quente, polos frios, e cada polo com a sua temperatura", () => {
    const c = { ...DEFAULT_CLIMATE, equator: 30, northPole: -10, southPole: -40 };
    expect(seaLevelTemp(c, 0)).toBe(30);
    expect(seaLevelTemp(c, 90)).toBeCloseTo(-10);
    expect(seaLevelTemp(c, -90)).toBeCloseTo(-40);
    expect(seaLevelTemp(c, 45)).toBeGreaterThan(seaLevelTemp(c, 60));
    expect(seaLevelTemp(c, -45)).toBeLessThan(seaLevelTemp(c, 45));
  });

  it("muda temperatura e chuva do mapa e é gravado", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 31 });
    const d = deriveWorld(m);
    const hot = deriveWorld({
      ...m,
      climate: { ...DEFAULT_CLIMATE, equator: 38, northPole: 5, southPole: 5 },
    });
    const dry = deriveWorld({ ...m, climate: { ...DEFAULT_CLIMATE, precipitation: 40 } });
    expect(avg(hot.tempC, hot.land)).toBeGreaterThan(avg(d.tempC, d.land) + 5);
    expect(avg(dry.moist, dry.land)).toBeLessThan(avg(d.moist, d.land) * 0.6);
    // Temperatura cai do equador para o norte (linhas de mar, sem relevo).
    const row = (y: number) => d.tempC[y * COLS]!;
    expect(row(ROWS / 2)).toBeGreaterThan(row(30));
    const back = parseWorld(
      serializeWorld({ ...m, climate: { ...DEFAULT_CLIMATE, southPole: -35 } }),
    )!;
    expect(back.climate?.southPole).toBe(-35);
    expect(normalizeClimate({ equator: 999, winds: [10] }).equator).toBe(50);
  }, 60000);
});
