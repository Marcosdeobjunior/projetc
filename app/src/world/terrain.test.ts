import { describe, expect, it } from "vitest";
import { cellOf, COLS, DEFAULT_OPTIONS, deriveWorld, generateWorld, ROWS, SEA } from "./worldgen";
import { paintTerrain, settleOnLand } from "./terrain";

/** Maior pedaço de terra com uma célula dada. */
function landAt(h: Uint8Array, start: number) {
  const seen = new Uint8Array(h.length);
  const q = [start];
  seen[start] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k]!;
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ny = y + dy;
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + ((x + dx + COLS) % COLS);
      if (!seen[j] && h[j]! >= SEA) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  return seen;
}

describe("editar terreno", () => {
  it("terra cria ilha, mar separa, montanha sobe, neve gela e lago forma lago", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 61 });
    // Ilha no meio do oceano.
    const sea = m.heights.findIndex(
      (v, i) => v < SEA - 20 && Math.abs(Math.floor(i / COLS) - 90) < 20,
    );
    const sx = (sea % COLS) + 0.5;
    const sy = Math.floor(sea / COLS) + 0.5;
    let h = m.heights;
    for (let k = 0; k < 12; k++) h = paintTerrain(h, sx, sy, 4, "terra", 3);
    expect(h[sea]!).toBeGreaterThanOrEqual(SEA);
    // Um canal de mar corta a terra: as duas pontas deixam de estar ligadas.
    const b = m.burgs[0]!;
    const c = cellOf(b.x, b.y);
    let cut = m.heights;
    for (let y = 0; y < ROWS; y++)
      for (let k = 0; k < 6; k++) cut = paintTerrain(cut, b.x + 3, y + 0.5, 2, "mar", 3);
    const left = landAt(cut, c);
    const right = cellOf(b.x + 6, b.y);
    if (cut[right]! >= SEA) expect(left[right]).toBe(0);
    // Montanha e neve sobem; neve vira gelo no bioma.
    let mt = m.heights;
    for (let k = 0; k < 20; k++) mt = paintTerrain(mt, b.x, b.y, 3, "neve", 3);
    expect(mt[c]!).toBeGreaterThan(m.heights[c]!);
    const d = deriveWorld({ ...m, heights: mt });
    expect([11, 13]).toContain(d.biome[c]);
    // Lago: bacia fechada (em terra, longe das cidades) vira lago no deriveWorld.
    const spot = m.heights.findIndex((v, i) => {
      const x = (i % COLS) + 0.5;
      const y = Math.floor(i / COLS) + 0.5;
      return (
        v > SEA + 20 &&
        // longe do mar (uma bacia colada à costa vira enseada, não lago)
        [-5, 0, 5].every((dy) =>
          [-5, 0, 5].every(
            (dx) =>
              m.heights[(Math.floor(y) + dy) * COLS + ((Math.floor(x) + dx + COLS) % COLS)]! >= SEA,
          ),
        ) &&
        y > 40 &&
        y < 140 &&
        m.burgs.every((q) => Math.hypot(q.x - x, q.y - y) > 6)
      );
    });
    const lx = (spot % COLS) + 0.5;
    const ly = Math.floor(spot / COLS) + 0.5;
    let lk = m.heights;
    for (let k = 0; k < 8; k++) lk = paintTerrain(lk, lx, ly, 3, "lago", 3);
    const d2 = deriveWorld({ ...m, heights: lk });
    expect(d2.lake[spot]!).toBeGreaterThanOrEqual(0);
  }, 60000);

  it("cidades que ficaram no mar vão para a terra mais perto", () => {
    const m = generateWorld({ ...DEFAULT_OPTIONS, seed: 62 });
    const b = m.burgs[1]!;
    let h = m.heights;
    for (let k = 0; k < 10; k++) h = paintTerrain(h, b.x, b.y, 1.5, "mar", 3);
    const next = settleOnLand(m, h);
    const moved = next.burgs.find((x) => x.id === b.id);
    if (moved) expect(h[cellOf(moved.x, moved.y)]!).toBeGreaterThanOrEqual(SEA);
    for (const x of next.burgs) expect(h[cellOf(x.x, x.y)]!).toBeGreaterThanOrEqual(SEA);
  }, 60000);
});
