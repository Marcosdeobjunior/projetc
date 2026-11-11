import { describe, expect, it } from "vitest";
import {
  COLS,
  DEFAULT_OPTIONS,
  deriveWorld,
  generateWorld,
  parseWorld,
  ROWS,
  SEA,
  serializeWorld,
} from "./worldgen";
import { KeyValueFs, MemoryStore } from "../platform/kvFs";
import { readWorldMap, writeWorldMap } from "../state/worldMap";

const opts = (seed: number) => ({ ...DEFAULT_OPTIONS, seed });

describe("mapa-múndi", () => {
  it("gera relevo determinístico com a fração de terra pedida", () => {
    const a = generateWorld(opts(1));
    const b = generateWorld(opts(1));
    expect(Buffer.from(a.heights).equals(Buffer.from(b.heights))).toBe(true);
    const land = a.heights.filter((h) => h >= SEA).length / (COLS * ROWS);
    expect(land).toBeGreaterThan(0.3);
    expect(land).toBeLessThan(0.38);
  });

  it("cria estados com capitais, cidades, rios e estradas", () => {
    const t0 = performance.now();
    const m = generateWorld(opts(2));
    const d = deriveWorld(m);
    const ms = performance.now() - t0;
    expect(m.states.length).toBe(DEFAULT_OPTIONS.states);
    expect(m.burgs.length).toBeGreaterThan(30);
    expect(d.rivers.length).toBeGreaterThan(3);
    expect(d.roads.length).toBeGreaterThan(10);
    // Toda capital está em terra e é dona da própria célula.
    m.states.forEach((s, k) => {
      const cap = m.burgs.find((b) => b.id === s.capital)!;
      const c = Math.floor(cap.y) * COLS + Math.floor(cap.x);
      expect(d.land[c]).toBe(1);
      expect(d.owner[c]).toBe(k);
    });
    expect(ms).toBeLessThan(3000);
  });

  it("grava e lê de volta, e recusa arquivos estranhos", async () => {
    const m = generateWorld(opts(3), "Aerth");
    const back = parseWorld(serializeWorld(m))!;
    expect(back.name).toBe("Aerth");
    expect(back.burgs).toEqual(m.burgs);
    expect(back.states).toEqual(m.states);
    expect(Buffer.from(back.heights).equals(Buffer.from(m.heights))).toBe(true);
    expect(parseWorld("{}")).toBeNull();
    expect(parseWorld("lixo")).toBeNull();
    const bad = JSON.parse(serializeWorld(m));
    bad.states[0].capital = "não existe";
    bad.burgs.push({ id: "x", name: "Fora", x: -5, y: 2 });
    const fixed = parseWorld(JSON.stringify(bad))!;
    expect(fixed.states.length).toBe(m.states.length - 1);
    expect(fixed.burgs.some((b) => b.id === "x")).toBe(false);

    const fs = new KeyValueFs(new MemoryStore(), "browser:teste");
    expect(await readWorldMap(fs)).toBeNull();
    await writeWorldMap(fs, m);
    expect((await readWorldMap(fs))!.burgs.length).toBe(m.burgs.length);
    await writeWorldMap(fs, null);
    expect(await readWorldMap(fs)).toBeNull();
  });
});

describe("mapa-múndi gravado", () => {
  it("relevo editado muda rios e biomas sem quebrar os estados", () => {
    const m = generateWorld(opts(4));
    const flat = { ...m, heights: new Uint8Array(m.heights.length).fill(100) };
    const d = deriveWorld(flat);
    expect(d.land.every((v) => v === 0)).toBe(true);
    expect(d.rivers).toHaveLength(0);
    expect(d.owner.every((v) => v === -1)).toBe(true);
  });
});

describe("rios e portos", () => {
  it("rios terminam na costa, sem entrar no mar", () => {
    for (const seed of [5, 6, 7]) {
      const m = generateWorld({ ...DEFAULT_OPTIONS, seed });
      const d = deriveWorld(m);
      for (const r of d.rivers) {
        // Todas as células do rio são terra.
        for (const c of r.cells) expect(d.land[c]).toBe(1);
        if (r.mouth) {
          const [x, y] = r.mouth;
          const last = r.cells[r.cells.length - 1]!;
          expect(
            Math.hypot(x - ((last % COLS) + 0.5), y - (Math.floor(last / COLS) + 0.5)),
          ).toBeLessThan(1.5);
        }
      }
    }
  });

  it("só cidades à beira do oceano são porto", async () => {
    const { settlementInfo } = await import("./settlement");
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 8, burgs: 120 });
    const d = deriveWorld(m);
    let ports = 0;
    for (const b of m.burgs) {
      const info = settlementInfo(b, false, m.heights, d, {});
      const c = Math.floor(b.y) * COLS + Math.floor(b.x);
      if (info.elements.has("porto")) {
        ports++;
        expect(d.oceanDist[c]).toBeLessThanOrEqual(2);
      }
      if (d.oceanDist[c]! > 2) expect(info.type).not.toBe("Porto");
    }
    expect(ports).toBeGreaterThan(0);
  });
});
