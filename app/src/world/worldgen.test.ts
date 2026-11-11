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

describe("rotas", () => {
  it("estradas geradas têm os três tipos e rotas desenhadas seguem o terreno", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 12 });
    const d = deriveWorld(m);
    const types = new Set(d.roads.map((r) => r.type));
    expect(types.has("principal")).toBe(true);
    expect(types.has("estrada")).toBe(true);
    expect(types.has("trilha")).toBe(true);
    // Duas cidades do mesmo reino (ligadas por terra).
    const cell = (q: { x: number; y: number }) => Math.floor(q.y) * COLS + Math.floor(q.x);
    const a = m.burgs.find((q) => q.id === m.states[0]!.capital)!;
    const b = m.burgs.find(
      (q) =>
        q.id !== a.id &&
        d.owner[cell(q)] === d.owner[cell(a)] &&
        Math.hypot(q.x - a.x, q.y - a.y) > 4,
    )!;
    const withRoute = {
      ...m,
      routes: [
        {
          id: "r1",
          name: "Estrada dos Romeiros",
          type: "estrada" as const,
          points: [
            [a!.x, a!.y],
            [b!.x, b!.y],
          ] as [number, number][],
        },
      ],
    };
    const d2 = deriveWorld(withRoute);
    expect(d2.routes[0]!.points.length).toBeGreaterThan(2);
    const back = parseWorld(serializeWorld(withRoute))!;
    expect(back.routes).toEqual(withRoute.routes);
    const bad = JSON.parse(serializeWorld(withRoute));
    bad.routes.push({
      id: "x",
      name: "Fora",
      type: "voadora",
      points: [
        [1, 1],
        [-5, 2],
      ],
    });
    expect(parseWorld(JSON.stringify(bad))!.routes).toHaveLength(1);
  });
});

describe("planeta inteiro", () => {
  it("converte mapas antigos (só uma região) para a grade do planeta", () => {
    const old = {
      format: 1,
      name: "Antigo",
      cols: 320,
      rows: 200,
      options: { seed: 1 },
      heights: Buffer.from(new Uint8Array(320 * 200).fill(140)).toString("base64"),
      burgs: [{ id: "c1", name: "Velha", x: 160, y: 100 }],
      states: [],
      routes: [
        {
          id: "r1",
          name: "Antiga",
          type: "estrada",
          points: [
            [0, 0],
            [320, 200],
          ],
        },
      ],
    };
    const m = parseWorld(JSON.stringify(old))!;
    expect(m.heights.length).toBe(COLS * ROWS);
    expect(m.burgs[0]).toMatchObject({ x: 180, y: 90 });
    expect(m.routes![0]!.points[1]).toEqual([COLS, ROWS]);
  });

  it("o relevo emenda na longitude 180° (sem degrau na costura)", () => {
    const m = generateWorld(opts(31));
    let jump = 0;
    let inside = 0;
    for (let y = 0; y < ROWS; y++) {
      jump += Math.abs(m.heights[y * COLS]! - m.heights[y * COLS + COLS - 1]!);
      inside += Math.abs(m.heights[y * COLS + 100]! - m.heights[y * COLS + 99]!);
    }
    // A diferença na costura é parecida com a de duas colunas vizinhas quaisquer.
    expect(jump).toBeLessThan(inside * 3 + ROWS * 4);
  });
});

describe("mapa plano sem cortes", () => {
  it("nenhum continente cruza a borda de 180° nem chega aos polos", () => {
    for (const seed of [41, 42, 43]) {
      for (const template of ["continentes", "ilhas", "pangeia"] as const) {
        const m = generateWorld({ ...DEFAULT_OPTIONS, seed, template });
        for (let y = 0; y < ROWS; y++) {
          expect(m.heights[y * COLS]!).toBeLessThan(SEA);
          expect(m.heights[y * COLS + COLS - 1]!).toBeLessThan(SEA);
        }
        for (const y of [0, 1, 2, ROWS - 3, ROWS - 2, ROWS - 1])
          for (let x = 0; x < COLS; x++) expect(m.heights[y * COLS + x]!).toBeLessThan(SEA);
      }
    }
  }, 60000);
});
